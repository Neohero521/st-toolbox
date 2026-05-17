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
    },
    anchorKeywords: [],
    injectMode: 'temporary',
    oocDetectThreshold: 0.7, // 添加检测阈值
    autoInjectInterval: 5,
};

// 在 global 上暂存状态，用于同步
const STORAGE_KEY = 'st-toolbox-state';

const appState = {
    expandedTab: null,
    charStates: {
        emotion: 'neutral',
        emotionHistory: [],
        customFields: {},
    },
};

function getCurrentCharacter() {
    const context = getContext();
    if (!context) return null;
    
    return {
        name: context.name || '未知角色',
        description: context.description || '',
        personality: context.personality || '',
        scenario: context.scenario || '',
        firstMessage: context.first_mes || '',
        avatar: context.avatar || '',
    };
}

function extractCorePoints(character) {
    const points = [];
    
    const sources = [
        { text: character.description, label: '设定' },
        { text: character.personality, label: '性格' },
        { text: character.scenario, label: '场景' },
        { text: character.firstMessage, label: '首句' },
    ];
    
    for (const source of sources) {
        if (!source.text) continue;
        
        // 更安全的分隔：支持多种换行和标点符号
        const lines = source.text.split(/[\n\r。；;!?！？]/).filter(line => {
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
    
    return points.slice(0, 15); // 最多提取15个核心点
}

function generateWeightedAnchor(character, mode = 'temporary') {
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

function detectOOCConflicts(character) {
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return { conflicts: [], lastMessage: null };
    }
    
    const lastAIMsg = context.chat.filter(m => !m.is_user).slice(-1)[0];
    if (!lastAIMsg || !lastAIMsg.mes) {
        return { conflicts: [], lastMessage: null };
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
    
    return { conflicts, lastMessage: message };
}

function generateFixSuggestions(conflicts, character) {
    if (!conflicts || conflicts.length === 0) return [];
    
    const suggestions = [];
    
    conflicts.forEach(c => {
        switch(c.type) {
            case 'speech':
                suggestions.push('请保持沉默，通过动作、表情或心理活动表达');
                suggestions.push('用省略号或非语言方式回应');
                break;
            case 'behavior':
                suggestions.push('请保持害羞/内向的性格，减少主动行为');
                suggestions.push('增加脸红、低头、紧张等细节');
                break;
            case 'emotion':
                suggestions.push('请保持冷酷/高冷的态度，减少情感表达');
                suggestions.push('语言简短、直接，不带感情色彩');
                break;
            case 'age':
                suggestions.push('请用更天真、简单的语言表达');
                suggestions.push('表现出符合年龄的好奇心和稚气');
                break;
            case 'length':
                suggestions.push('请增加更多环境描写和细节');
                suggestions.push('补充心理活动和动作描写');
                break;
        }
    });
    
    suggestions.push(`【角色设定回顾】\n${character.name}的核心设定：${extractCorePoints(character).slice(0, 3).join('；')}`);
    
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
    const context = getContext();
    if (!context || !context.chat) return;
    
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
    
    // 尝试保存到角色自定义数据
    trySaveStateToCharacter();
}

// 保存状态到角色数据
function trySaveStateToCharacter() {
    try {
        const context = getContext();
        if (context && context.name) {
            // 将状态保存到 extension_settings 中，按角色名区分
            const stateKey = `state_${context.name}`;
            extension_settings[extensionName][stateKey] = {
                ...appState.charStates,
                savedAt: Date.now()
            };
            saveSettingsDebounced();
        }
    } catch(e) {
        console.log('Failed to save state:', e);
    }
}

// 从角色数据加载状态
function tryLoadStateFromCharacter() {
    try {
        const context = getContext();
        if (context && context.name) {
            const stateKey = `state_${context.name}`;
            const savedState = extension_settings[extensionName][stateKey];
            if (savedState) {
                appState.charStates = {
                    ...appState.charStates,
                    ...savedState
                };
            }
        }
    } catch(e) {
        console.log('Failed to load state:', e);
    }
}

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

function injectAnchorToInput(mode = 'temporary') {
    const character = getCurrentCharacter();
    if (!character || !character.name) {
        toastr.warning('请先加载角色');
        return;
    }
    
    const anchorText = generateWeightedAnchor(character, mode);
    const input = getMessageInput();
    
    if (input.length) {
        const currentText = input.val() || '';
        input.val(currentText + (currentText ? '\n' : '') + anchorText);
        input.focus();
        toastr.success('已注入设定锚点');
    }
}

function copyAnchorToClipboard(mode = 'temporary') {
    const character = getCurrentCharacter();
    if (!character || !character.name) {
        toastr.warning('请先加载角色');
        return;
    }
    
    const anchorText = generateWeightedAnchor(character, mode);
    navigator.clipboard.writeText(anchorText).then(() => {
        toastr.success('已复制到剪贴板');
    }).catch(() => {
        toastr.error('复制失败');
    });
}

function injectStateToInput() {
    const character = getCurrentCharacter();
    const states = appState.charStates;
    updateCharStates();
    
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
    stateText += `当前情绪: ${emotionLabels[states.emotion] || '中性'}\n`;
    
    if (Object.keys(states.customFields).length > 0) {
        stateText += `\n自定义状态:\n`;
        Object.keys(states.customFields).forEach(key => {
            stateText += `- ${key}: ${states.customFields[key]}\n`;
        });
    }
    
    const input = getMessageInput();
    if (input.length) {
        const currentText = input.val() || '';
        input.val(currentText + stateText);
        input.focus();
        toastr.success('已注入状态');
    }
}

function toggleTab(tab) {
    if (appState.expandedTab === tab) {
        appState.expandedTab = null;
    } else {
        appState.expandedTab = tab;
        if (tab === 'state') {
            tryLoadStateFromCharacter(); // 切换到状态面板时先尝试加载
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
    const character = getCurrentCharacter();
    const corePoints = character ? extractCorePoints(character) : [];
    const userKeywords = extension_settings[extensionName]?.anchorKeywords || [];
    const mode = extension_settings[extensionName]?.injectMode || 'temporary';
    
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">设定锚点注入器</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            ${character && character.name ? `
                <div class="toolbox-char-info">
                    <span class="toolbox-char-name">${character.name}</span>
                    ${corePoints.length > 0 ? `
                        <div class="toolbox-core-points">
                            <span class="toolbox-section-label">提取的核心设定</span>
                            <ul>
                                ${corePoints.slice(0, 6).map(p => `<li>${p}</li>`).join('')}
                            </ul>
                        </div>
                    ` : '<div class="toolbox-no-char">未找到核心设定</div>'}
                </div>
            ` : '<div class="toolbox-no-char">请先加载角色</div>'}
            
            <div class="toolbox-mode-selector">
                <span class="toolbox-section-label">注入模式</span>
                <div class="toolbox-mode-buttons">
                    <button class="toolbox-mode-btn ${mode === 'temporary' ? 'active' : ''}" data-mode="temporary">临时注入</button>
                    <button class="toolbox-mode-btn ${mode === 'continuous' ? 'active' : ''}" data-mode="continuous">持续注入</button>
                    <button class="toolbox-mode-btn ${mode === 'emergency' ? 'active' : ''}" data-mode="emergency">紧急修复</button>
                </div>
            </div>
            
            <div class="toolbox-keywords">
                <span class="toolbox-section-label">自定义锚点关键词</span>
                <div class="toolbox-keyword-input">
                    <input type="text" id="toolbox-new-keyword" placeholder="如：绝对不能暴露身份" />
                    <button id="toolbox-add-keyword">添加</button>
                </div>
                <div class="toolbox-keyword-list">
                    ${userKeywords.length === 0 ? '<span class="toolbox-empty-hint">暂未添加关键词</span>' : ''}
                    ${userKeywords.map((kw, i) => `
                        <span class="toolbox-keyword-tag">
                            ${kw}
                            <button class="toolbox-keyword-remove" data-index="${i}">×</button>
                        </span>
                    `).join('')}
                </div>
            </div>
            
            <div class="toolbox-actions">
                <button id="toolbox-inject-anchor-btn" class="toolbox-primary-btn">注入到输入框</button>
                <button id="toolbox-copy-anchor-btn" class="toolbox-secondary-btn">复制锚点</button>
            </div>
        </div>
    `;
}

function renderOocContent() {
    const character = getCurrentCharacter();
    const result = detectOOCConflicts(character);
    const suggestions = character ? generateFixSuggestions(result.conflicts, character) : [];
    const settings = extension_settings[extensionName];
    const threshold = settings?.oocDetectThreshold || defaultSettings.oocDetectThreshold;
    
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">OOC 实时检测</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            <div class="toolbox-threshold-container">
                <span class="toolbox-section-label">检测阈值</span>
                <div class="toolbox-threshold-slider-container">
                    <input type="range" id="toolbox-ooc-threshold" min="0.1" max="1" step="0.1" value="${threshold}">
                    <span class="toolbox-threshold-value">${threshold}</span>
                </div>
            </div>
            
            <button id="toolbox-run-ooc" class="toolbox-primary-btn">运行检测</button>
            
            ${result.conflicts.length > 0 ? `
                <div class="toolbox-conflict-results">
                    <div class="toolbox-conflict-title">
                        检测到 ${result.conflicts.length} 个潜在冲突
                    </div>
                    <div class="toolbox-conflict-list">
                        ${result.conflicts.map((c, i) => `
                            <div class="toolbox-conflict-item ${c.severity}">
                                <div class="toolbox-conflict-header">
                                    <span class="toolbox-severity-badge ${c.severity}">${c.severity === 'high' ? '高' : c.severity === 'medium' ? '中' : '低'}</span>
                                    <span class="toolbox-conflict-type">${c.type}</span>
                                </div>
                                <div class="toolbox-conflict-message">${c.message}</div>
                                ${c.forbidden ? `<div class="toolbox-conflict-forbidden">问题词："${c.forbidden}"</div>` : ''}
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
                    
                    <button id="toolbox-fix-ooc" class="toolbox-primary-btn">一键注入修正</button>
                </div>
            ` : '<div class="toolbox-no-conflict">未检测到明显冲突</div>'}
        </div>
    `;
}

function renderStateContent() {
    const character = getCurrentCharacter();
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
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">角色状态追踪</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            
            <div class="toolbox-current-state">
                <div class="toolbox-char-name">${character?.name || '未知角色'}</div>
                <div class="toolbox-emotion-display" style="border-left: 4px solid ${emotionColors[states.emotion]}">
                    <div class="toolbox-emotion-main">
                        <span class="toolbox-emotion-label">当前情绪</span>
                        <span class="toolbox-emotion-value" style="color: ${emotionColors[states.emotion]}">${emotionLabels[states.emotion]}</span>
                    </div>
                </div>
            </div>
            
            ${states.emotionHistory.length > 1 ? `
                <div class="toolbox-emotion-history">
                    <span class="toolbox-section-label">情绪变化</span>
                    <div class="toolbox-emotion-timeline">
                        ${states.emotionHistory.slice(-8).map(e => `
                            <div class="toolbox-timeline-item" style="border-top-color: ${emotionColors[e.emotion]}">
                                <span class="toolbox-timeline-emotion">${emotionLabels[e.emotion]}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="toolbox-custom-fields">
                <span class="toolbox-section-label">自定义状态</span>
                <div class="toolbox-field-input">
                    <input type="text" id="toolbox-field-name" placeholder="字段名" />
                    <input type="text" id="toolbox-field-value" placeholder="值" />
                    <button id="toolbox-add-field">添加</button>
                </div>
                <div class="toolbox-custom-fields-list">
                    ${Object.keys(states.customFields).length === 0 ? '<span class="toolbox-empty-hint">暂无自定义状态</span>' : ''}
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
                <button id="toolbox-inject-state" class="toolbox-primary-btn">注入状态到对话</button>
            </div>
        </div>
    `;
}

function bindContentEvents() {
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
        extension_settings[extensionName].anchorKeywords.splice(index, 1);
        saveSettingsDebounced();
        renderExpandedContent();
    });
    
    $('#toolbox-inject-anchor-btn').off('click').on('click', function() {
        const mode = extension_settings[extensionName]?.injectMode || 'temporary';
        injectAnchorToInput(mode);
        toggleTab(null);
    });
    
    $('#toolbox-copy-anchor-btn').off('click').on('click', function() {
        const mode = extension_settings[extensionName]?.injectMode || 'temporary';
        copyAnchorToClipboard(mode);
    });
    
    $('#toolbox-run-ooc').off('click').on('click', function() {
        renderExpandedContent();
    });
    
    // 阈值设置事件
    $('#toolbox-ooc-threshold').off('input').on('input', function() {
        const value = parseFloat($(this).val());
        extension_settings[extensionName].oocDetectThreshold = value;
        saveSettingsDebounced();
        $(this).next('.toolbox-threshold-value').text(value);
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
        const character = getCurrentCharacter();
        const result = detectOOCConflicts(character);
        const suggestions = character ? generateFixSuggestions(result.conflicts, character) : [];
        
        if (suggestions.length > 0) {
            const input = getMessageInput();
            if (input.length) {
                const fixText = `【OOC 修正】\n${suggestions.join('\n')}`;
                input.val(fixText);
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
    
    updateToolVisibility();
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
    
    $('#enable_toolbox').on('input', onEnableInput);
    $('#tool_anchor_inject').on('input', onToolVisibilityChange('anchorInject'));
    $('#tool_ooc_detect').on('input', onToolVisibilityChange('oocDetect'));
    $('#tool_char_state').on('input', onToolVisibilityChange('charState'));
    
    loadSettings();
    window.toggleTab = toggleTab;
});
