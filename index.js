import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        anchorInject: true,
        oocDetect: true,
        charState: true,
        messageEdit: true,
    },
    anchorKeywords: [],
    injectMode: 'temporary',
    autoInjectInterval: 5,
    oocThreshold: 0.7,
    currentLLM: 'openai',
};

const appState = {
    expandedTab: null,
    charStates: {
        emotion: 'neutral',
        emotionHistory: [],
        customFields: {},
        lastMessageCount: 0,
    },
};

function extractCharacterAnchors(context) {
    if (!context) return null;
    
    return {
        name: context.name || '未知角色',
        description: context.description || '',
        personality: context.personality || '',
        scenario: context.scenario || '',
        first_mes: context.first_mes || '',
        avatar: context.avatar || '',
        tags: context.tags || [],
        chat: context.chat || [],
        corePoints: extractCorePoints(context),
    };
}

function extractCorePoints(context) {
    const points = [];
    
    if (context.description) {
        const descPoints = context.description.split(/[\n.。；;]+/).filter(p => p.trim().length > 8);
        points.push(...descPoints.slice(0, 6));
    }
    
    if (context.personality) {
        const personalityPoints = context.personality.split(/[\n.。；;]+/).filter(p => p.trim().length > 5);
        points.push(...personalityPoints.slice(0, 4));
    }
    
    if (context.scenario) {
        const scenarioPoints = context.scenario.split(/[\n.。；;]+/).filter(p => p.trim().length > 10);
        points.push(...scenarioPoints.slice(0, 2));
    }
    
    return points.filter(p => p.length > 5).slice(0, 10);
}

function generateWeightedAnchor(anchors, mode = 'temporary') {
    const name = anchors.name;
    const settings = extension_settings[extensionName];
    const llm = settings?.currentLLM || 'openai';
    const userKeywords = settings?.anchorKeywords || [];
    
    let weightText = '';
    let header = '';
    
    switch(mode) {
        case 'emergency':
            header = '【最高优先级 - 绝对不可违背】';
            break;
        case 'continuous':
            header = '【持续锚点 - 每次回复必须遵守】';
            break;
        default:
            header = '【设定提醒 - 本次回复需遵守】';
    }
    
    switch(llm) {
        case 'claude':
            weightText = generateClaudeAnchor(anchors, header, userKeywords);
            break;
        case 'openai':
            weightText = generateOpenAIAnchor(anchors, header, userKeywords);
            break;
        case 'kobold':
            weightText = generateKoboldAnchor(anchors, header, userKeywords);
            break;
        default:
            weightText = generateGenericAnchor(anchors, header, userKeywords);
    }
    
    return weightText;
}

function generateClaudeAnchor(anchors, header, userKeywords) {
    let text = `\n\n${header}\n\n`;
    text += `<important>\n角色名称: ${anchors.name}\n</important>\n\n`;
    
    if (anchors.corePoints.length > 0) {
        text += `<character_core>\n`;
        anchors.corePoints.forEach((point, idx) => {
            text += `${idx + 1}. ${point.trim()}\n`;
        });
        text += `</character_core>\n\n`;
    }
    
    if (userKeywords.length > 0) {
        text += `<user_requirements>\n`;
        userKeywords.forEach(keyword => {
            text += `- ${keyword}\n`;
        });
        text += `</user_requirements>\n\n`;
    }
    
    text += `<reminder>回复时必须保持与 ${anchors.name} 的角色设定完全一致</reminder>\n`;
    
    return text;
}

function generateOpenAIAnchor(anchors, header, userKeywords) {
    let text = `\n\n${header}\n\n`;
    text += `### 角色信息\n`;
    text += `角色名称: ${anchors.name}\n\n`;
    
    text += `### 核心设定 (必须遵守)\n`;
    if (anchors.corePoints.length > 0) {
        anchors.corePoints.forEach((point, idx) => {
            text += `${idx + 1}. ${point.trim()}\n`;
        });
        text += `\n`;
    }
    
    if (userKeywords.length > 0) {
        text += `### 用户设定要求\n`;
        userKeywords.forEach(keyword => {
            text += `- ${keyword}\n`;
        });
        text += `\n`;
    }
    
    text += `[重要提醒] 回复时必须保持与 ${anchors.name} 的角色设定完全一致\n`;
    
    return text;
}

