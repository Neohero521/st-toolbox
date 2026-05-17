import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        anchorInject: true,
        quickFix: true,
        charState: true,
        clearInput: true,
        quickSwipe: true,
        charInfo: true,
    },
    anchorKeywords: ['绝对不能暴露身份', '保持傲娇属性', '说话方式固定', '核心设定不可改变'],
};

// 工具函数：获取角色设定提取器
function extractCharacterAnchors(context) {
    if (!context) return null;
    
    const anchors = {
        name: context.name || '未知角色',
        personality: context.personality || '',
        scenario: context.scenario || '',
        description: context.description || '',
        firstMessage: context.first_mes || '',
        tags: context.tags || [],
    };

    // 智能提取核心设定
    const corePoints = [];
    
    // 从Personality提取
    if (anchors.personality) {
        const personalityPoints = anchors.personality.split(/[\n.。；;]+/).filter(p => p.trim().length > 5);
        corePoints.push(...personalityPoints.slice(0, 5));
    }
    
    // 从Description提取
    if (anchors.description) {
        const descPoints = anchors.description.split(/[\n.。；;]+/).filter(p => p.trim().length > 10);
        corePoints.push(...descPoints.slice(0, 5));
    }
    
    anchors.corePoints = corePoints.filter(p => p.length > 5).slice(0, 8);
    return anchors;
}

// 生成权重锚点文本
function generateWeightedAnchor(anchors, mode = 'temporary') {
    const name = anchors.name;
    
    let weightText = '';
    
    // 根据不同模式生成不同权重的文本
    if (mode === 'emergency') {
        weightText = `\n【⚠️ 最高优先级⚠️ 】\n\n### 绝对不可逾越的核心设定：\n`;
    } else if (mode === 'continuous') {
        weightText = `\n【🔒 持续锚点 🔒】\n\n### 必须遵守的核心设定：\n`;
    } else {
        weightText = `\n【📌 设定锚点】\n\n### 核心设定提醒：\n`;
    }
    
    // 添加核心设定点
    if (anchors.corePoints && anchors.corePoints.length > 0) {
        anchors.corePoints.forEach((point, idx) => {
            const marker = mode === 'emergency' ? '💎' : '✨';
            weightText += `${marker} ${point.trim()}\n`;
        });
    }
    
    // 添加用户自定义锚点关键词
    const userKeywords = extension_settings[extensionName]?.anchorKeywords || defaultSettings.anchorKeywords;
    if (userKeywords && userKeywords.length > 0) {
        weightText += `\n🎯 用户设定关键词：\n`;
        userKeywords.forEach(keyword => {
            weightText += `• ${keyword}\n`;
        });
    }
    
    weightText += `\n【${name}的性格特点保持一致】\n`;
    
    return weightText;
}

// 锚点注入模式管理器
const anchorMode = {
    current: 'temporary',
    rounds: 0,
    lastInjected: false,
    history: [],
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const settings = extension_settings[extensionName];
    $('#enable_toolbox').prop('checked', settings.enabled).trigger('input');

    const tools = settings.tools;
    $('#tool_anchor_inject').prop('checked', tools.anchorInject !== false).trigger('input');
    $('#tool_quick_fix').prop('checked', tools.quickFix !== false).trigger('input');
    $('#tool_char_state').prop('checked', tools.charState !== false).trigger('input');
    $('#tool_clear_input').prop('checked', tools.clearInput !== false).trigger('input');
    $('#tool_quick_swipe').prop('checked', tools.quickSwipe !== false).trigger('input');
    $('#tool_char_info').prop('checked', tools.charInfo !== false).trigger('input');

    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools;

    $('#toolbox_anchor_inject_btn').toggle(tools.anchorInject !== false);
    $('#toolbox_quick_fix_btn').toggle(tools.quickFix !== false);
    $('#toolbox_char_state_btn').toggle(tools.charState !== false);
    $('#toolbox_clear_input_btn').toggle(tools.clearInput !== false);
    $('#toolbox_quick_swipe_btn').toggle(tools.quickSwipe !== false);
    $('#toolbox_char_info_btn').toggle(tools.charInfo !== false);

    const allHidden = !tools.anchorInject && !tools.quickFix && !tools.charState &&
                      !tools.clearInput && !tools.quickSwipe && !tools.charInfo;

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
        extension_settings[extensionName].tools[toolKey] = checked;
        saveSettingsDebounced();
        updateToolVisibility();
    };
}

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

// 1. 核心功能：角色设定锚点注入器
function injectCharacterAnchor() {
    const input = getMessageInput();
    if (!input.length) return;

    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    
    if (!anchors) {
        toastr.warning('无法获取角色信息');
        return;
    }
    
    // 生成锚点文本
    const anchorText = generateWeightedAnchor(anchors, anchorMode.current);
    
    const currentText = input.val() || '';
    const newText = currentText + (currentText ? '\n\n' : '') + anchorText;
    
    input.val(newText);
    input.focus();
    
    anchorMode.lastInjected = true;
    
    toastr.success(`已注入${anchors.name}的设定锚点`);
}

// 切换锚点模式
function cycleAnchorMode() {
    const modes = ['temporary', 'continuous', 'emergency'];
    const currentIdx = modes.indexOf(anchorMode.current);
    anchorMode.current = modes[(currentIdx + 1) % modes.length];
    
    const modeNames = {
        'temporary': '临时',
        'continuous': '持续',
        'emergency': '紧急',
    };
    
    toastr.info(`锚点模式切换为：${modeNames[anchorMode.current]}`, '模式切换');
}

