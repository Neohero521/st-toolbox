import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-toolbox";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
    enabled: true,
    tools: {
        timestamp: true,
        datetime: true,
        copyLast: true,
        clearInput: true,
        uppercase: false,
        lowercase: false,
        trimWhitespace: true,
        characterAnchor: true,
        customKeywords: ''
    },
    anchorSettings: {
        mode: 'temporary',
        sustainedRounds: 3
    }
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    if (!extension_settings[extensionName].tools) {
        extension_settings[extensionName].tools = defaultSettings.tools;
    }
    
    const settings = extension_settings[extensionName];
    
    $("#enable_toolbox").prop("checked", settings.enabled).trigger("input");
    
    const tools = settings.tools;
    $("#tool_timestamp").prop("checked", tools.timestamp !== false).trigger("input");
    $("#tool_datetime").prop("checked", tools.datetime !== false).trigger("input");
    $("#tool_copy_last").prop("checked", tools.copyLast !== false).trigger("input");
    $("#tool_clear_input").prop("checked", tools.clearInput !== false).trigger("input");
    $("#tool_character_anchor").prop("checked", tools.characterAnchor !== false).trigger("input");
    $("#tool_custom_keywords").val(tools.customKeywords || '').trigger("input");
    $("#tool_uppercase").prop("checked", tools.uppercase === true).trigger("input");
    $("#tool_lowercase").prop("checked", tools.lowercase === true).trigger("input");
    $("#tool_trim").prop("checked", tools.trimWhitespace !== false).trigger("input");
    
    updateToolVisibility();
}

function updateToolVisibility() {
    const tools = extension_settings[extensionName].tools;
    
    $("#toolbox_timestamp_btn").toggle(tools.timestamp !== false);
    $("#toolbox_datetime_btn").toggle(tools.datetime !== false);
    $("#toolbox_copy_btn").toggle(tools.copyLast !== false);
    $("#toolbox_clear_btn").toggle(tools.clearInput !== false);
    $("#toolbox_anchor_btn").toggle(tools.characterAnchor !== false);
    $("#toolbox_upper_btn").toggle(tools.uppercase === true);
    $("#toolbox_lower_btn").toggle(tools.lowercase === true);
    $("#toolbox_trim_btn").toggle(tools.trimWhitespace !== false);
    
    const allHidden = !tools.timestamp && !tools.datetime && !tools.copyLast && 
                     !tools.clearInput && !tools.characterAnchor && 
                     !tools.uppercase && !tools.lowercase && 
                     !tools.trimWhitespace;
    
    if (allHidden || !extension_settings[extensionName].enabled) {
        $("#toolbox_toolbar").hide();
    } else {
        $("#toolbox_toolbar").show();
    }
}

function onEnableInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    updateToolVisibility();
}

function onToolVisibilityChange(toolKey) {
    return function(event) {
        const checked = Boolean($(event.target).prop("checked"));
        extension_settings[extensionName].tools[toolKey] = checked;
        saveSettingsDebounced();
        updateToolVisibility();
    };
}

function getMessageInput() {
    return $("#send_textarea, #prompt_textarea").first();
}

function insertTimestamp() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val() || "";
    const now = new Date();
    const timestamp = `[${now.toLocaleTimeString()}]`;
    const newText = text.substring(0, startPos) + timestamp + text.substring(endPos);
    textarea.val(newText);
    textarea.focus();
}

function insertDatetime() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val() || "";
    const now = new Date();
    const datetime = now.toLocaleString();
    const newText = text.substring(0, startPos) + datetime + text.substring(endPos);
    textarea.val(newText);
    textarea.focus();
}

function copyLastMessage() {
    if (!extension_settings[extensionName].enabled) return;
    const context = getContext();
    if (!context || !context.chat) {
        toastr.warning("没有找到聊天记录");
        return;
    }

    const messages = context.chat.filter(m => m.is_user === false && m.mes);
    if (messages.length === 0) {
        toastr.warning("没有找到上一条消息");
        return;
    }

    const lastMessage = messages[messages.length - 1].mes;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const cursorPos = textarea.prop("selectionStart");
    const text = textarea.val() || "";
    const newText = text.substring(0, cursorPos) + lastMessage + text.substring(cursorPos);
    textarea.val(newText);
    textarea.focus();
}

function clearInputField() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    textarea.val("");
    textarea.focus();
}

function convertToUppercase() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val() || "";

    if (startPos === endPos) {
        textarea.val(text.toUpperCase());
    } else {
        const selectedText = text.substring(startPos, endPos);
        const newText = text.substring(0, startPos) + selectedText.toUpperCase() + text.substring(endPos);
        textarea.val(newText);
    }
    textarea.focus();
}

function convertToLowercase() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val() || "";

    if (startPos === endPos) {
        textarea.val(text.toLowerCase());
    } else {
        const selectedText = text.substring(startPos, endPos);
        const newText = text.substring(0, startPos) + selectedText.toLowerCase() + text.substring(endPos);
        textarea.val(newText);
    }
    textarea.focus();
}

