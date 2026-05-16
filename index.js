import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-toolbox";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
    enabled: true,
    tools: {
        actionInsert: true,
        characterTemplate: true,
        quickPreset: true,
        quickCommand: true,
        tempWorldInfo: true,
        emojiPicker: true,
        chatStats: true,
        clearInput: true
    }
};

// 快捷预设文本
const quickPresets = [
    { label: "😊 微笑", text: "*微微一笑，露出温和的表情*" },
    { label: "🤔 思考", text: "*若有所思地摸着下巴，似乎在仔细思考*" },
    { label: "😊 开心", text: "*眼中闪烁着喜悦的光芒，脸上绽放出灿烂的笑容*" },
    { label: "😟 担忧", text: "*眉头微微蹙起，眼神中带着几分担忧*" },
    { label: "💪 坚定", text: "*深吸一口气，眼神变得坚定起来*" },
    { label: "👀 注视", text: "*目光紧紧地注视着，不肯移开视线*" },
    { label: "😂 大笑", text: "*忍不住大笑起来，整个身体都在颤抖*" },
    { label: "❤️ 温柔", text: "*眼中流露出温柔的神情，声音也变得柔和起来*" }
];

// 快捷命令
const quickCommands = [
    { label: "/continue", text: "/continue", title: "继续生成" },
    { label: "/impersonate", text: "/impersonate ", title: "角色扮演" },
    { label: "/regenerate", text: "/regenerate", title: "重新生成" },
    { label: "/edit", text: "/edit ", title: "编辑消息" },
    { label: "/system", text: "/system ", title: "系统提示" }
];

// 常用表情
const commonEmojis = ["😊", "😂", "😍", "🥺", "😏", "😎", "🤔", "😢", "😡", "🤗", "😘", "😌", "🙄", "😴", "🤩"];

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
    $("#tool_action_insert").prop("checked", tools.actionInsert !== false).trigger("input");
    $("#tool_character_template").prop("checked", tools.characterTemplate !== false).trigger("input");
    $("#tool_quick_preset").prop("checked", tools.quickPreset !== false).trigger("input");
    $("#tool_quick_command").prop("checked", tools.quickCommand !== false).trigger("input");
    $("#tool_temp_worldinfo").prop("checked", tools.tempWorldInfo !== false).trigger("input");
    $("#tool_emoji_picker").prop("checked", tools.emojiPicker !== false).trigger("input");
    $("#tool_chat_stats").prop("checked", tools.chatStats !== false).trigger("input");
    $("#tool_clear_input").prop("checked", tools.clearInput !== false).trigger("input");
    
    updateToolVisibility();
}

function updateToolVisibility() {
    const tools = extension_settings[extensionName].tools;
    
    $("#toolbox_action_btn").toggle(tools.actionInsert !== false);
    $("#toolbox_preset_btn").toggle(tools.quickPreset !== false);
    $("#toolbox_command_btn").toggle(tools.quickCommand !== false);
    $("#toolbox_emoji_btn").toggle(tools.emojiPicker !== false);
    $("#toolbox_stats_btn").toggle(tools.chatStats !== false);
    $("#toolbox_clear_btn").toggle(tools.clearInput !== false);
    
    const allHidden = !tools.actionInsert && !tools.quickPreset && !tools.quickCommand && 
                     !tools.emojiPicker && !tools.chatStats && !tools.clearInput;
    
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

function insertAtCursor(textToInsert) {
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val() || "";
    const newText = text.substring(0, startPos) + textToInsert + text.substring(endPos);
    textarea.val(newText);
    textarea[0].selectionStart = textarea[0].selectionEnd = startPos + textToInsert.length;
    textarea.focus();
}

function insertAsteriskAction() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val() || "";
    
    if (startPos === endPos) {
        insertAtCursor("**");
        setTimeout(() => {
            textarea[0].selectionStart = textarea[0].selectionEnd = startPos + 1;
        }, 10);
    } else {
        const selectedText = text.substring(startPos, endPos);
        const newText = text.substring(0, startPos) + `*${selectedText}*` + text.substring(endPos);
        textarea.val(newText);
        textarea[0].selectionStart = textarea[0].selectionEnd = startPos + selectedText.length + 2;
        textarea.focus();
    }
}

function showQuickPresets() {
    if (!extension_settings[extensionName].enabled) return;
    
    let menu = $("#toolbox_preset_menu");
    if (menu.length === 0) {
        menu = $(`<div id="toolbox_preset_menu" class="toolbox-dropdown"></div>`);
        $("#toolbox_toolbar").append(menu);
        
        quickPresets.forEach(preset => {
            const item = $(`<div class="toolbox-dropdown-item">${preset.label}</div>`);
            item.on("click", () => {
                insertAtCursor(preset.text);
                menu.hide();
            });
            menu.append(item);
        });
        
        $(document).on("click", (e) => {
            if (!$(e.target).closest("#toolbox_preset_btn, #toolbox_preset_menu").length) {
                menu.hide();
            }
        });
    }
    
    menu.css({
        top: $("#toolbox_preset_btn").offset().top - 120,
        left: $("#toolbox_preset_btn").offset().left
    }).toggle();
}

