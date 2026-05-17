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
    anchorKeywords: ['绝对不能暴露身份', '保持傲娇属性', '说话方式固定', '核心设定不可改变'],
    injectMode: 'temporary',
    autoInjectInterval: 5,
    oocThreshold: 0.7,
};

const appState = {
    expandedTab: null,
    charStates: {
        emotion: 'neutral',
        emotionHistory: [],
        customFields: {},
    },
};

function extractCharacterAnchors(context) {
    if (!context) return null;
    return {
        name: context.name || '未知角色',
        personality: context.personality || '',
        scenario: context.scenario || '',
        description: context.description || '',
        firstMessage: context.first_mes || '',
        tags: context.tags || [],
        corePoints: extractCorePoints(context),
    };
}

function extractCorePoints(context) {
    const points = [];
    if (context.personality) {
        const personalityPoints = context.personality.split(/[\n.。；;]+/).filter(p => p.trim().length > 5);
        points.push(...personalityPoints.slice(0, 5));
    }
    if (context.description) {
        const descPoints = context.description.split(/[\n.。；;]+/).filter(p => p.trim().length > 10);
        points.push(...descPoints.slice(0, 5));
    }
    if (context.scenario) {
        const scenarioPoints = context.scenario.split(/[\n.。；;]+/).filter(p => p.trim().length > 10);
        points.push(...scenarioPoints.slice(0, 3));
    }
    return points.filter(p => p.length > 5).slice(0, 8);
}

function generateWeightedAnchor(anchors, mode = 'temporary') {
    const name = anchors.name;
    let weightText = '';
    switch(mode) {
        case 'emergency':
            weightText = `\n[最高优先级]\n\n[绝对不可逾越的核心设定]:\n`;
            break;
        case 'continuous':
            weightText = `\n[持续锚点]\n\n[必须遵守的核心设定]:\n`;
            break;
        default:
            weightText = `\n[设定锚点]\n\n[核心设定提醒]:\n`;
    }
    if (anchors.corePoints && anchors.corePoints.length > 0) {
        anchors.corePoints.forEach((point) => {
            weightText += `- ${point.trim()}\n`;
        });
    }
    const userKeywords = extension_settings[extensionName]?.anchorKeywords || defaultSettings.anchorKeywords;
    if (userKeywords && userKeywords.length > 0) {
        weightText += `\n[用户设定关键词]:\n`;
        userKeywords.forEach(keyword => {
            weightText += `- ${keyword}\n`;
        });
    }
    weightText += `\n[${name}的性格特点保持一致]\n`;
    return weightText;
}

function detectOOC() {
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return null;
    }
    const lastAIMsg = context.chat.filter(m => !m.is_user).slice(-1)[0];
    if (!lastAIMsg || !lastAIMsg.mes) {
        return null;
    }
    const msg = lastAIMsg.mes;
    const anchors = extractCharacterAnchors(context);
    if (!anchors) return null;
    const conflicts = [];
    const personality = anchors.personality.toLowerCase();
    if (personality.includes('哑巴') || personality.includes('沉默') || personality.includes('不说话')) {
        if (msg.includes('说') || msg.includes('说道') || msg.includes('回答') || msg.includes('问')) {
            conflicts.push({
                type: 'speech',
                message: '角色设定为沉默/哑巴，但回复中出现了对话',
                severity: 'high',
            });
        }
    }
    if (personality.includes('害羞') || personality.includes('内向')) {
        if (msg.includes('大笑') || msg.includes('热情') || msg.includes('主动')) {
            conflicts.push({
                type: 'behavior',
                message: '角色设定为害羞/内向，但回复表现出外向行为',
                severity: 'medium',
            });
        }
    }
    if (msg.length < 20) {
        conflicts.push({
            type: 'length',
            message: '回复过短，可能不符合角色设定的丰富性要求',
            severity: 'low',
        });
    }
    return conflicts.length > 0 ? conflicts : null;
}

function generateFixSuggestions(conflicts) {
    if (!conflicts || conflicts.length === 0) return [];
    const suggestions = [];
    conflicts.forEach(conflict => {
        switch(conflict.type) {
            case 'speech':
                suggestions.push('请保持角色沉默的设定，通过动作和表情来表达');
                suggestions.push('用省略号或沉默回应，表示角色不想说话');
                break;
            case 'behavior':
                suggestions.push('请保持角色害羞内向的性格，减少主动行为');
                suggestions.push('增加角色脸红、低头等害羞表现');
                break;
            case 'length':
                suggestions.push('请增加回复的细节和描述');
                suggestions.push('添加更多角色动作和心理活动');
                break;
        }
    });
    return [...new Set(suggestions)].slice(0, 3);
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
    const newText = currentText + (currentText ? '\n\n' : '') + anchorText;
    input.val(newText);
    input.focus();
    toastr.success('已注入' + anchors.name + '的设定锚点');
}

