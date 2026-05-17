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

// 全局状态
const appState = {
    currentTab: 'anchor',
    lastOOCResult: null,
    charStates: {
        emotion: 'neutral',
        emotionHistory: [],
        customFields: {},
    },
};

// 提取角色设定
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

// 生成权重锚点文本
function generateWeightedAnchor(anchors, mode = 'temporary') {
    const name = anchors.name;
    const settings = extension_settings[extensionName];
    
    let weightText = '';
    let weightTag = '';
    
    switch(mode) {
        case 'emergency':
            weightTag = '[最高优先级]';
            weightText = `\n${weightTag}\n\n### 绝对不可逾越的核心设定：\n`;
            break;
        case 'continuous':
            weightTag = '[持续锚点]';
            weightText = `\n${weightTag}\n\n### 必须遵守的核心设定：\n`;
            break;
        default:
            weightTag = '[设定锚点]';
            weightText = `\n${weightTag}\n\n### 核心设定提醒：\n`;
    }
    
    if (anchors.corePoints && anchors.corePoints.length > 0) {
        anchors.corePoints.forEach((point, idx) => {
            const marker = mode === 'emergency' ? '💎' : '✨';
            weightText += `${marker} ${point.trim()}\n`;
        });
    }
    
    const userKeywords = settings?.anchorKeywords || defaultSettings.anchorKeywords;
    if (userKeywords && userKeywords.length > 0) {
        weightText += `\n🎯 用户设定关键词：\n`;
        userKeywords.forEach(keyword => {
            weightText += `  - ${keyword}\n`;
        });
    }
    
    weightText += `\n[${name}的性格特点保持一致]\n`;
    
    return weightText;
}

// 模拟OOC检测
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
    
    // 简单的规则匹配检测
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
    
    if (personality.includes('冷酷') || personality.includes('冷漠')) {
        if (msg.includes('温柔') || msg.includes('关心') || msg.includes('温暖')) {
            conflicts.push({
                type: 'emotion',
                message: '角色设定为冷酷，但回复表现出温柔情感',
                severity: 'medium',
            });
        }
    }
    
    // 检测回复长度是否异常
    if (msg.length < 20) {
        conflicts.push({
            type: 'length',
            message: '回复过短，可能不符合角色设定的丰富性要求',
            severity: 'low',
        });
    }
    
    return conflicts.length > 0 ? conflicts : null;
}

// 生成修正方案
function generateFixSuggestions(conflicts) {
    if (!conflicts || conflicts.length === 0) return [];
    
    const suggestions = [];
    
    conflicts.forEach(conflict => {
        switch(conflict.type) {
            case 'speech':
                suggestions.push('请保持角色沉默的设定，通过动作和表情来表达');
                suggestions.push('用省略号或沉默回应，表示角色不想说话');
                suggestions.push('让角色通过书写或手势来交流');
                break;
            case 'behavior':
                suggestions.push('请保持角色害羞内向的性格，减少主动行为');
                suggestions.push('让角色说话时更加犹豫和含蓄');
                suggestions.push('增加角色脸红、低头等害羞表现');
                break;
            case 'emotion':
                suggestions.push('请保持角色冷酷的性格，减少情感表达');
                suggestions.push('用简洁冷漠的语言回应');
                suggestions.push('避免使用温暖关怀的词汇');
                break;
            case 'length':
                suggestions.push('请增加回复的细节和描述');
                suggestions.push('添加更多角色动作和心理活动');
                suggestions.push('扩展场景描述和对话内容');
                break;
        }
    });
    
    return [...new Set(suggestions)].slice(0, 3);
}

// 提取情绪
function extractEmotion(msg) {
    if (!msg) return 'neutral';
    
    const lowerMsg = msg.toLowerCase();
    
    if (lowerMsg.includes('笑') || lowerMsg.includes('开心') || lowerMsg.includes('高兴') || 
        lowerMsg.includes('😊') || lowerMsg.includes('😄')) return 'happy';
    
    if (lowerMsg.includes('生气') || lowerMsg.includes('愤怒') || lowerMsg.includes('怒') || 
        lowerMsg.includes('😠') || lowerMsg.includes('💢')) return 'angry';
    
    if (lowerMsg.includes('害羞') || lowerMsg.includes('脸红') || lowerMsg.includes('羞涩') ||
        lowerMsg.includes('😳')) return 'shy';
    
    if (lowerMsg.includes('伤心') || lowerMsg.includes('难过') || lowerMsg.includes('哭') ||
        lowerMsg.includes('😢') || lowerMsg.includes('😭')) return 'sad';
    
    if (lowerMsg.includes('惊讶') || lowerMsg.includes('吃惊') || lowerMsg.includes('😮')) return 'surprised';
    
    return 'neutral';
}

