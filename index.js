import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        anchorInject: true,
        oocDetect: true,
        charState: true,
    },
    anchorKeywords: [],
    injectMode: 'temporary',
    oocDetectThreshold: 0.7,
};

let appState = {
    expandedTab: null,
    currentCharacter: null,
    charStates: {
        emotion: 'neutral',
        emotionHistory: [],
        customFields: {},
    },
    statusMessage: '',
};

function getCurrentCharacterData() {
    try {
        const context = getContext();
        if (context.characterId === undefined) {
            return null;
        }
        
        const character = context.characters[context.characterId];
        if (!character) {
            return null;
        }
        
        return {
            name: character.name || '未知',
            description: character.data?.description || '',
            personality: character.data?.personality || '',
            scenario: character.data?.scenario || '',
            first_mes: character.data?.first_mes || '',
        };
    } catch (e) {
        return null;
    }
}

function extractCorePoints(character) {
    if (!character) return [];
    
    const points = [];
    const sources = [
        character.description,
        character.personality,
        character.scenario,
        character.first_mes,
    ];
    
    for (const source of sources) {
        if (!source) continue;
        
        const lines = source.split(/[\n\r。；；!?！？]/).filter(line => {
            line = line.trim();
            return line.length > 5 && line.length < 300;
        });
        
        for (let i = 0; i < Math.min(lines.length, 3); i++) {
            const point = lines[i].trim();
            if (point && !points.includes(point)) {
                points.push(point);
            }
        }
    }
    
    return points.slice(0, 15);
}

function generateWeightedAnchor(character, mode = 'temporary') {
    if (!character) return '';
    
    const corePoints = extractCorePoints(character);
    const userKeywords = extension_settings[extensionName]?.anchorKeywords || [];
    
    let weightText = '';
    
    switch(mode) {
        case 'emergency':
            weightText = `\n\n【最高优先级 - 绝对不可违背】\n\n`;
            break;
        case 'continuous':
            weightText = `\n\n【持续锚点 - 必须遵守】\n\n`;
            break;
        default:
            weightText = `\n\n【设定提醒】\n\n`;
    }
    
    weightText += `<important>\n角色: ${character.name}\n</important>\n\n`;
    
    if (corePoints.length > 0) {
        weightText += `### 核心设定\n`;
        corePoints.forEach((point, idx) => {
            weightText += `${idx + 1}. ${point}\n`;
        });
        weightText += '\n';
    }
    
    if (userKeywords.length > 0) {
        weightText += `### 用户要求\n`;
        userKeywords.forEach(keyword => {
            weightText += `- ${keyword}\n`;
        });
        weightText += '\n';
    }
    
    weightText += `请严格保持 ${character.name} 的角色设定一致性。\n`;
    
    return weightText;
}

function detectOOCConflicts() {
    try {
        const context = getContext();
        
        if (!context.chat || context.chat.length === 0) {
            return { conflicts: [], lastMessage: null, characterInfo: null };
        }
        
        const character = getCurrentCharacterData();
        if (!character) {
            return { conflicts: [], lastMessage: null, characterInfo: null };
        }
        
        const lastAIMsg = context.chat.filter(m => !m.is_user).slice(-1)[0];
        if (!lastAIMsg || !lastAIMsg.mes) {
            return { conflicts: [], lastMessage: null, characterInfo: character };
        }
        
        const message = lastAIMsg.mes;
        const conflicts = [];
        const allText = (character.personality + ' ' + character.description + ' ' + character.scenario).toLowerCase();
        
        const conflictChecks = [
            {
                keywords: ['哑巴', '不会说话', '沉默不语', '不说话'],
                forbidden: ['说', '回答', '开口', '讲'],
                type: 'speech',
                message: '角色设定为哑巴/沉默，但回复中出现了对话',
                severity: 'high'
            },
            {
                keywords: ['害羞', '内向', '腼腆', '羞涩'],
                forbidden: ['大笑', '热情', '主动', '拥抱', '亲吻'],
                type: 'behavior',
                message: '角色设定为害羞/内向，但表现过于外向',
                severity: 'medium'
            },
            {
                keywords: ['冷酷', '冷漠', '高冷', '冷淡'],
                forbidden: ['温柔', '关心', '体贴', '温暖', '热情'],
                type: 'emotion',
                message: '角色设定为冷酷/高冷，但表现出温暖情感',
                severity: 'medium'
            },
            {
                keywords: ['小孩子', '年幼', '儿童', '小孩'],
                forbidden: ['成熟', '老练', '像大人', '稳重'],
                type: 'age',
                message: '角色设定为年幼，但表现过于成熟',
                severity: 'high'
            }
        ];
        
        for (const check of conflictChecks) {
            const hasTrait = check.keywords.some(kw => allText.includes(kw));
            if (!hasTrait) continue;
            
            const hasConflict = check.forbidden.some(word => message.includes(word));
            if (hasConflict) {
                conflicts.push({
                    type: check.type,
                    message: check.message,
                    severity: check.severity,
                    keyword: check.keywords.find(kw => allText.includes(kw)),
                    forbidden: check.forbidden.find(word => message.includes(word))
                });
            }
        }
        
        if (message.length < 20) {
            conflicts.push({
                type: 'length',
                message: '回复过短，可能不符合角色设定',
                severity: 'low'
            });
        }
        
        return { conflicts, lastMessage: message, characterInfo: character };
    } catch (e) {
        return { conflicts: [], lastMessage: null, characterInfo: null };
    }
}