function toggleTab(tab) {
    if (appState.expandedTab === tab) {
        appState.expandedTab = null;
    } else {
        appState.expandedTab = tab;
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
    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    const settings = extension_settings[extensionName];
    const keywords = settings?.anchorKeywords || defaultSettings.anchorKeywords;
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">锚点注入</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            ${anchors ? `
                <div class="toolbox-char-info">
                    <span class="toolbox-char-name">${anchors.name}</span>
                    ${anchors.corePoints.length > 0 ? `
                        <div class="toolbox-core-points">
                            <span class="toolbox-section-label">核心设定</span>
                            <ul>
                                ${anchors.corePoints.map(p => `<li>${p}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            ` : '<div class="toolbox-no-char">暂无角色信息</div>'}
            <div class="toolbox-mode-selector">
                <span class="toolbox-section-label">注入模式</span>
                <div class="toolbox-mode-buttons">
                    <button class="toolbox-mode-btn ${settings.injectMode === 'temporary' ? 'active' : ''}" data-mode="temporary">临时注入</button>
                    <button class="toolbox-mode-btn ${settings.injectMode === 'continuous' ? 'active' : ''}" data-mode="continuous">持续注入</button>
                    <button class="toolbox-mode-btn ${settings.injectMode === 'emergency' ? 'active' : ''}" data-mode="emergency">紧急修复</button>
                </div>
            </div>
            <div class="toolbox-keywords">
                <span class="toolbox-section-label">自定义关键词</span>
                <div class="toolbox-keyword-input">
                    <input type="text" id="toolbox-new-keyword" placeholder="输入新关键词" />
                    <button id="toolbox-add-keyword">添加</button>
                </div>
                <div class="toolbox-keyword-list">
                    ${keywords.map((kw, i) => `
                        <span class="toolbox-keyword-tag">
                            ${kw}
                            <button class="toolbox-keyword-remove" data-index="${i}">×</button>
                        </span>
                    `).join('')}
                </div>
            </div>
            <div class="toolbox-actions">
                <button id="toolbox-inject-anchor-btn" class="toolbox-primary-btn">一键注入锚点</button>
            </div>
        </div>
    `;
}

function renderOocContent() {
    const conflicts = detectOOC();
    const suggestions = conflicts ? generateFixSuggestions(conflicts) : [];
    return `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">OOC检测</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            <button id="toolbox-run-ooc" class="toolbox-primary-btn">运行检测</button>
            ${conflicts ? `
                <div class="toolbox-conflict-results">
                    <div class="toolbox-conflict-title">检测结果: ${conflicts.length} 个冲突</div>
                    <div class="toolbox-conflict-list">
                        ${conflicts.map((c, i) => `
                            <div class="toolbox-conflict-item ${c.severity}">
                                <span class="toolbox-severity-badge">${c.severity === 'high' ? '高' : c.severity === 'medium' ? '中' : '低'}</span>
                                <span class="toolbox-conflict-text">${c.message}</span>
                            </div>
                        `).join('')}
                    </div>
                    ${suggestions.length > 0 ? `
                        <div class="toolbox-suggestions">
                            <div class="toolbox-suggestions-title">修正建议</div>
                            <div class="toolbox-suggestion-list">
                                ${suggestions.map((s, i) => `
                                    <button class="toolbox-suggestion-btn" data-text="${s}">${i + 1}. ${s}</button>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    <button id="toolbox-fix-ooc" class="toolbox-primary-btn">一键修复</button>
                </div>
            ` : '<div class="toolbox-no-conflict">未检测到OOC冲突</div>'}
        </div>
    `;
}

function renderStateContent() {
    const context = getContext();
    const charName = context?.name || '未知角色';
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
                <span class="toolbox-content-title">角色状态</span>
                <span class="toolbox-content-close" onclick="toggleTab(null)">×</span>
            </div>
            <div class="toolbox-current-state">
                <div class="toolbox-char-name">${charName}</div>
                <div class="toolbox-emotion-display" style="background: ${emotionColors[states.emotion]}20; border-color: ${emotionColors[states.emotion]}">
                    <span class="toolbox-emotion-label">当前情绪</span>
                    <span class="toolbox-emotion-value" style="color: ${emotionColors[states.emotion]}">${emotionLabels[states.emotion]}</span>
                </div>
            </div>
            <div class="toolbox-custom-fields">
                <span class="toolbox-section-label">自定义字段</span>
                <div class="toolbox-field-input">
                    <input type="text" id="toolbox-field-name" placeholder="字段名" />
                    <input type="text" id="toolbox-field-value" placeholder="值" />
                    <button id="toolbox-add-field">添加</button>
                </div>
                <div class="toolbox-custom-fields-list">
                    ${Object.keys(states.customFields).map(key => `
                        <span class="toolbox-custom-field">
                            ${key}: ${states.customFields[key]}
                            <button class="toolbox-remove-field" data-field="${key}">×</button>
                        </span>
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
        const conflicts = detectOOC();
        const suggestions = generateFixSuggestions(conflicts);
        if (suggestions.length > 0) {
            const input = getMessageInput();
            if (input.length) {
                input.val('[OOC修复]\n' + suggestions.join('\n'));
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
        const context = getContext();
        const charName = context?.name || '角色';
        const states = appState.charStates;
        let stateText = `[角色状态: ${charName}]\n情绪: ${states.emotion}\n`;
        Object.keys(states.customFields).forEach(key => {
            stateText += `${key}: ${states.customFields[key]}\n`;
        });
        const input = getMessageInput();
        if (input.length) {
            const currentText = input.val() || '';
            input.val(currentText ? currentText + '\n\n' + stateText : stateText);
            input.focus();
            toggleTab(null);
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
                <button id="toolbox-anchor-btn" class="toolbox-main-btn">
                    锚点
                </button>
                <button id="toolbox-ooc-btn" class="toolbox-main-btn">
                    检测
                </button>
                <button id="toolbox-state-btn" class="toolbox-main-btn">
                    状态
                </button>
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