// 更新角色状态
function updateCharState() {
    const context = getContext();
    if (!context || !context.chat) return;
    
    const lastAIMsg = context.chat.filter(m => !m.is_user).slice(-1)[0];
    if (!lastAIMsg) return;
    
    const emotion = extractEmotion(lastAIMsg.mes);
    appState.charStates.emotion = emotion;
    
    if (appState.charStates.emotionHistory.length >= 10) {
        appState.charStates.emotionHistory.shift();
    }
    appState.charStates.emotionHistory.push({
        emotion,
        timestamp: Date.now(),
    });
}

// 加载设置
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
    
    $('#toolbox_anchor_inject_btn').toggle(tools.anchorInject !== false);
    $('#toolbox_ooc_detect_btn').toggle(tools.oocDetect !== false);
    $('#toolbox_char_state_btn').toggle(tools.charState !== false);
    
    const allHidden = !tools.anchorInject && !tools.oocDetect && !tools.charState;
    
    if (allHidden || !settings.enabled) {
        $('#toolbox_toolbar').hide();
    } else {
        $('#toolbox_toolbar').show();
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

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

// 注入锚点
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
    
    toastr.success(`已注入${anchors.name}的设定锚点`);
}

// 打开二级面板
function openPanel(tab) {
    appState.currentTab = tab;
    updatePanelContent();
    $('#toolbox_panel').show();
}

// 关闭二级面板
function closePanel() {
    $('#toolbox_panel').hide();
}

// 更新面板内容
function updatePanelContent() {
    const tab = appState.currentTab;
    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    
    let content = '';
    
    switch(tab) {
        case 'anchor':
            content = renderAnchorPanel(anchors);
            break;
        case 'ooc':
            content = renderOocPanel();
            break;
        case 'state':
            content = renderStatePanel();
            break;
    }
    
    $('#toolbox_panel_content').html(content);
    bindPanelEvents();
}

// 渲染锚点面板
function renderAnchorPanel(anchors) {
    const settings = extension_settings[extensionName];
    const keywords = settings?.anchorKeywords || [];
    
    return `
<div class="panel-section">
    <h3>角色设定锚点注入器</h3>
    <p class="panel-desc">强化角色设定，防止OOC（角色崩坏）</p>
    
    ${anchors ? `
    <div class="char-info">
        <h4>${anchors.name}</h4>
        ${anchors.corePoints.length > 0 ? `
        <div class="core-points">
            <h5>核心设定点：</h5>
            <ul>
                ${anchors.corePoints.map(p => `<li>${p}</li>`).join('')}
            </ul>
        </div>` : ''}
    </div>` : '<p class="no-char">暂无角色信息</p>'}
    
    <div class="mode-selector">
        <h5>注入模式：</h5>
        <div class="mode-buttons">
            <button class="mode-btn ${settings.injectMode === 'temporary' ? 'active' : ''}" data-mode="temporary">临时注入</button>
            <button class="mode-btn ${settings.injectMode === 'continuous' ? 'active' : ''}" data-mode="continuous">持续注入</button>
            <button class="mode-btn ${settings.injectMode === 'emergency' ? 'active' : ''}" data-mode="emergency">紧急修复</button>
        </div>
        <p class="mode-desc">
            ${settings.injectMode === 'temporary' ? '仅对下一条回复生效' : 
              settings.injectMode === 'continuous' ? `每${settings.autoInjectInterval}轮自动重注` : '最高优先级强制修复'}
        </p>
    </div>
    
    <div class="keywords-section">
        <h5>自定义锚点关键词：</h5>
        <input type="text" id="new_keyword" placeholder="输入新的关键词" />
        <button id="add_keyword">添加</button>
        <ul id="keyword_list">
            ${keywords.map((kw, i) => `<li>${kw} <button class="delete-keyword" data-index="${i}">×</button></li>`).join('')}
        </ul>
    </div>
    
    <div class="auto-inject-section">
        <label>
            <input type="checkbox" id="auto_inject" ${settings.injectMode === 'continuous' ? 'checked' : ''} />
            每 <input type="number" id="inject_interval" value="${settings.autoInjectInterval || 5}" min="1" max="20" /> 轮自动注入
        </label>
    </div>
    
    <div class="panel-actions">
        <button id="inject_anchor" class="primary-btn">一键注入锚点</button>
        <button id="copy_anchor">复制锚点文本</button>
    </div>
</div>`;
}