function trimWhitespace() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const text = textarea.val() || "";
    textarea.val(text.trim());
    textarea.focus();
}

class CharacterAnchorInjector {
    constructor() {
        this.modes = {
            TEMPORARY: 'temporary',
            SUSTAINED: 'sustained',
            EMERGENCY: 'emergency'
        };
        this.sustainedInjectionCount = 0;
    }

    extractCharacterInfo() {
        const context = getContext();
        const character = context.character;
        
        if (!character) {
            return {
                name: '未知角色',
                personality: '未设定',
                scenario: '未设定',
                description: '未设定',
                firstMessage: '未设定'
            };
        }

        return {
            name: character.name || '未知角色',
            personality: character.data?.personality || character.personality || '未设定',
            scenario: character.data?.scenario || character.scenario || '未设定',
            description: character.data?.description || character.description || '未设定',
            firstMessage: character.data?.first_message || character.firstMessage || '未设定'
        };
    }

    generateAnchorText(mode = 'temporary') {
        const charInfo = this.extractCharacterInfo();
        const customKeywords = extension_settings[extensionName].tools.customKeywords || '';
        
        let anchorText = '';
        
        switch (mode) {
            case this.modes.TEMPORARY:
                anchorText = `【重要设定 - 仅本次生效】\n`;
                anchorText += `角色名称：${charInfo.name}\n`;
                anchorText += `性格特点：${charInfo.personality}\n`;
                anchorText += `场景背景：${charInfo.scenario}\n`;
                anchorText += `角色描述：${charInfo.description}\n`;
                if (customKeywords) {
                    anchorText += `自定义原则：${customKeywords}\n`;
                }
                anchorText += `【请严格遵守上述角色设定】`;
                break;
                
            case this.modes.SUSTAINED:
                anchorText = `【角色设定锚点 - 持续生效】\n`;
                anchorText += `角色名称：${charInfo.name}\n`;
                anchorText += `性格特点：${charInfo.personality}\n`;
                anchorText += `场景背景：${charInfo.scenario}\n`;
                anchorText += `角色描述：${charInfo.description}\n`;
                if (customKeywords) {
                    anchorText += `自定义原则：${customKeywords}\n`;
                }
                anchorText += `【请在整个对话中严格遵守上述设定】`;
                break;
                
            case this.modes.EMERGENCY:
                anchorText = `【紧急修正 - 角色一致性恢复】\n`;
                anchorText += `重要提醒：你是${charInfo.name}，不是其他任何角色。\n`;
                anchorText += `你的性格是：${charInfo.personality}\n`;
                anchorText += `当前场景：${charInfo.scenario}\n`;
                anchorText += `你的设定：${charInfo.description}\n`;
                if (customKeywords) {
                    anchorText += `必须遵守：${customKeywords}\n`;
                }
                anchorText += `【请立即恢复角色扮演，如有任何偏离请纠正】`;
                break;
        }
        
        return anchorText;
    }

    inject(mode = 'temporary') {
        const anchorText = this.generateAnchorText(mode);
        const textarea = getMessageInput();
        
        if (!textarea.length) {
            toastr.warning('未找到输入框');
            return;
        }
        
        const currentText = textarea.val() || '';
        const newText = currentText + (currentText ? '\n\n' : '') + anchorText;
        textarea.val(newText);
        textarea.focus();
        
        switch (mode) {
            case this.modes.TEMPORARY:
                toastr.success('已注入临时锚点（仅本次生效）', '角色锚点');
                break;
            case this.modes.SUSTAINED:
                this.sustainedInjectionCount = extension_settings[extensionName].anchorSettings.sustainedRounds;
                toastr.success(`已启用持续锚点（将持续${this.sustainedInjectionCount}轮）`, '角色锚点');
                break;
            case this.modes.EMERGENCY:
                toastr.warning('已注入紧急修正锚点', '角色锚点');
                break;
        }
    }

    checkAndReinject() {
        if (this.sustainedInjectionCount > 0) {
            this.sustainedInjectionCount--;
            this.inject(this.modes.TEMPORARY);
        }
    }

