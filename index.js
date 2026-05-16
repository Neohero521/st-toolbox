import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        quickTemplate: true,
        charPreview: true,
        formatText: true,
        emojiLibrary: true,
        tempWorldInfo: true,
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
    $('#tool_quick_template').prop('checked', tools.quickTemplate !== false).trigger('input');
    $('#tool_char_preview').prop('checked', tools.charPreview !== false).trigger('input');
    $('#tool_format_text').prop('checked', tools.formatText !== false).trigger('input');
    $('#tool_emoji_library').prop('checked', tools.emojiLibrary !== false).trigger('input');
    $('#tool_temp_worldinfo').prop('checked', tools.tempWorldInfo !== false).trigger('input');

    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools;

    $('#toolbox_quick_template_btn').toggle(tools.quickTemplate !== false);
    $('#toolbox_char_preview_btn').toggle(tools.charPreview !== false);
    $('#toolbox_format_text_btn').toggle(tools.formatText !== false);
    $('#toolbox_emoji_library_btn').toggle(tools.emojiLibrary !== false);
    $('#toolbox_temp_worldinfo_btn').toggle(tools.tempWorldInfo !== false);

    const allHidden = !tools.quickTemplate && !tools.charPreview && !tools.formatText &&
                      !tools.emojiLibrary && !tools.tempWorldInfo;

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

// 1. 快捷预设文本
function insertQuickTemplate() {
    const input = getMessageInput();
    if (!input.length) return;

    const templates = [
        '*微笑着看着你*',
        '*轻轻地点头*',
        '*思考片刻后说道*',
        '*好奇地歪着头*',
        '*缓步走向你*',
        '*突然笑出声*',
        '*惊讶地睁大眼睛*',
        '继续...',
        '接下来会发生什么？',
        '你觉得呢？',
    ];

    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    const startPos = input.prop('selectionStart');
    const endPos = input.prop('selectionEnd');
    const currentText = input.val() || '';
    const newText = currentText.substring(0, startPos) + randomTemplate + currentText.substring(endPos);

    input.val(newText);
    input.focus();
}

// 2. 角色卡片快速预览
function showCharPreview() {
    const context = getContext();
    if (!context || !context.name) {
        return;
    }

    const input = getMessageInput();
    if (!input.length) return;

    const charName = context.name;
    const charDescription = context.description ? context.description.substring(0, 100) : '暂无描述';
    const preview = `【${charName}】\n${charDescription}...`;

    const currentText = input.val() || '';
    if (currentText.includes(preview)) {
        return;
    }

    input.val(preview + '\n\n' + currentText);
    input.focus();
}

// 3. 文本格式化工具
function formatText() {
    const input = getMessageInput();
    if (!input.length) return;

    let text = input.val() || '';

    if (!text) return;

    text = text.trim();
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    if (!text.startsWith('*') && !text.startsWith('"') && text.length > 0) {
        const actionFormats = [
            `*${text}*`,
            `"${text}"`,
            text,
        ];
        const randomFormat = actionFormats[Math.floor(Math.random() * actionFormats.length)];
        text = randomFormat;
    }

    input.val(text);
    input.focus();
}

// 4. 表情/表情符号库
function insertEmoji() {
    const input = getMessageInput();
    if (!input.length) return;

    const emojis = [
        '😊', '😄', '🥰', '😎', '🤔',
        '😮', '😢', '😡', '😍', '🤗',
        '✨', '💫', '🌟', '❤️', '💕',
        '👍', '👋', '🙏', '🎉', '🎊',
    ];

    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const startPos = input.prop('selectionStart');
    const endPos = input.prop('selectionEnd');
    const currentText = input.val() || '';
    const newText = currentText.substring(0, startPos) + randomEmoji + currentText.substring(endPos);

    input.val(newText);
    input.focus();
}

// 5. 临时世界信息
function insertTempWorldInfo() {
    const input = getMessageInput();
    if (!input.length) return;

    const tempInfos = [
        '（当前场景：咖啡厅）',
        '（时间：傍晚）',
        '（天气：下雨）',
        '（心情：开心）',
        '（注意：角色有些害羞）',
    ];

    const randomInfo = tempInfos[Math.floor(Math.random() * tempInfos.length)];
    const currentText = input.val() || '';
    const newText = randomInfo + '\n' + currentText;

    input.val(newText);
    input.focus();
}

jQuery(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <span>⚡</span>
    <button id="toolbox_quick_template_btn" class="toolbox-btn" title="快捷预设 - 插入常用对话模板">
        <span class="btn-icon">📝</span>
        <span class="btn-text">预设</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_char_preview_btn" class="toolbox-btn" title="角色预览 - 查看当前角色信息">
        <span class="btn-icon">🎭</span>
        <span class="btn-text">角色</span>
    </button>
    <button id="toolbox_format_text_btn" class="toolbox-btn" title="格式化 - 自动格式化文本">
        <span class="btn-icon">✨</span>
        <span class="btn-text">格式</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_emoji_library_btn" class="toolbox-btn" title="表情库 - 插入随机表情">
        <span class="btn-icon">😊</span>
        <span class="btn-text">表情</span>
    </button>
    <button id="toolbox_temp_worldinfo_btn" class="toolbox-btn" title="临时信息 - 插入临时场景设定">
        <span class="btn-icon">📖</span>
        <span class="btn-text">场景</span>
    </button>
</div>`;

    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }

    $('#enable_toolbox').on('input', onEnableInput);
    $('#tool_quick_template').on('input', onToolVisibilityChange('quickTemplate'));
    $('#tool_char_preview').on('input', onToolVisibilityChange('charPreview'));
    $('#tool_format_text').on('input', onToolVisibilityChange('formatText'));
    $('#tool_emoji_library').on('input', onToolVisibilityChange('emojiLibrary'));
    $('#tool_temp_worldinfo').on('input', onToolVisibilityChange('tempWorldInfo'));

    $('#toolbox_quick_template_btn').on('click', insertQuickTemplate);
    $('#toolbox_char_preview_btn').on('click', showCharPreview);
    $('#toolbox_format_text_btn').on('click', formatText);
    $('#toolbox_emoji_library_btn').on('click', insertEmoji);
    $('#toolbox_temp_worldinfo_btn').on('click', insertTempWorldInfo);

    loadSettings();
});
