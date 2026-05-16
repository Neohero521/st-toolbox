import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        actionFormat: true,
        quoteFormat: true,
        copyLast: true,
        clearRegen: true,
        systemPrompt: true,
        chatStats: true,
    },
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const settings = extension_settings[extensionName];
    $('#enable_toolbox').prop('checked', settings.enabled).trigger('input');

    const tools = settings.tools;
    $('#tool_action_format').prop('checked', tools.actionFormat !== false).trigger('input');
    $('#tool_quote_format').prop('checked', tools.quoteFormat !== false).trigger('input');
    $('#tool_copy_last').prop('checked', tools.copyLast !== false).trigger('input');
    $('#tool_clear_regen').prop('checked', tools.clearRegen !== false).trigger('input');
    $('#tool_system_prompt').prop('checked', tools.systemPrompt !== false).trigger('input');
    $('#tool_chat_stats').prop('checked', tools.chatStats !== false).trigger('input');

    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools;

    $('#toolbox_action_format_btn').toggle(tools.actionFormat !== false);
    $('#toolbox_quote_format_btn').toggle(tools.quoteFormat !== false);
    $('#toolbox_copy_last_btn').toggle(tools.copyLast !== false);
    $('#toolbox_clear_regen_btn').toggle(tools.clearRegen !== false);
    $('#toolbox_system_prompt_btn').toggle(tools.systemPrompt !== false);
    $('#toolbox_chat_stats_btn').toggle(tools.chatStats !== false);

    const allHidden = !tools.actionFormat && !tools.quoteFormat && !tools.copyLast &&
                      !tools.clearRegen && !tools.systemPrompt && !tools.chatStats;

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

// 1. 动作格式包裹
function wrapAction() {
    const input = getMessageInput();
    if (!input.length) return;

    const startPos = input.prop('selectionStart');
    const endPos = input.prop('selectionEnd');
    const currentText = input.val() || '';

    if (startPos === endPos) {
        input.val(currentText + '*');
        input.prop('selectionStart', startPos + 1);
        input.prop('selectionEnd', startPos + 1);
    } else {
        const selectedText = currentText.substring(startPos, endPos);
        const newText = currentText.substring(0, startPos) + '*' + selectedText + '*' + currentText.substring(endPos);
        input.val(newText);
    }
    input.focus();
}

// 2. 对话格式包裹
function wrapQuote() {
    const input = getMessageInput();
    if (!input.length) return;

    const startPos = input.prop('selectionStart');
    const endPos = input.prop('selectionEnd');
    const currentText = input.val() || '';

    if (startPos === endPos) {
        input.val(currentText + '"');
        input.prop('selectionStart', startPos + 1);
        input.prop('selectionEnd', startPos + 1);
    } else {
        const selectedText = currentText.substring(startPos, endPos);
        const newText = currentText.substring(0, startPos) + '"' + selectedText + '"' + currentText.substring(endPos);
        input.val(newText);
    }
    input.focus();
}

// 3. 复制上一条AI消息
function copyLastMessage() {
    const input = getMessageInput();
    if (!input.length) return;

    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return;
    }

    const messages = context.chat.filter(m => m.is_user === false && m.mes);
    if (messages.length === 0) {
        return;
    }

    const lastMessage = messages[messages.length - 1].mes;
    input.val(lastMessage);
    input.focus();
}

// 4. 清空并准备重新生成
function clearAndRegen() {
    const input = getMessageInput();
    if (!input.length) return;

    input.val('');
    input.focus();

    const regenBtn = $('#regen');
    if (regenBtn.length) {
        regenBtn.click();
    }
}

// 5. 插入系统提示
function insertSystemPrompt() {
    const input = getMessageInput();
    if (!input.length) return;

    const systemPrompts = [
        '[System: Continue the scene naturally.]',
        '[System: Be descriptive and detailed.]',
        '[System: Keep responses concise.]',
        '[System: Advance the plot.]',
        '[System: Focus on character emotions.]',
    ];

    const randomPrompt = systemPrompts[Math.floor(Math.random() * systemPrompts.length)];
    const currentText = input.val() || '';
    const newText = currentText ? randomPrompt + '\n\n' + currentText : randomPrompt;

    input.val(newText);
    input.focus();
}

// 6. 显示聊天统计
function showChatStats() {
    const input = getMessageInput();
    if (!input.length) return;

    const context = getContext();
    if (!context || !context.chat) {
        return;
    }

    const totalMessages = context.chat.length;
    const userMessages = context.chat.filter(m => m.is_user).length;
    const aiMessages = context.chat.filter(m => !m.is_user).length;
    const charName = context.name || '角色';

    const stats = `📊 聊天统计\n` +
                  `━━━━━━━━━━━━━━━━━━\n` +
                  `总消息数: ${totalMessages}\n` +
                  `用户消息: ${userMessages}\n` +
                  `${charName}消息: ${aiMessages}\n` +
                  `━━━━━━━━━━━━━━━━━━`;

    const currentText = input.val() || '';
    input.val(currentText ? currentText + '\n\n' + stats : stats);
    input.focus();
}

jQuery(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <span>⚡</span>
    <button id="toolbox_action_format_btn" class="toolbox-btn" title="动作格式 - 用*包裹选中文本">
        <span class="btn-icon">*</span>
        <span class="btn-text">动作</span>
    </button>
    <button id="toolbox_quote_format_btn" class="toolbox-btn" title="对话格式 - 用\"包裹选中文本">
        <span class="btn-icon">"</span>
        <span class="btn-text">对话</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_copy_last_btn" class="toolbox-btn" title="复制上条 - 复制AI最后一条回复">
        <span class="btn-icon">📋</span>
        <span class="btn-text">复制</span>
    </button>
    <button id="toolbox_clear_regen_btn" class="toolbox-btn" title="清空重发 - 清空输入框并重新生成">
        <span class="btn-icon">🔄</span>
        <span class="btn-text">重发</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_system_prompt_btn" class="toolbox-btn" title="系统提示 - 插入快捷系统指令">
        <span class="btn-icon">⚙️</span>
        <span class="btn-text">系统</span>
    </button>
    <button id="toolbox_chat_stats_btn" class="toolbox-btn" title="聊天统计 - 显示当前聊天统计信息">
        <span class="btn-icon">📊</span>
        <span class="btn-text">统计</span>
    </button>
</div>`;

    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }

    $('#enable_toolbox').on('input', onEnableInput);
    $('#tool_action_format').on('input', onToolVisibilityChange('actionFormat'));
    $('#tool_quote_format').on('input', onToolVisibilityChange('quoteFormat'));
    $('#tool_copy_last').on('input', onToolVisibilityChange('copyLast'));
    $('#tool_clear_regen').on('input', onToolVisibilityChange('clearRegen'));
    $('#tool_system_prompt').on('input', onToolVisibilityChange('systemPrompt'));
    $('#tool_chat_stats').on('input', onToolVisibilityChange('chatStats'));

    $('#toolbox_action_format_btn').on('click', wrapAction);
    $('#toolbox_quote_format_btn').on('click', wrapQuote);
    $('#toolbox_copy_last_btn').on('click', copyLastMessage);
    $('#toolbox_clear_regen_btn').on('click', clearAndRegen);
    $('#toolbox_system_prompt_btn').on('click', insertSystemPrompt);
    $('#toolbox_chat_stats_btn').on('click', showChatStats);

    loadSettings();
});