    showCharacterInfo() {
        const charInfo = this.extractCharacterInfo();
        const infoHtml = `
<div class="anchor-info-panel" style="
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.95);
    border: 2px solid rgba(99, 102, 241, 0.5);
    border-radius: 16px;
    padding: 24px;
    max-width: 500px;
    width: 90%;
    max-height: 70vh;
    overflow-y: auto;
    z-index: 10000;
    backdrop-filter: blur(20px);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
">
    <h3 style="color: #fff; margin: 0 0 20px 0; font-size: 20px;">📌 ${charInfo.name} - 角色信息</h3>
    <div style="color: rgba(255, 255, 255, 0.9); line-height: 1.6;">
        <div style="margin-bottom: 16px;">
            <strong style="color: #6366f1;">性格特点：</strong>
            <p style="margin: 8px 0 0 0;">${charInfo.personality}</p>
        </div>
        <div style="margin-bottom: 16px;">
            <strong style="color: #6366f1;">场景背景：</strong>
            <p style="margin: 8px 0 0 0;">${charInfo.scenario}</p>
        </div>
        <div style="margin-bottom: 16px;">
            <strong style="color: #6366f1;">角色描述：</strong>
            <p style="margin: 8px 0 0 0;">${charInfo.description.substring(0, 200)}${charInfo.description.length > 200 ? '...' : ''}</p>
        </div>
    </div>
    <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button onclick="anchorInjector.inject('temporary')" style="
            flex: 1; padding: 10px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 8px; color: white; cursor: pointer;
        ">临时注入</button>
        <button onclick="anchorInjector.inject('sustained')" style="
            flex: 1; padding: 10px; background: linear-gradient(135deg, rgba(236, 72, 153, 0.6), rgba(99, 102, 241, 0.6));
            border: 1px solid rgba(236, 72, 153, 0.5); border-radius: 8px; color: white; cursor: pointer;
        ">持续注入</button>
        <button onclick="anchorInjector.inject('emergency')" style="
            flex: 1; padding: 10px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(236, 72, 153, 0.6));
            border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; color: white; cursor: pointer;
        ">紧急修正</button>
    </div>
    <button onclick="this.closest('.anchor-info-panel').remove()" style="
        position: absolute; top: 12px; right: 12px; background: none; border: none; color: rgba(255, 255, 255, 0.6);
        font-size: 24px; cursor: pointer; line-height: 1;
    ">×</button>
</div>
<div class="anchor-overlay" onclick="document.querySelector('.anchor-info-panel')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 9999;
"></div>`;
        
        document.body.insertAdjacentHTML('beforeend', infoHtml);
    }
}

const anchorInjector = new CharacterAnchorInjector();

jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    
    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <span>⚡</span>
    <button id="toolbox_timestamp_btn" class="toolbox-btn" title="插入时间戳 [HH:MM:SS]">
        <span class="btn-icon">🕐</span>
        <span class="btn-text">时间</span>
    </button>
    <button id="toolbox_datetime_btn" class="toolbox-btn" title="插入完整日期时间">
        <span class="btn-icon">📅</span>
        <span class="btn-text">日期</span>
    </button>
    <button id="toolbox_copy_btn" class="toolbox-btn" title="复制上一条AI消息">
        <span class="btn-icon">📋</span>
        <span class="btn-text">复制</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_clear_btn" class="toolbox-btn" title="清空输入框">
        <span class="btn-icon">🗑</span>
        <span class="btn-text">清空</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_anchor_btn" class="toolbox-btn" title="角色设定锚点注入器">
        <span class="btn-icon">⚓</span>
        <span class="btn-text">锚点</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_upper_btn" class="toolbox-btn" title="将选中文本转为大写">
        <span class="btn-icon">🔠</span>
        <span class="btn-text">大写</span>
    </button>
    <button id="toolbox_lower_btn" class="toolbox-btn" title="将选中文本转为小写">
        <span class="btn-icon">🔡</span>
        <span class="btn-text">小写</span>
    </button>
    <button id="toolbox_trim_btn" class="toolbox-btn" title="去除文本首尾空格">
        <span class="btn-icon">✂</span>
        <span class="btn-text">去空格</span>
    </button>
</div>`;
    
    const sendForm = $("#send_form");
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }
    
    $("#enable_toolbox").on("input", onEnableInput);
    $("#tool_timestamp").on("input", onToolVisibilityChange("timestamp"));
    $("#tool_datetime").on("input", onToolVisibilityChange("datetime"));
    $("#tool_copy_last").on("input", onToolVisibilityChange("copyLast"));
    $("#tool_clear_input").on("input", onToolVisibilityChange("clearInput"));
    $("#tool_character_anchor").on("input", onToolVisibilityChange("characterAnchor"));
    $("#tool_uppercase").on("input", onToolVisibilityChange("uppercase"));
    $("#tool_lowercase").on("input", onToolVisibilityChange("lowercase"));
    $("#tool_trim").on("input", onToolVisibilityChange("trimWhitespace"));
    
    $("#tool_custom_keywords").on("input", function() {
        extension_settings[extensionName].tools.customKeywords = $(this).val();
        saveSettingsDebounced();
    });

    $("#toolbox_timestamp_btn").on("click", insertTimestamp);
    $("#toolbox_datetime_btn").on("click", insertDatetime);
    $("#toolbox_copy_btn").on("click", copyLastMessage);
    $("#toolbox_clear_btn").on("click", clearInputField);
    $("#toolbox_anchor_btn").on("click", () => anchorInjector.showCharacterInfo());
    $("#toolbox_upper_btn").on("click", convertToUppercase);
    $("#toolbox_lower_btn").on("click", convertToLowercase);
    $("#toolbox_trim_btn").on("click", trimWhitespace);

    loadSettings();
});