function generateFixSuggestions(conflicts, character) {
    if (!conflicts || conflicts.length === 0) return [];
    
    const suggestions = [];
    
    conflicts.forEach(c => {
        switch(c.type) {
            case 'speech':
                suggestions.push('请保持沉默，通过动作、表情或心理活动表达');
                break;
            case 'behavior':
                suggestions.push('请保持害羞/内向的性格，减少主动行为');
                break;
            case 'emotion':
                suggestions.push('请保持冷酷/高冷的态度，减少情感表达');
                break;
            case 'age':
                suggestions.push('请用更天真、简单的语言表达');
                break;
            case 'length':
                suggestions.push('请增加更多环境描写和细节');
                break;
        }
    });
    
    return [...new Set(suggestions)].slice(0, 3);
}

function extractEmotion(message) {
    if (!message) return 'neutral';
    
    const lowerMsg = message.toLowerCase();
    const emotionMap = {
        happy: ['笑', '开心', '高兴', '愉快', '欢乐', '喜悦'],
        angry: ['生气', '愤怒', '恼火', '怒', '气愤', '暴躁'],
        shy: ['害羞', '脸红', '羞涩', '腼腆', '不好意思'],
        sad: ['难过', '悲伤', '哭', '流泪', '伤心', '沮丧'],
        surprised: ['惊讶', '吃惊', '震惊', '意外', '诧异'],
    };
    
    for (const [emotion, keywords] of Object.entries(emotionMap)) {
        for (const keyword of keywords) {
            if (lowerMsg.includes(keyword)) {
                return emotion;
            }
        }
    }
    
    return 'neutral';
}

function updateCharStates() {
    try {
        const context = getContext();
        if (!context.chat || context.chat.length === 0) return;
        
        const recentMessages = context.chat.filter(m => !m.is_user).slice(-5);
        if (recentMessages.length === 0) return;
        
        const lastMessage = recentMessages[recentMessages.length - 1];
        if (!lastMessage.mes) return;
        
        const emotion = extractEmotion(lastMessage.mes);
        if (appState.charStates.emotion !== emotion) {
            appState.charStates.emotion = emotion;
            if (appState.charStates.emotionHistory.length >= 10) {
                appState.charStates.emotionHistory.shift();
            }
            appState.charStates.emotionHistory.push({
                emotion,
                timestamp: Date.now()
            });
        }
    } catch (e) {}
}

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

function setStatus(message) {
    appState.statusMessage = message;
    updateStatusDisplay();
}

function updateStatusDisplay() {
    const statusEl = $('#toolbox-status');
    if (statusEl.length) {
        if (appState.statusMessage) {
            statusEl.text(appState.statusMessage).show();
        } else {
            statusEl.hide();
        }
    }
}