// 渲染OOC检测面板
function renderOocPanel() {
    const conflicts = detectOOC();
    const suggestions = conflicts ? generateFixSuggestions(conflicts) : [];
    appState.lastOOCResult = conflicts;
    
    return `
<div class="panel-section">
    <h3>OOC实时检测</h3>
    <p class="panel-desc">分析AI回复与角色设定的一致性</p>
    
    <button id="run_ooc_check" class="primary-btn">运行检测</button>
    
    ${conflicts ? `
    <div class="conflict-results">
        <h4>检测结果：发现 ${conflicts.length} 个冲突</h4>
        <div class="conflict-list">
            ${conflicts.map((c, i) => `
            <div class="conflict-item ${c.severity}">
                <span class="severity-badge">${c.severity === 'high' ? '高' : c.severity === 'medium' ? '中' : '低'}</span>
                <p>${c.message}</p>
            </div>`).join('')}
        </div>
        
        ${suggestions.length > 0 ? `
        <div class="suggestions">
            <h4>修正建议：</h4>
            <ul>
                ${suggestions.map((s, i) => `<li><button class="suggestion-btn" data-index="${i}">${i+1}. ${s}</button></li>`).join('')}
            </ul>
        </div>` : ''}
        
        <button id="fix_ooc" class="primary-btn">一键修复</button>
    </div>` : '<p class="no-conflict">未检测到OOC冲突</p>'}
</div>`;
}