function generateKoboldAnchor(anchors, header, userKeywords) {
    let text = `\n\n${header}\n\n`;
    text += `INSTRUCTION: You are ${anchors.name}.\n\n`;
    
    if (anchors.corePoints.length > 0) {
        text += `CHARACTER TRAITS:\n`;
        anchors.corePoints.forEach((point, idx) => {
            text += `[${idx + 1}] ${point.trim()}\n`;
        });
        text += `\n`;
    }
    
    if (userKeywords.length > 0) {
        text += `REQUIREMENTS:\n`;
        userKeywords.forEach(keyword => {
            text += `- ${keyword}\n`;
        });
        text += `\n`;
    }
    
    text += `IMPORTANT: Stay in character as ${anchors.name} at all times.\n`;
    
    return text;
}

function generateGenericAnchor(anchors, header, userKeywords) {
    let text = `\n\n${header}\n\n`;
    text += `角色: ${anchors.name}\n\n`;
    
    if (anchors.corePoints.length > 0) {
        text += `【核心设定】\n`;
        anchors.corePoints.forEach((point, idx) => {
            text += `• ${point.trim()}\n`;
        });
        text += `\n`;
    }
    
    if (userKeywords.length > 0) {
        text += `【额外要求】\n`;
        userKeywords.forEach(keyword => {
            text += `• ${keyword}\n`;
        });
        text += `\n`;
    }
    
    text += `请保持角色设定一致\n`;
    
    return text;
}

function detectOOC() {
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return { conflicts: [], lastMessage: null, characterInfo: null };
    }
    
    const lastAIMsg = context.chat.filter(m => !m.is_user).slice(-1)[0];
    if (!lastAIMsg || !lastAIMsg.mes) {
        return { conflicts: [], lastMessage: null, characterInfo: null };
    }
    
    const msg = lastAIMsg.mes;
    const anchors = extractCharacterAnchors(context);
    if (!anchors) {
        return { conflicts: [], lastMessage: msg, characterInfo: null };
    }
    
    const conflicts = [];
    const personality = (anchors.personality + ' ' + anchors.description).toLowerCase();
    
    if ((personality.includes('哑巴') || personality.includes('不说话') || personality.includes('沉默') || personality.includes('无法说话')) && 
        (msg.includes('说') || msg.includes('道') || msg.includes('回答') || msg.includes('回答道') || msg.includes('道')) &&
        !msg.includes('*不说话*') && !msg.includes('*沉默*')) {
        conflicts.push({
            type: 'speech',
            message: '角色设定为沉默/哑巴，但回复中出现了对话行为',
            severity: 'high',
            suggestion: '请使用动作、表情或无声反应来表达，而非说话'
        });
    }
    
    if ((personality.includes('害羞') || personality.includes('内向') || personality.includes('腼腆')) && 
        (msg.includes('大笑') || msg.includes('热情拥抱') || msg.includes('主动亲吻') || msg.includes('大胆')) &&
        !msg.includes('脸红')) {
        conflicts.push({
            type: 'behavior',
            message: '角色设定为害羞/内向，但表现出过于外向的行为',
            severity: 'medium',
            suggestion: '请表现得更害羞、更犹豫一些，增加脸红、低头等细节'
        });
    }
    
    if ((personality.includes('冷酷') || personality.includes('冷漠') || personality.includes('高冷')) && 
        (msg.includes('温柔地') || msg.includes('关心地') || msg.includes('体贴地') || msg.includes('热情地')) &&
        !msg.includes('面无表情')) {
        conflicts.push({
            type: 'emotion',
            message: '角色设定为冷酷/高冷，但表现出温柔情感',
            severity: 'medium',
            suggestion: '请保持冷淡的态度，减少情感表达，语言简洁'
        });
    }
    
    if ((personality.includes('年幼') || personality.includes('小孩') || personality.includes('儿童')) && 
        (msg.includes('成熟地') || msg.includes('老练地') || msg.includes('像大人一样')) &&
        !msg.includes('*装成熟*')) {
        conflicts.push({
            type: 'age',
            message: '角色设定为年幼，但表现出过于成熟的言行',
            severity: 'high',
            suggestion: '请保持童真，用更简单、更天真的方式表达'
        });
    }
    
    if ((personality.includes('年老') || personality.includes('老者') || personality.includes('老人')) && 
        (msg.includes('活泼地') || msg.includes('蹦蹦跳跳') || msg.includes('像年轻人一样')) &&
        !msg.includes('*回忆*') && !msg.includes('*叹气*')) {
        conflicts.push({
            type: 'age',
            message: '角色设定为年长，但表现出过于活泼的行为',
            severity: 'medium',
            suggestion: '请表现得更沉稳，用更稳重的方式表达'
        });
    }
    
    if (msg.length > 10 && msg.length < 30 && !anchors.first_mes) {
        conflicts.push({
            type: 'length',
            message: `回复较短（${msg.length}字），可能不够丰富`,
            severity: 'low',
            suggestion: '建议增加环境描写、动作细节或心理活动'
        });
    }
    
    if (anchors.chat.length > 5) {
        const userMessages = anchors.chat.filter(m => m.is_user);
        const recentUserMsgs = userMessages.slice(-3).map(m => m.mes || '').join('');
        if (recentUserMsgs.includes('角色名') || recentUserMsgs.includes(anchors.name + '？') || recentUserMsgs.includes(anchors.name + '。')) {
            if (!msg.includes(anchors.name) && !anchors.name.includes('...')) {
                conflicts.push({
                    type: 'identity',
                    message: '用户多次称呼角色，但回复中未提及角色名',
                    severity: 'low',
                    suggestion: '建议在回复开头使用角色名进行回应'
                });
            }
        }
    }
    
    return { 
        conflicts, 
        lastMessage: msg,
        characterInfo: {
            name: anchors.name,
            corePoints: anchors.corePoints.slice(0, 3)
        }
    };
}