function toggleTab(tab) {
    if (appState.expandedTab === tab) {
        appState.expandedTab = null;
    } else {
        appState.expandedTab = tab;
        if (tab === 'state') {
            updateCharStates();
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
    }
    
    container.html(content);
    container.show();
    bindContentEvents();
}

function renderAnchorContent() {
    const character = getCurrentCharacterData();
    const corePoints = character ? extractCorePoints(character) : [];
    const userKeywords = extension_settings[extensionName]?.anchorKeywords || [];
    const mode = extension_settings[extensionName]?.injectMode || 'temporary';
    
    return `
        <div class="toolbox-panel">
            <div class="toolbox-panel-header">
                <span>设定锚点注入器</span>
                <button class="toolbox-close-btn" onclick="window.toggleTab(null)">×</button>
            </div>
            
            <div class="toolbox-panel-body">
                ${character ? `
                    <div class="toolbox-char-name">${character.name}</div>
                    ${corePoints.length > 0 ? `
                        <div class="toolbox-section">
                            <div class="toolbox-section-title">核心设定</div>
                            <ul class="toolbox-list">
                                ${corePoints.slice(0, 6).map(p => `<li>${p}</li>`).join('')}
                            </ul>
                        </div>
                    ` : '<div class="toolbox-hint">未找到核心设定</div>'}
                ` : '<div class="toolbox-hint">请先加载角色</div>'}
                
                <div class="toolbox-section">
                    <div class="toolbox-section-title">注入模式</div>
                    <div class="toolbox-mode-buttons">
                        <button class="toolbox-mode-btn ${mode === 'temporary' ? 'active' : ''}" data-mode="temporary">临时</button>
                        <button class="toolbox-mode-btn ${mode === 'continuous' ? 'active' : ''}" data-mode="continuous">持续</button>
                        <button class="toolbox-mode-btn ${mode === 'emergency' ? 'active' : ''}" data-mode="emergency">紧急</button>
                    </div>
                </div>
                
                <div class="toolbox-section">
                    <div class="toolbox-section-title">关键词</div>
                    <div class="toolbox-keyword-input">
                        <input type="text" id="toolbox-new-keyword" placeholder="添加关键词..." />
                        <button id="toolbox-add-keyword">+</button>
                    </div>
                    <div class="toolbox-keywords">
                        ${userKeywords.length === 0 ? '<span class="toolbox-hint">暂无关键词</span>' : ''}
                        ${userKeywords.map((kw, i) => `
                            <span class="toolbox-keyword-tag">
                                ${kw}
                                <button class="toolbox-keyword-remove" data-index="${i}">×</button>
                            </span>
                        `).join('')}
                    </div>
                </div>
                
                <div class="toolbox-actions">
                    <button id="toolbox-inject-anchor" class="toolbox-action-btn primary">注入到输入框</button>
                </div>
            </div>
        </div>
    `;
}

function renderOocContent() {
    const result = detectOOCConflicts();
    const suggestions = result.characterInfo ? generateFixSuggestions(result.conflicts, result.characterInfo) : [];
    
    return `
        <div class="toolbox-panel">
            <div class="toolbox-panel-header">
                <span>OOC 实时检测</span>
                <button class="toolbox-close-btn" onclick="window.toggleTab(null)">×</button>
            </div>
            
            <div class="toolbox-panel-body">
                ${result.characterInfo ? `
                    <div class="toolbox-char-name">${result.characterInfo.name}</div>
                ` : '<div class="toolbox-hint">请先加载角色</div>'}
                
                ${result.conflicts.length > 0 ? `
                    <div class="toolbox-section">
                        <div class="toolbox-section-title">检测到 ${result.conflicts.length} 个冲突</div>
                        ${result.conflicts.map((c, i) => `
                            <div class="toolbox-conflict-item ${c.severity}">
                                <div class="toolbox-conflict-header">
                                    <span class="toolbox-severity-badge ${c.severity}">${c.severity === 'high' ? '高' : c.severity === 'medium' ? '中' : '低'}</span>
                                    <span>${c.type}</span>
                                </div>
                                <div class="toolbox-conflict-message">${c.message}</div>
                                ${c.forbidden ? `<div class="toolbox-conflict-forbidden">"${c.forbidden}"</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    
                    ${suggestions.length > 0 ? `
                        <div class="toolbox-section">
                            <div class="toolbox-section-title">修正方案</div>
                            <div class="toolbox-suggestions">
                                ${suggestions.map((s, i) => `
                                    <button class="toolbox-suggestion-btn" data-text="${s}">${i + 1}. ${s}</button>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="toolbox-actions">
                        <button id="toolbox-fix-ooc" class="toolbox-action-btn primary">一键修正</button>
                    </div>
                ` : `
                    <div class="toolbox-hint">未检测到明显冲突</div>
                    <div class="toolbox-actions">
                        <button id="toolbox-run-ooc" class="toolbox-action-btn">刷新检测</button>
                    </div>
                `}
            </div>
        </div>
    `;
}

function renderStateContent() {
    const character = getCurrentCharacterData();
    const states = appState.charStates;
    
    const emotionLabels = {
        happy: '开心',
        angry: '愤怒',
        shy: '害羞',
        sad: '悲伤',
        surprised: '惊讶',
        neutral: '中性',
    };
    
    const emotionColors = {
        happy: '#4ade80',
        angry: '#f87171',
        shy: '#f472b6',
        sad: '#60a5fa',
        surprised: '#fbbf24',
        neutral: '#94a3b8',
    };
    
    return `
        <div class="toolbox-panel">
            <div class="toolbox-panel-header">
                <span>角色状态追踪</span>
                <button class="toolbox-close-btn" onclick="window.toggleTab(null)">×</button>
            </div>
            
            <div class="toolbox-panel-body">
                <div class="toolbox-char-name">${character?.name || '未知角色'}</div>
                
                <div class="toolbox-section">
                    <div class="toolbox-emotion-display" style="border-left: 4px solid ${emotionColors[states.emotion]}">
                        <div class="toolbox-emotion-label">当前情绪</div>
                        <div class="toolbox-emotion-value" style="color: ${emotionColors[states.emotion]}">${emotionLabels[states.emotion]}</div>
                    </div>
                </div>
                
                ${states.emotionHistory.length > 1 ? `
                    <div class="toolbox-section">
                        <div class="toolbox-section-title">情绪变化</div>
                        <div class="toolbox-emotion-timeline">
                            ${states.emotionHistory.slice(-6).map(e => `
                                <div class="toolbox-timeline-item" style="border-top-color: ${emotionColors[e.emotion]}">
                                    <span>${emotionLabels[e.emotion]}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="toolbox-section">
                    <div class="toolbox-section-title">自定义状态</div>
                    <div class="toolbox-field-input">
                        <input type="text" id="toolbox-field-name" placeholder="字段" />
                        <input type="text" id="toolbox-field-value" placeholder="值" />
                        <button id="toolbox-add-field">+</button>
                    </div>
                    <div class="toolbox-fields">
                        ${Object.keys(states.customFields).length === 0 ? '<span class="toolbox-hint">暂无自定义状态</span>' : ''}
                        ${Object.keys(states.customFields).map(key => `
                            <div class="toolbox-field-item">
                                <span class="toolbox-field-label">${key}</span>
                                <span class="toolbox-field-value">${states.customFields[key]}</span>
                                <button class="toolbox-remove-field" data-field="${key}">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="toolbox-actions">
                    <button id="toolbox-inject-state" class="toolbox-action-btn primary">注入状态</button>
                </div>
            </div>
        </div>
    `;
}

function bindContentEvents() {
    $('.toolbox-mode-btn').off('click').on('click', function() {
        const mode = $(this).data('mode');
        extension_settings[extensionName].injectMode = mode;
        renderExpandedContent();
    });
    
    $('#toolbox-add-keyword').off('click').on('click', function() {
        const keyword = $('#toolbox-new-keyword').val().trim();
        if (!keyword) return;
        
        const settings = extension_settings[extensionName];
        if (!settings.anchorKeywords) settings.anchorKeywords = [];
        if (!settings.anchorKeywords.includes(keyword)) {
            settings.anchorKeywords.push(keyword);
            renderExpandedContent();
        }
        $('#toolbox-new-keyword').val('');
    });
    
    $('.toolbox-keyword-remove').off('click').on('click', function() {
        const index = $(this).data('index');
        extension_settings[extensionName].anchorKeywords.splice(index, 1);
        renderExpandedContent();
    });
    
    $('#toolbox-inject-anchor').off('click').on('click', function() {
        const character = getCurrentCharacterData();
        if (!character) {
            setStatus('请先加载角色');
            return;
        }
        
        const mode = extension_settings[extensionName]?.injectMode || 'temporary';
        const anchorText = generateWeightedAnchor(character, mode);
        const input = getMessageInput();
        
        if (input.length) {
            const currentText = input.val() || '';
            input.val(currentText + (currentText ? '\n' : '') + anchorText);
            input.focus();
            setStatus('已注入锚点');
            setTimeout(() => toggleTab(null), 1000);
        }
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
            setStatus('已插入修正文本');
            setTimeout(() => toggleTab(null), 1000);
        }
    });
    
    $('#toolbox-fix-ooc').off('click').on('click', function() {
        const result = detectOOCConflicts();
        const suggestions = result.characterInfo ? generateFixSuggestions(result.conflicts, result.characterInfo) : [];
        
        if (suggestions.length > 0) {
            const input = getMessageInput();
            if (input.length) {
                const fixText = `【OOC 修正】\n${suggestions.join('\n')}`;
                input.val(fixText);
                input.focus();
                setStatus('已注入修正');
                setTimeout(() => toggleTab(null), 1000);
            }
        }
    });
    
    $('#toolbox-add-field').off('click').on('click', function() {
        const name = $('#toolbox-field-name').val().trim();
        const value = $('#toolbox-field-value').val().trim();
        if (!name) return;
        
        appState.charStates.customFields[name] = value || '0';
        renderExpandedContent();
        $('#toolbox-field-name').val('');
        $('#toolbox-field-value').val('');
    });
    
    $('.toolbox-remove-field').off('click').on('click', function() {
        const field = $(this).data('field');
        delete appState.charStates.customFields[field];
        renderExpandedContent();
    });
    
    $('#toolbox-inject-state').off('click').on('click', function() {
        updateCharStates();
        const character = getCurrentCharacterData();
        
        const emotionLabels = {
            happy: '开心',
            angry: '愤怒',
            shy: '害羞',
            sad: '悲伤',
            surprised: '惊讶',
            neutral: '中性',
        };
        
        let stateText = `\n\n【角色状态】\n`;
        stateText += `角色: ${character?.name || '未知'}\n`;
        stateText += `当前情绪: ${emotionLabels[appState.charStates.emotion] || '中性'}\n`;
        
        if (Object.keys(appState.charStates.customFields).length > 0) {
            stateText += `\n自定义状态:\n`;
            Object.keys(appState.charStates.customFields).forEach(key => {
                stateText += `- ${key}: ${appState.charStates.customFields[key]}\n`;
            });
        }
        
        const input = getMessageInput();
        if (input.length) {
            const currentText = input.val() || '';
            input.val(currentText + stateText);
            input.focus();
            setStatus('已注入状态');
            setTimeout(() => toggleTab(null), 1000);
        }
    });
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools || defaultSettings.tools;
    
    $('#toolbox-anchor-btn').toggle(tools.anchorInject !== false);
    $('#toolbox-ooc-btn').toggle(tools.oocDetect !== false);
    $('#toolbox-state-btn').toggle(tools.charState !== false);
    
    const allHidden = !tools.anchorInject && !tools.oocDetect && !tools.charState;
    
    if (allHidden || !settings.enabled) {
        $('#toolbox-toolbar').hide();
    } else {
        $('#toolbox-toolbar').show();
    }
}

function handleChatChanged() {
    appState.currentCharacter = getCurrentCharacterData();
    updateCharStates();
}

function handleMessageReceived() {
    if (appState.expandedTab === 'state') {
        updateCharStates();
        renderExpandedContent();
    }
}

jQuery(async function() {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
    } catch (e) {
        return;
    }
    
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    const toolbarHtml = `
        <div id="toolbox-toolbar" style="display: none;">
            <div class="toolbox-toolbar">
                <div class="toolbox-buttons">
                    <button id="toolbox-anchor-btn" class="toolbox-btn">锚点</button>
                    <button id="toolbox-ooc-btn" class="toolbox-btn">检测</button>
                    <button id="toolbox-state-btn" class="toolbox-btn">状态</button>
                </div>
            </div>
            <div id="toolbox-status" class="toolbox-status"></div>
            <div id="toolbox-expanded" class="toolbox-expanded"></div>
        </div>
    `;
    
    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    } else {
        return;
    }
    
    $('#toolbox-anchor-btn').on('click', () => toggleTab('anchor'));
    $('#toolbox-ooc-btn').on('click', () => toggleTab('ooc'));
    $('#toolbox-state-btn').on('click', () => toggleTab('state'));
    
    const settings = extension_settings[extensionName];
    const tools = settings.tools || defaultSettings.tools;
    $('#tool_anchor_inject').prop('checked', tools.anchorInject !== false).trigger('input');
    $('#tool_ooc_detect').prop('checked', tools.oocDetect !== false).trigger('input');
    $('#tool_char_state').prop('checked', tools.charState !== false).trigger('input');
    
    $('#tool_anchor_inject').on('input', function() {
        if (!extension_settings[extensionName].tools) extension_settings[extensionName].tools = {};
        extension_settings[extensionName].tools.anchorInject = Boolean($(this).prop('checked'));
        updateToolVisibility();
    });
    $('#tool_ooc_detect').on('input', function() {
        if (!extension_settings[extensionName].tools) extension_settings[extensionName].tools = {};
        extension_settings[extensionName].tools.oocDetect = Boolean($(this).prop('checked'));
        updateToolVisibility();
    });
    $('#tool_char_state').on('input', function() {
        if (!extension_settings[extensionName].tools) extension_settings[extensionName].tools = {};
        extension_settings[extensionName].tools.charState = Boolean($(this).prop('checked'));
        updateToolVisibility();
    });
    
    updateToolVisibility();
    
    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
        eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);
    }
    
    window.toggleTab = toggleTab;
    
    appState.currentCharacter = getCurrentCharacterData();
    updateCharStates();
});
