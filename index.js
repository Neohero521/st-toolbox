import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        clearInput: true,
        quickSwipe: true,
        editLast: true,
        slashCommand: true,
        sysPrompt: true,
        charInfo: true,
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
    $('#tool_clear_input').prop('checked', tools.clearInput !== false).trigger('input');
    $('#tool_quick_swipe').prop('checked', tools.quickSwipe !== false).trigger('input');
    $('#tool_edit_last').prop('checked', tools.editLast !== false).trigger('input');
    $('#tool_slash_command').prop('checked', tools.slashCommand !== false).trigger('input');
    $('#tool_sys_prompt').prop('checked', tools.sysPrompt !== false).trigger('input');
    $('#tool_char_info').prop('checked', tools.charInfo !== false).trigger('input');

    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools;

    $('#toolbox_clear_input_btn').toggle(tools.clearInput !== false);
    $('#toolbox_quick_swipe_btn').toggle(tools.quickSwipe !== false);
    $('#toolbox_edit_last_btn').toggle(tools.editLast !== false);
    $('#toolbox_slash_command_btn').toggle(tools.slashCommand !== false);
    $('#toolbox_sys_prompt_btn').toggle(tools.sysPrompt !== false);
    $('#toolbox_char_info_btn').toggle(tools.charInfo !== false);

    const allHidden = !tools.clearInput && !tools.quickSwipe && !tools.editLast &&
                      !tools.slashCommand && !tools.sysPrompt && !tools.charInfo;

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

// 1. 快速清空输入框
function clearInput() {
    const input = getMessageInput();
    if (!input.length) return;

    input.val('');
    input.focus();
}

// 2. 快速Swipe（切换回复）
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

// 3. 编辑上一条回复
function editLast() {
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return;
    }

    const messages = context.chat.filter(m => !m.is_user && m.mes);
    if (messages.length === 0) {
        return;
    }

    const lastMessage = messages[messages.length - 1].mes;
    const input = getMessageInput();
    if (!input.length) return;

    input.val(lastMessage);
    input.focus();
}

// 4. 常用Slash命令
function insertSlashCommand() {
    const input = getMessageInput();
    if (!input.length) return;

    const commands = [
        '/continue',
        '/retry',
        '/impersonate',
        '/system ',
        '/memory ',
        '/roll ',
    ];

    const randomCommand = commands[Math.floor(Math.random() * commands.length)];
    const currentText = input.val() || '';
    input.val(currentText + randomCommand);
    input.focus();
}

// 5. 系统提示快捷插入
function insertSystemPrompt() {
    const input = getMessageInput();
    if (!input.length) return;

    const prompts = [
        '[Continue the scene.]',
        '[Be more descriptive.]',
        '[Stay in character.]',
        '[Advance the plot.]',
        '[Focus on dialogue.]',
    ];

    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    const currentText = input.val() || '';
    const newText = currentText ? currentText + '\n' + randomPrompt : randomPrompt;
    input.val(newText);
    input.focus();
}

// 6. 快速查看角色信息
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

    const info = `【${charName}】\n` +
                `描述: ${charDesc}${context.description && context.description.length > 150 ? '...' : ''}\n` +
                `个性: ${charPersona}${context.personality && context.personality.length > 100 ? '...' : ''}`;

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
    <button id="toolbox_clear_input_btn" class="toolbox-btn" title="清空 - 一键清空输入框">
        <span class="btn-icon">🗑️</span>
        <span class="btn-text">清空</span>
    </button>
    <button id="toolbox_quick_swipe_btn" class="toolbox-btn" title="Swipe - 快速切换AI回复">
        <span class="btn-icon">🔄</span>
        <span class="btn-text">Swipe</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_edit_last_btn" class="toolbox-btn" title="编辑 - 编辑上一条AI回复">
        <span class="btn-icon">✏️</span>
        <span class="btn-text">编辑</span>
    </button>
    <button id="toolbox_slash_command_btn" class="toolbox-btn" title="命令 - 插入常用Slash命令">
        <span class="btn-icon">/</span>
        <span class="btn-text">命令</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_sys_prompt_btn" class="toolbox-btn" title="系统 - 插入系统提示词">
        <span class="btn-icon">⚙️</span>
        <span class="btn-text">系统</span>
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
    $('#tool_clear_input').on('input', onToolVisibilityChange('clearInput'));
    $('#tool_quick_swipe').on('input', onToolVisibilityChange('quickSwipe'));
    $('#tool_edit_last').on('input', onToolVisibilityChange('editLast'));
    $('#tool_slash_command').on('input', onToolVisibilityChange('slashCommand'));
    $('#tool_sys_prompt').on('input', onToolVisibilityChange('sysPrompt'));
    $('#tool_char_info').on('input', onToolVisibilityChange('charInfo'));

    $('#toolbox_clear_input_btn').on('click', clearInput);
    $('#toolbox_quick_swipe_btn').on('click', quickSwipe);
    $('#toolbox_edit_last_btn').on('click', editLast);
    $('#toolbox_slash_command_btn').on('click', insertSlashCommand);
    $('#toolbox_sys_prompt_btn').on('click', insertSystemPrompt);
    $('#toolbox_char_info_btn').on('click', showCharInfo);

    loadSettings();
});