function generateFixSuggestions(conflicts) {
    if (!conflicts || conflicts.length === 0) return [];
    const suggestions = conflicts.map(c => c.suggestion).filter(Boolean);
    return [...new Set(suggestions)];
}

function extractEmotionsFromHistory(context) {
    if (!context || !context.chat) return [];
    
    const emotions = [];
    const emotionKeywords = {
        happy: ['笑', '开心', '高兴', '愉快', '快乐', '满足', '微笑', '愉悦', '欢', '喜'],
        angry: ['生气', '愤怒', '恼火', '发怒', '气愤', '火冒', '怒', '不爽', '不悦'],
        shy: ['害羞', '脸红', '羞涩', '不好意思', '难为情', '脸红', '窘', '尴尬'],
        sad: ['伤心', '难过', '悲伤', '哭泣', '哭', '落泪', '沮丧', '失落', '郁闷'],
        surprised: ['惊讶', '吃惊', '震惊', '意外', '诧异', '愕', '惊'],
        fearful: ['害怕', '恐惧', '担心', '忧虑', '畏惧', '怕', '惶'],
        disgusted: ['厌恶', '讨厌', '反感', '嫌弃', '不屑', '恶心'],
    };
    
    const recentMessages = context.chat.slice(-10);
    recentMessages.forEach((msg, idx) => {
        if (msg.is_user) return;
        const content = msg.mes || '';
        
        for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
            for (const keyword of keywords) {
                if (content.includes(keyword)) {
                    emotions.push({
                        emotion,
                        index: idx,
                        keyword,
                        timestamp: Date.now() - (10 - idx) * 60000
                    });
                    break;
                }
            }
        }
    });
    
    return emotions;
}