function showQuickCommands() {
    if (!extension_settings[extensionName].enabled) return;
    
    let menu = $("#toolbox_command_menu");
    if (menu.length === 0) {
        menu = $(`<div id="toolbox_command_menu" class="toolbox-dropdown"></div>`);
        $("#toolbox_toolbar").append(menu);
        
        quickCommands.forEach(cmd => {
            const item = $(`<div class="toolbox-dropdown-item">${cmd.label}</div>`);
            item.attr("title", cmd.title);
            item.on("click", () => {
                insertAtCursor(cmd.text);
                menu.hide();
            });
            menu.append(item);
        });
        
        $(document).on("click", (e) => {
            if (!$(e.target).closest("#toolbox_command_btn, #toolbox_command_menu").length) {
                menu.hide();
            }
        });
    }
    
    menu.css({
        top: $("#toolbox_command_btn").offset().top - 100,
        left: $("#toolbox_command_btn").offset().left
    }).toggle();
}

function showEmojiPicker() {
    if (!extension_settings[extensionName].enabled) return;
    
    let menu = $("#toolbox_emoji_menu");
    if (menu.length === 0) {
        menu = $(`<div id="toolbox_emoji_menu" class="toolbox-dropdown"></div>`);
        $("#toolbox_toolbar").append(menu);
        
        commonEmojis.forEach(emoji => {
            const item = $(`<div class="toolbox-emoji-item">${emoji}</div>`);
            item.on("click", () => {
                insertAtCursor(emoji);
                menu.hide();
            });
            menu.append(item);
        });
        
        $(document).on("click", (e) => {
            if (!$(e.target).closest("#toolbox_emoji_btn, #toolbox_emoji_menu").length) {
                menu.hide();
            }
        });
    }
    
    menu.css({
        top: $("#toolbox_emoji_btn").offset().top - 60,
        left: $("#toolbox_emoji_btn").offset().left
    }).toggle();
}

function showChatStats() {
    if (!extension_settings[extensionName].enabled) return;
    
    const context = getContext();
    let stats = "";
    
    if (context && context.chat) {
        const messages = context.chat;
        const userMessages = messages.filter(m => m.is_user === true);
        const charMessages = messages.filter(m => m.is_user === false);
        const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || 0), 0);
        
        stats = `📊 对话统计:\n`;
        stats += `• 总消息: ${messages.length}\n`;
        stats += `• 用户消息: ${userMessages.length}\n`;
        stats += `• AI消息: ${charMessages.length}\n`;
        stats += `• 约${totalTokens} tokens`;
    } else {
        stats = "📊 暂无对话数据";
    }
    
    toastr.info(stats, "工具箱统计", { timeOut: 3000 });
}

function clearInputField() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    textarea.val("");
    textarea.focus();
}

jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    
    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <span>🎯</span>
    <button id="toolbox_action_btn" class="toolbox-btn" title="插入星号动作描述">
        <span class="btn-icon">✏️</span>
        <span class="btn-text">动作</span>
    </button>
    <button id="toolbox_preset_btn" class="toolbox-btn" title="快捷预设文本">
        <span class="btn-icon">📝</span>
        <span class="btn-text">预设</span>
    </button>
    <button id="toolbox_command_btn" class="toolbox-btn" title="快捷命令">
        <span class="btn-icon">⚡</span>
        <span class="btn-text">命令</span>
    </button>
    <button id="toolbox_emoji_btn" class="toolbox-btn" title="表情快捷插入">
        <span class="btn-icon">😊</span>
        <span class="btn-text">表情</span>
    </button>
    <button id="toolbox_stats_btn" class="toolbox-btn" title="聊天统计">
        <span class="btn-icon">📊</span>
        <span class="btn-text">统计</span>
    </button>
    <button id="toolbox_clear_btn" class="toolbox-btn" title="清空输入框">
        <span class="btn-icon">🗑️</span>
        <span class="btn-text">清空</span>
    </button>
</div>`;
    
    const sendForm = $("#send_form");
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }
    
    $("#enable_toolbox").on("input", onEnableInput);
    $("#tool_action_insert").on("input", onToolVisibilityChange("actionInsert"));
    $("#tool_character_template").on("input", onToolVisibilityChange("characterTemplate"));
    $("#tool_quick_preset").on("input", onToolVisibilityChange("quickPreset"));
    $("#tool_quick_command").on("input", onToolVisibilityChange("quickCommand"));
    $("#tool_temp_worldinfo").on("input", onToolVisibilityChange("tempWorldInfo"));
    $("#tool_emoji_picker").on("input", onToolVisibilityChange("emojiPicker"));
    $("#tool_chat_stats").on("input", onToolVisibilityChange("chatStats"));
    $("#tool_clear_input").on("input", onToolVisibilityChange("clearInput"));

    $("#toolbox_action_btn").on("click", insertAsteriskAction);
    $("#toolbox_preset_btn").on("click", showQuickPresets);
    $("#toolbox_command_btn").on("click", showQuickCommands);
    $("#toolbox_emoji_btn").on("click", showEmojiPicker);
    $("#toolbox_stats_btn").on("click", showChatStats);
    $("#toolbox_clear_btn").on("click", clearInputField);

    loadSettings();
});