// 2. 快速OOC修复
function quickOOCFix() {
    const input = getMessageInput();
    if (!input.length) return;
    
    const context = getContext();
    const anchors = extractCharacterAnchors(context);
    
    if (!anchors) {
        toastr.warning('无法获取角色信息');
        return;
    }
    
    const fixPrompt = `\n[OOC检测与修复：\n请重新审视上一条回复，确保严格遵守${anchors.name}的性格和设定一致，不要OOC！\n如有不符合设定的内容，请重新生成。]`;
    
    const currentText = input.val() || '';
    input.val(currentText + (currentText ? '\n\n' : '') + fixPrompt);
    input.focus();
    
    toastr.success('已插入OOC修复提示');
}

// 3. 角色状态查看
function showCharState() {
    const input = getMessageInput();
    if (!input.length) return;
    
    const context = getContext();
    if (!context || !context.name) {
        return;
    }
    
    const charName = context.name;
    
    // 获取上一条消息提取关键词（简单实现）
    const chat = context.chat || [];
    const lastAIMsg = chat.filter(m => !m.is_user).slice(-1)[0];
    
    let emotion = '中性';
    if (lastAIMsg && lastAIMsg.mes) {
        const msg = lastAIMsg.mes.toLowerCase();
        if (msg.includes('笑') || msg.includes('开心') || msg.includes('高兴') || msg.includes('😊')) emotion = '开心';
        else if (msg.includes('生气') || msg.includes('愤怒') || msg.includes('怒') || msg.includes('😠')) emotion = '愤怒';
        else if (msg.includes('害羞') || msg.includes('脸红') || msg.includes('羞涩')) emotion = '害羞';
        else if (msg.includes('伤心') || msg.includes('难过') || msg.includes('哭')) emotion = '悲伤';
        else if (msg.includes('惊讶') || msg.includes('吃惊') || msg.includes('😮')) emotion = '惊讶';
    }
    
    const stateText = `\n[角色状态：${charName}\n当前情绪：${emotion}\n对话轮数：${chat.length}\n]`;
    
    const currentText = input.val() || '';
    input.val(currentText + (currentText ? '\n\n' : '') + stateText);
    input.focus();
}

// 4. 清空输入框
function clearInput() {
    const input = getMessageInput();
    if (!input.length) return;
    input.val('');
    input.focus();
}

// 5. 快速Swipe
function quickSwipe() {
    const swipeBtn = $('.swipe_right');
    if (swipeBtn.length) {
        swipeBtn.click();
    } else {
        const altBtn = $('.swipe_alt');
        if (altBtn.length) {
            altBtn.click();
        }
    }
}

// 6. 角色信息
function showCharInfo() {
    const context = getContext();
    if (!context || !context.name) {
        return;
    }

    const input = getMessageInput();
    if (!input.length) return;

    const charName = context.name;
    const charDesc = context.description ? context.description.substring(0, 150) : '无描述';
    const charPersona = context.personality ? context.personality.substring(0, 100) : '无个性设定';

    const info = `【${charName}】\n描述: ${charDesc}${context.description && context.description.length > 150 ? '...' : ''}\n个性: ${charPersona}${context.personality && context.personality.length > 100 ? '...' : ''}`;

    const currentText = input.val() || '';
    input.val(currentText ? currentText + '\n\n' + info : info);
    input.focus();
}

jQuery(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <span>⚡</span>
    <button id="toolbox_anchor_inject_btn" class="toolbox-btn" title="锚点注入 - 强化角色设定防止OOC">
        <span class="btn-icon">🔒</span>
        <span class="btn-text">锚点</span>
    </button>
    <button id="toolbox_quick_fix_btn" class="toolbox-btn" title="OOC修复 - 快速修复角色崩坏">
        <span class="btn-icon">🛠️</span>
        <span class="btn-text">修复</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_char_state_btn" class="toolbox-btn" title="状态追踪 - 查看角色状态">
        <span class="btn-icon">📊</span>
        <span class="btn-text">状态</span>
    </button>
    <button id="toolbox_clear_input_btn" class="toolbox-btn" title="清空 - 一键清空输入框">
        <span class="btn-icon">🗑️</span>
        <span class="btn-text">清空</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_quick_swipe_btn" class="toolbox-btn" title="Swipe - 快速切换AI回复">
        <span class="btn-icon">🔄</span>
        <span class="btn-text">Swipe</span>
    </button>
    <button id="toolbox_char_info_btn" class="toolbox-btn" title="角色 - 查看角色信息">
        <span class="btn-icon">🎭</span>
        <span class="btn-text">角色</span>
    </button>
</div>`;

    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }

    $('#enable_toolbox').on('input', onEnableInput);
    $('#tool_anchor_inject').on('input', onToolVisibilityChange('anchorInject'));
    $('#tool_quick_fix').on('input', onToolVisibilityChange('quickFix'));
    $('#tool_char_state').on('input', onToolVisibilityChange('charState'));
    $('#tool_clear_input').on('input', onToolVisibilityChange('clearInput'));
    $('#tool_quick_swipe').on('input', onToolVisibilityChange('quickSwipe'));
    $('#tool_char_info').on('input', onToolVisibilityChange('charInfo'));

    $('#toolbox_anchor_inject_btn').on('click', injectCharacterAnchor);
    $('#toolbox_anchor_inject_btn').on('contextmenu', function(e) { e.preventDefault(); cycleAnchorMode(); });
    $('#toolbox_quick_fix_btn').on('click', quickOOCFix);
    $('#toolbox_char_state_btn').on('click', showCharState);
    $('#toolbox_clear_input_btn').on('click', clearInput);
    $('#toolbox_quick_swipe_btn').on('click', quickSwipe);
    $('#toolbox_char_info_btn').on('click', showCharInfo);

    loadSettings();
});