function updateCharStates(context) {
    if (!context || !context.chat) return;
    
    const currentCount = context.chat.length;
    if (currentCount === appState.charStates.lastMessageCount) return;
    
    appState.charStates.lastMessageCount = currentCount;
    
    const emotions = extractEmotionsFromHistory(context);
    if (emotions.length > 0) {
        const lastEmotion = emotions[emotions.length - 1];
        if (appState.charStates.emotion !== lastEmotion.emotion) {
            appState.charStates.emotion = lastEmotion.emotion;
            if (appState.charStates.emotionHistory.length >= 10) {
                appState.charStates.emotionHistory.shift();
            }
            appState.charStates.emotionHistory.push({
                emotion: lastEmotion.emotion,
                timestamp: Date.now()
            });
        }
    }
}

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

function injectAnchorToInput(mode = 'temporary') {
    const input = getMessageInput();
    if (!input.length) return;
    
    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    
    if (!anchors) {
        toastr.warning('无法获取角色信息');
        return;
    }
    
    const anchorText = generateWeightedAnchor(anchors, mode);
    const currentText = input.val() || '';
    const newText = currentText + (currentText ? '\n' : '') + anchorText;
    
    input.val(newText);
    input.focus();
    
    toastr.success('已注入 ' + anchors.name + ' 的设定锚点');
}

function copyAnchorToClipboard(mode = 'temporary') {
    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    
    if (!anchors) {
        toastr.warning('无法获取角色信息');
        return;
    }
    
    const anchorText = generateWeightedAnchor(anchors, mode);
    navigator.clipboard.writeText(anchorText).then(() => {
        toastr.success('已复制到剪贴板');
    }).catch(() => {
        toastr.error('复制失败');
    });
}

function editLastMessage() {
    const context = getContext();
    if (!context || !context.chat) return;
    
    const lastMsg = context.chat.slice(-1)[0];
    if (!lastMsg || lastMsg.is_user) {
        toastr.warning('没有可编辑的AI消息');
        return;
    }
    
    const input = getMessageInput();
    if (input.length) {
        input.val(lastMsg.mes);
        input.focus();
        toastr.info('已将最后一条消息加载到输入框');
    }
}

function injectStateToInput() {
    const context = getContext();
    const charName = context?.name || '角色';
    const states = appState.charStates;
    
    const emotionLabels = {
        happy: '开心',
        angry: '愤怒',
        shy: '害羞',
        sad: '悲伤',
        surprised: '惊讶',
        fearful: '恐惧',
        disgusted: '厌恶',
        neutral: '中性',
    };
    
    let stateText = `[角色状态提醒]\n`;
    stateText += `角色: ${charName}\n`;
    stateText += `当前情绪: ${emotionLabels[states.emotion] || '中性'}\n`;
    
    if (states.emotionHistory.length > 1) {
        const history = states.emotionHistory.slice(-5).map(e => emotionLabels[e.emotion] || '中性').join(' -> ');
        stateText += `情绪变化: ${history}\n`;
    }
    
    if (Object.keys(states.customFields).length > 0) {
        stateText += `\n自定义状态:\n`;
        Object.keys(states.customFields).forEach(key => {
            stateText += `- ${key}: ${states.customFields[key]}\n`;
        });
    }
    
    const input = getMessageInput();
    if (input.length) {
        const currentText = input.val() || '';
        input.val(currentText ? currentText + '\n\n' + stateText : stateText);
        input.focus();
    }
}

function toggleTab(tab) {
    if (appState.expandedTab === tab) {
        appState.expandedTab = null;
    } else {
        appState.expandedTab = tab;
        
        if (tab === 'state') {
            const context = getContext();
            updateCharStates(context);
        }
    }
    renderExpandedContent();
}

function renderExpandedContent() {
    const container = $('#toolbox-expanded');
    if (!appState.expandedTab) {
        container.hide();
        return;
    }
    
    let content = '';
    switch(appState.expandedTab) {
        case 'anchor':
            content = renderAnchorContent();
            break;
        case 'ooc':
            content = renderOocContent();
            break;
        case 'state':
            content = renderStateContent();
            break;
        case 'edit':
            content = renderEditContent();
            break;
    }
    
    container.html(content);
    container.show();
    bindContentEvents();
}