// 渲染状态追踪面板
function renderStatePanel() {
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
<div class="panel-section">
    <h3>角色状态追踪</h3>
    <p class="panel-desc">实时记录角色情绪和自定义状态</p>
    
    <div class="current-state">
        <h4>${charName}</h4>
        <div class="emotion-display" style="background: ${emotionColors[states.emotion]}20; border-color: ${emotionColors[states.emotion]}">
            <span class="emotion-label">当前情绪：</span>
            <span class="emotion-value" style="color: ${emotionColors[states.emotion]}">${emotionLabels[states.emotion]}</span>
        </div>
    </div>
    
    ${states.emotionHistory.length > 0 ? `
    <div class="emotion-history">
        <h5>情绪变化记录：</h5>
        <div class="emotion-chart">
            ${states.emotionHistory.map((e, i) => `
            <div class="chart-bar" style="background: ${emotionColors[e.emotion]}" title="${emotionLabels[e.emotion]}"></div>
            `).join('')}
        </div>
    </div>` : ''}
    
    <div class="custom-fields">
        <h5>自定义状态字段：</h5>
        <div class="field-input">
            <input type="text" id="field_name" placeholder="字段名称" />
            <input type="text" id="field_value" placeholder="字段值" />
            <button id="add_field">添加</button>
        </div>
        <div id="custom_fields_list">
            ${Object.keys(states.customFields).map(k => `
            <div class="custom-field-item">
                <span>${k}：${states.customFields[k]}</span>
                <button class="delete-field" data-name="${k}">×</button>
            </div>`).join('')}
        </div>
    </div>
    
    <div class="panel-actions">
        <button id="inject_state" class="primary-btn">注入状态到对话</button>
        <button id="clear_state">重置状态</button>
    </div>
</div>`;
}

// 绑定面板事件
function bindPanelEvents() {
    // 锚点面板
    $('.mode-btn').off('click').on('click', function() {
        const mode = $(this).data('mode');
        extension_settings[extensionName].injectMode = mode;
        saveSettingsDebounced();
        $('.mode-btn').removeClass('active');
        $(this).addClass('active');
        updatePanelContent();
    });
    
    $('#add_keyword').off('click').on('click', function() {
        const keyword = $('#new_keyword').val().trim();
        if (!keyword) return;
        
        const settings = extension_settings[extensionName];
        if (!settings.anchorKeywords) settings.anchorKeywords = [];
        if (!settings.anchorKeywords.includes(keyword)) {
            settings.anchorKeywords.push(keyword);
            saveSettingsDebounced();
            updatePanelContent();
        }
        $('#new_keyword').val('');
    });
    
    $('.delete-keyword').off('click').on('click', function() {
        const index = $(this).data('index');
        const settings = extension_settings[extensionName];
        settings.anchorKeywords.splice(index, 1);
        saveSettingsDebounced();
        updatePanelContent();
    });
    
    $('#auto_inject').off('change').on('change', function() {
        const enabled = $(this).prop('checked');
        extension_settings[extensionName].injectMode = enabled ? 'continuous' : 'temporary';
        saveSettingsDebounced();
        updatePanelContent();
    });
    
    $('#inject_interval').off('change').on('change', function() {
        const val = parseInt($(this).val()) || 5;
        extension_settings[extensionName].autoInjectInterval = val;
        saveSettingsDebounced();
    });
    
    $('#inject_anchor').off('click').on('click', function() {
        const settings = extension_settings[extensionName];
        injectAnchorToInput(settings.injectMode);
        closePanel();
    });
    
    // OOC面板
    $('#run_ooc_check').off('click').on('click', function() {
        updatePanelContent();
    });
    
    $('.suggestion-btn').off('click').on('click', function() {
        const index = $(this).data('index');
        const suggestions = generateFixSuggestions(appState.lastOOCResult);
        if (suggestions[index]) {
            const input = getMessageInput();
            if (input.length) {
                input.val(suggestions[index]);
                input.focus();
                closePanel();
            }
        }
    });
    
    $('#fix_ooc').off('click').on('click', function() {
        const suggestions = generateFixSuggestions(appState.lastOOCResult);
        if (suggestions.length > 0) {
            const input = getMessageInput();
            if (input.length) {
                input.val('[OOC修复]\n' + suggestions.join('\n'));
                input.focus();
                closePanel();
            }
        }
    });
    
    // 状态面板
    $('#add_field').off('click').on('click', function() {
        const name = $('#field_name').val().trim();
        const value = $('#field_value').val().trim();
        if (!name) return;
        
        appState.charStates.customFields[name] = value || '0';
        saveSettingsDebounced();
        updatePanelContent();
        $('#field_name').val('');
        $('#field_value').val('');
    });
    
    $('.delete-field').off('click').on('click', function() {
        const name = $(this).data('name');
        delete appState.charStates.customFields[name];
        saveSettingsDebounced();
        updatePanelContent();
    });
    
    $('#inject_state').off('click').on('click', function() {
        const context = getContext();
        const charName = context?.name || '角色';
        const states = appState.charStates;
        
        let stateText = `[角色状态：${charName}]\n`;
        stateText += `情绪：${states.emotion}\n`;
        
        Object.keys(states.customFields).forEach(k => {
            stateText += `${k}：${states.customFields[k]}\n`;
        });
        
        const input = getMessageInput();
        if (input.length) {
            const currentText = input.val() || '';
            input.val(currentText + (currentText ? '\n\n' : '') + stateText);
            input.focus();
            closePanel();
        }
    });
    
    $('#clear_state').off('click').on('click', function() {
        appState.charStates = {
            emotion: 'neutral',
            emotionHistory: [],
            customFields: {},
        };
        updatePanelContent();
    });
}

// 初始化
jQuery(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);
    
    // 创建工具栏
    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <button id="toolbox_anchor_inject_btn" class="toolbox-btn" title="锚点注入 - 强化角色设定防止OOC">
        <span class="btn-text">锚点</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_ooc_detect_btn" class="toolbox-btn" title="OOC检测 - 检测角色设定冲突">
        <span class="btn-text">检测</span>
    </button>
    <button id="toolbox_char_state_btn" class="toolbox-btn" title="状态追踪 - 查看角色状态">
        <span class="btn-text">状态</span>
    </button>
</div>`;
    
    // 创建二级面板
    const panelHtml = `
<div id="toolbox_panel" style="display: none;">
    <div class="panel-overlay" onclick="closePanel()"></div>
    <div class="panel-container">
        <div class="panel-header">
            <h2>工具箱</h2>
            <button class="close-btn" onclick="closePanel()">×</button>
        </div>
        <div class="panel-tabs">
            <button class="tab-btn active" data-tab="anchor">锚点注入</button>
            <button class="tab-btn" data-tab="ooc">OOC检测</button>
            <button class="tab-btn" data-tab="state">状态追踪</button>
        </div>
        <div id="toolbox_panel_content" class="panel-content"></div>
    </div>
</div>`;
    
    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }
    
    $('body').append(panelHtml);
    
    // 工具栏事件
    $('#toolbox_anchor_inject_btn').on('click', () => openPanel('anchor'));
    $('#toolbox_ooc_detect_btn').on('click', () => openPanel('ooc'));
    $('#toolbox_char_state_btn').on('click', () => openPanel('state'));
    
    // 面板标签切换
    $('.tab-btn').on('click', function() {
        const tab = $(this).data('tab');
        appState.currentTab = tab;
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');
        updatePanelContent();
    });
    
    // 设置事件
    $('#enable_toolbox').on('input', onEnableInput);
    $('#tool_anchor_inject').on('input', onToolVisibilityChange('anchorInject'));
    $('#tool_ooc_detect').on('input', onToolVisibilityChange('oocDetect'));
    $('#tool_char_state').on('input', onToolVisibilityChange('charState'));
    
    loadSettings();
    
    // 绑定全局关闭函数
    window.closePanel = closePanel;
});