function renderAnchorContent() {
    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    const settings = extension_settings[extensionName];
    const keywords = settings?.anchorKeywords || [];
    const llm = settings?.currentLLM || 'openai';
    
    const llmLabels = {
        openai: 'OpenAI / GPT',
        claude: 'Claude / Anthropic',
        kobold: 'KoboldAI',
        generic: '通用格式'
    };
    
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">设定锚点注入器</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            ${anchors ? `
                <div class="toolbox-char-info">
                    <span class="toolbox-char-name">${anchors.name}</span>
                    ${anchors.corePoints.length > 0 ? `
                        <div class="toolbox-core-points">
                            <span class="toolbox-section-label">核心设定点</span>
                            <ul>
                                ${anchors.corePoints.slice(0, 5).map(p => `<li>${p}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            ` : '<div class="toolbox-no-char">暂无角色信息，请先加载角色</div>'}
            
            <div class="toolbox-mode-selector">
                <span class="toolbox-section-label">LLM 类型</span>
                <select id="toolbox-llm-select" class="toolbox-select">
                    <option value="openai" ${llm === 'openai' ? 'selected' : ''}>${llmLabels.openai}</option>
                    <option value="claude" ${llm === 'claude' ? 'selected' : ''}>${llmLabels.claude}</option>
                    <option value="kobold" ${llm === 'kobold' ? 'selected' : ''}>${llmLabels.kobold}</option>
                    <option value="generic" ${llm === 'generic' ? 'selected' : ''}>${llmLabels.generic}</option>
                </select>
            </div>
            
            <div class="toolbox-mode-selector">
                <span class="toolbox-section-label">注入模式</span>
                <div class="toolbox-mode-buttons">
                    <button class="toolbox-mode-btn ${settings.injectMode === 'temporary' ? 'active' : ''}" data-mode="temporary">临时</button>
                    <button class="toolbox-mode-btn ${settings.injectMode === 'continuous' ? 'active' : ''}" data-mode="continuous">持续</button>
                    <button class="toolbox-mode-btn ${settings.injectMode === 'emergency' ? 'active' : ''}" data-mode="emergency">紧急</button>
                </div>
            </div>
            
            <div class="toolbox-keywords">
                <span class="toolbox-section-label">自定义锚点关键词</span>
                <div class="toolbox-keyword-input">
                    <input type="text" id="toolbox-new-keyword" placeholder="例如：绝对不能暴露身份" />
                    <button id="toolbox-add-keyword">添加</button>
                </div>
                <div class="toolbox-keyword-list">
                    ${keywords.length === 0 ? '<span class="toolbox-empty-hint">暂无自定义关键词</span>' : ''}
                    ${keywords.map((kw, i) => `
                        <span class="toolbox-keyword-tag">
                            ${kw}
                            <button class="toolbox-keyword-remove" data-index="${i}">×</button>
                        </span>
                    `).join('')}
                </div>
            </div>
            
            <div class="toolbox-actions">
                <button id="toolbox-inject-anchor-btn" class="toolbox-primary-btn">注入到输入框</button>
                <button id="toolbox-copy-anchor-btn" class="toolbox-secondary-btn">复制</button>
            </div>
        </div>
    `;
}

function renderOocContent() {
    const oocResult = detectOOC();
    const suggestions = generateFixSuggestions(oocResult.conflicts);
    
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">OOC 实时检测</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            ${oocResult.characterInfo ? `
                <div class="toolbox-ooc-char">
                    <span class="toolbox-ooc-label">检测角色:</span>
                    <span class="toolbox-ooc-value">${oocResult.characterInfo.name}</span>
                </div>
            ` : ''}
            
            <button id="toolbox-run-ooc" class="toolbox-primary-btn">运行检测</button>
            
            ${oocResult.conflicts.length > 0 ? `
                <div class="toolbox-conflict-results">
                    <div class="toolbox-conflict-title">
                        检测到 ${oocResult.conflicts.length} 个潜在冲突
                    </div>
                    <div class="toolbox-conflict-list">
                        ${oocResult.conflicts.map((c, i) => `
                            <div class="toolbox-conflict-item ${c.severity}">
                                <div class="toolbox-conflict-header">
                                    <span class="toolbox-severity-badge ${c.severity}">${c.severity === 'high' ? '严重' : c.severity === 'medium' ? '中等' : '轻微'}</span>
                                    <span class="toolbox-conflict-type">${c.type}</span>
                                </div>
                                <div class="toolbox-conflict-message">${c.message}</div>
                                ${c.suggestion ? `<div class="toolbox-conflict-suggestion">建议: ${c.suggestion}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    
                    ${suggestions.length > 0 ? `
                        <div class="toolbox-suggestions">
                            <div class="toolbox-suggestions-title">修正方案</div>
                            <div class="toolbox-suggestion-list">
                                ${suggestions.map((s, i) => `
                                    <button class="toolbox-suggestion-btn" data-text="${s}">${i + 1}. ${s}</button>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <button id="toolbox-fix-ooc" class="toolbox-primary-btn">一键注入修正提示</button>
                </div>
            ` : '<div class="toolbox-no-conflict">未检测到明显的OOC冲突</div>'}
        </div>
    `;
}

function renderStateContent() {
    const context = getContext();
    const charName = context?.name || '未知角色';
    const states = appState.charStates;
    updateCharStates(context);
    
    const emotionLabels = {
        happy: '开心',
        angry: '愤怒',
        shy: '害羞',
        sad: '悲伤',
        surprised: '惊讶',
        fearful: '恐惧',
        disgusted: '厌恶',
        neutral: '中性',
    };
    
    const emotionColors = {
        happy: '#4ade80',
        angry: '#f87171',
        shy: '#f472b6',
        sad: '#60a5fa',
        surprised: '#fbbf24',
        fearful: '#a78bfa',
        disgusted: '#fb923c',
        neutral: '#94a3b8',
    };
    
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">角色状态追踪</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            <div class="toolbox-current-state">
                <div class="toolbox-char-name">${charName}</div>
                <div class="toolbox-emotion-display" style="border-left: 4px solid ${emotionColors[states.emotion]}">
                    <div class="toolbox-emotion-main">
                        <span class="toolbox-emotion-label">当前情绪</span>
                        <span class="toolbox-emotion-value" style="color: ${emotionColors[states.emotion]}">${emotionLabels[states.emotion] || '中性'}</span>
                    </div>
                    <div class="toolbox-emotion-bar">
                        ${Object.keys(emotionLabels).map(e => `
                            <div class="toolbox-emotion-dot ${states.emotion === e ? 'active' : ''}" 
                                 style="background: ${states.emotion === e ? emotionColors[e] : 'rgba(255,255,255,0.2)'}"
                                 data-emotion="${e}"></div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            ${states.emotionHistory.length > 1 ? `
                <div class="toolbox-emotion-history">
                    <span class="toolbox-section-label">情绪变化记录</span>
                    <div class="toolbox-emotion-timeline">
                        ${states.emotionHistory.slice(-8).map((e, i) => `
                            <div class="toolbox-timeline-item" style="border-top-color: ${emotionColors[e.emotion]}">
                                <span class="toolbox-timeline-emotion">${emotionLabels[e.emotion] || '中性'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="toolbox-custom-fields">
                <span class="toolbox-section-label">自定义状态字段</span>
                <div class="toolbox-field-input">
                    <input type="text" id="toolbox-field-name" placeholder="字段名" />
                    <input type="text" id="toolbox-field-value" placeholder="当前值" />
                    <button id="toolbox-add-field">添加</button>
                </div>
                <div class="toolbox-custom-fields-list">
                    ${Object.keys(states.customFields).length === 0 ? '<span class="toolbox-empty-hint">暂无自定义字段</span>' : ''}
                    ${Object.keys(states.customFields).map(key => `
                        <div class="toolbox-custom-field">
                            <span class="toolbox-field-label">${key}</span>
                            <span class="toolbox-field-value">${states.customFields[key]}</span>
                            <button class="toolbox-remove-field" data-field="${key}">×</button>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="toolbox-actions">
                <button id="toolbox-inject-state" class="toolbox-primary-btn">注入状态到输入框</button>
            </div>
        </div>
    `;
}

function renderEditContent() {
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return `
            <div class="toolbox-content-section">
                <div class="toolbox-content-header">
                    <span class="toolbox-content-title">消息编辑</span>
                    <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
                </div>
                <div class="toolbox-no-char">暂无聊天记录</div>
            </div>
        `;
    }
    
    const lastMsg = context.chat.slice(-1)[0];
    const isUser = lastMsg.is_user;
    const role = isUser ? '用户' : 'AI';
    const preview = lastMsg.mes ? lastMsg.mes.substring(0, 100) + (lastMsg.mes.length > 100 ? '...' : '') : '(空消息)';
    
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">消息编辑</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            <div class="toolbox-edit-preview">
                <div class="toolbox-edit-role">${role}消息</div>
                <div class="toolbox-edit-content">${preview}</div>
            </div>
            
            ${lastMsg.swipes && lastMsg.swipes.length > 1 ? `
                <div class="toolbox-swipe-info">
                    <span class="toolbox-swipe-label">分支数量</span>
                    <span class="toolbox-swipe-count">${lastMsg.swipes.length}</span>
                </div>
            ` : ''}
            
            <div class="toolbox-actions">
                <button id="toolbox-edit-last" class="toolbox-primary-btn">
                    编辑最后${role}消息
                </button>
                <button id="toolbox-copy-last" class="toolbox-secondary-btn">
                    复制消息
                </button>
            </div>
        </div>
    `;
}

function bindContentEvents() {
    $('#toolbox-llm-select').off('change').on('change', function() {
        extension_settings[extensionName].currentLLM = $(this).val();
        saveSettingsDebounced();
    });
    
    $('.toolbox-mode-btn').off('click').on('click', function() {
        const mode = $(this).data('mode');
        extension_settings[extensionName].injectMode = mode;
        saveSettingsDebounced();
        renderExpandedContent();
    });
    
    $('#toolbox-add-keyword').off('click').on('click', function() {
        const keyword = $('#toolbox-new-keyword').val().trim();
        if (!keyword) return;
        
        const settings = extension_settings[extensionName];
        if (!settings.anchorKeywords) settings.anchorKeywords = [];
        if (!settings.anchorKeywords.includes(keyword)) {
            settings.anchorKeywords.push(keyword);
            saveSettingsDebounced();
            renderExpandedContent();
        }
        $('#toolbox-new-keyword').val('');
    });
    
    $('.toolbox-keyword-remove').off('click').on('click', function() {
        const index = $(this).data('index');
        const settings = extension_settings[extensionName];
        settings.anchorKeywords.splice(index, 1);
        saveSettingsDebounced();
        renderExpandedContent();
    });
    
    $('#toolbox-inject-anchor-btn').off('click').on('click', function() {
        const settings = extension_settings[extensionName];
        injectAnchorToInput(settings.injectMode);
        toggleTab(null);
    });
    
    $('#toolbox-copy-anchor-btn').off('click').on('click', function() {
        const settings = extension_settings[extensionName];
        copyAnchorToClipboard(settings.injectMode);
    });
    
    $('#toolbox-run-ooc').off('click').on('click', function() {
        renderExpandedContent();
    });
    
    $('.toolbox-suggestion-btn').off('click').on('click', function() {
        const text = $(this).data('text');
        const input = getMessageInput();
        if (input.length) {
            input.val(text);
            input.focus();
            toggleTab(null);
        }
    });
    
    $('#toolbox-fix-ooc').off('click').on('click', function() {
        const oocResult = detectOOC();
        const suggestions = generateFixSuggestions(oocResult.conflicts);
        if (suggestions.length > 0) {
            const input = getMessageInput();
            if (input.length) {
                input.val('[角色设定修正]\n' + suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n'));
                input.focus();
                toggleTab(null);
            }
        }
    });
    
    $('#toolbox-add-field').off('click').on('click', function() {
        const name = $('#toolbox-field-name').val().trim();
        const value = $('#toolbox-field-value').val().trim();
        if (!name) return;
        
        appState.charStates.customFields[name] = value || '0';
        saveSettingsDebounced();
        renderExpandedContent();
        $('#toolbox-field-name').val('');
        $('#toolbox-field-value').val('');
    });
    
    $('.toolbox-remove-field').off('click').on('click', function() {
        const field = $(this).data('field');
        delete appState.charStates.customFields[field];
        saveSettingsDebounced();
        renderExpandedContent();
    });
    
    $('#toolbox-inject-state').off('click').on('click', function() {
        injectStateToInput();
        toggleTab(null);
    });
    
    $('#toolbox-edit-last').off('click').on('click', function() {
        editLastMessage();
        toggleTab(null);
    });
    
    $('#toolbox-copy-last').off('click').on('click', function() {
        const context = getContext();
        if (context && context.chat && context.chat.length > 0) {
            const lastMsg = context.chat.slice(-1)[0];
            if (lastMsg && lastMsg.mes) {
                navigator.clipboard.writeText(lastMsg.mes).then(() => {
                    toastr.success('已复制到剪贴板');
                }).catch(() => {
                    toastr.error('复制失败');
                });
            }
        }
    });
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    const settings = extension_settings[extensionName];
    $('#enable_toolbox').prop('checked', settings.enabled).trigger('input');
    
    const tools = settings.tools || defaultSettings.tools;
    $('#tool_anchor_inject').prop('checked', tools.anchorInject !== false).trigger('input');
    $('#tool_ooc_detect').prop('checked', tools.oocDetect !== false).trigger('input');
    $('#tool_char_state').prop('checked', tools.charState !== false).trigger('input');
    $('#tool_message_edit').prop('checked', tools.messageEdit !== false).trigger('input');
    
    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools || defaultSettings.tools;
    
    $('#toolbox-anchor-btn').toggle(tools.anchorInject !== false);
    $('#toolbox-ooc-btn').toggle(tools.oocDetect !== false);
    $('#toolbox-state-btn').toggle(tools.charState !== false);
    $('#toolbox-edit-btn').toggle(tools.messageEdit !== false);
    
    const allHidden = !tools.anchorInject && !tools.oocDetect && !tools.charState && !tools.messageEdit;
    
    if (allHidden || !settings.enabled) {
        $('#toolbox-toolbar').hide();
    } else {
        $('#toolbox-toolbar').show();
    }
}

function onEnableInput(event) {
    const value = Boolean($(event.target).prop('checked'));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    updateToolVisibility();
}

function onToolVisibilityChange(toolKey) {
    return function(event) {
        const checked = Boolean($(event.target).prop('checked'));
        if (!extension_settings[extensionName].tools) {
            extension_settings[extensionName].tools = {};
        }
        extension_settings[extensionName].tools[toolKey] = checked;
        saveSettingsDebounced();
        updateToolVisibility();
    };
}

jQuery(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);
    
    const toolbarHtml = `
        <div id="toolbox-toolbar" style="display: none;">
            <div class="toolbox-buttons">
                <button id="toolbox-anchor-btn" class="toolbox-main-btn">锚点</button>
                <button id="toolbox-ooc-btn" class="toolbox-main-btn">检测</button>
                <button id="toolbox-state-btn" class="toolbox-main-btn">状态</button>
                <button id="toolbox-edit-btn" class="toolbox-main-btn">编辑</button>
            </div>
        </div>
        <div id="toolbox-expanded" style="display: none;"></div>
    `;
    
    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }
    
    $('#toolbox-anchor-btn').on('click', () => toggleTab('anchor'));
    $('#toolbox-ooc-btn').on('click', () => toggleTab('ooc'));
    $('#toolbox-state-btn').on('click', () => toggleTab('state'));
    $('#toolbox-edit-btn').on('click', () => toggleTab('edit'));
    
    $('#enable_toolbox').on('input', onEnableInput);
    $('#tool_anchor_inject').on('input', onToolVisibilityChange('anchorInject'));
    $('#tool_ooc_detect').on('input', onToolVisibilityChange('oocDetect'));
    $('#tool_char_state').on('input', onToolVisibilityChange('charState'));
    $('#tool_message_edit').on('input', onToolVisibilityChange('messageEdit'));
    
    loadSettings();
    window.toggleTab = toggleTab;
});
