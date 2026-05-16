import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-toolbox";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    tools: {
        timestamp: true,
        datetime: true,
        copyLast: true,
        clearInput: true,
        uppercase: false,
        lowercase: false,
        trimWhitespace: true
    }
};

const toolFunctions = {
    timestamp: insertTimestamp,
    datetime: insertDatetime,
    copyLast: copyLastMessage,
    clearInput: clearInputField,
    uppercase: convertToUppercase,
    lowercase: convertToLowercase,
    trimWhitespace: trimWhitespace
};

function log(message, data) {
    console.log(`[ST-Toolbox] ${message}`, data || '');
}

async function loadSettings() {
    try {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        if (Object.keys(extension_settings[extensionName]).length === 0) {
            Object.assign(extension_settings[extensionName], defaultSettings);
        }

        if (!extension_settings[extensionName].tools) {
            extension_settings[extensionName].tools = defaultSettings.tools;
        }

        const settings = extension_settings[extensionName];

        $("#enable_toolbox").prop("checked", settings.enabled);

        const tools = settings.tools;
        $("#tool_timestamp").prop("checked", tools.timestamp !== false);
        $("#tool_datetime").prop("checked", tools.datetime !== false);
        $("#tool_copy_last").prop("checked", tools.copyLast !== false);
        $("#tool_clear_input").prop("checked", tools.clearInput !== false);
        $("#tool_uppercase").prop("checked", tools.uppercase === true);
        $("#tool_lowercase").prop("checked", tools.lowercase === true);
        $("#tool_trim").prop("checked", tools.trimWhitespace !== false);

        updateToolVisibility();
        log("设置加载完成");
    } catch (error) {
        log("加载设置时出错", error);
    }
}

function updateToolVisibility() {
    try {
        const tools = extension_settings[extensionName].tools;

        $("#toolbox_timestamp_btn").toggle(tools.timestamp !== false);
        $("#toolbox_datetime_btn").toggle(tools.datetime !== false);
        $("#toolbox_copy_btn").toggle(tools.copyLast !== false);
        $("#toolbox_clear_btn").toggle(tools.clearInput !== false);
        $("#toolbox_upper_btn").toggle(tools.uppercase === true);
        $("#toolbox_lower_btn").toggle(tools.lowercase === true);
        $("#toolbox_trim_btn").toggle(tools.trimWhitespace !== false);

        const allHidden = !tools.timestamp && !tools.datetime && !tools.copyLast && 
                         !tools.clearInput && !tools.uppercase && !tools.lowercase && 
                         !tools.trimWhitespace;
        
        if (allHidden) {
            $("#toolbox_toolbar").hide();
        } else if (extension_settings[extensionName].enabled) {
            $("#toolbox_toolbar").show();
        }
    } catch (error) {
        log("更新工具栏可见性时出错", error);
    }
}

function onEnableChange() {
    const value = $("#enable_toolbox").prop("checked");
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();

    if (value) {
        updateToolVisibility();
    } else {
        $("#toolbox_toolbar").hide();
    }
    log("工具箱启用状态变更", value);
}

function onToolVisibilityChange(toolKey) {
    return function() {
        const checked = $(this).prop("checked");
        extension_settings[extensionName].tools[toolKey] = checked;
        saveSettingsDebounced();
        updateToolVisibility();
        log(`工具 ${toolKey} 可见性变更`, checked);
    };
}

function getMessageInput() {
    const textarea = $("#send_textarea, #prompt_textarea, textarea[id*='send'], textarea[id*='prompt']").first();
    if (!textarea.length) {
        log("警告：找不到输入框元素");
    }
    return textarea;
}

function insertTimestamp() {
    if (!extension_settings[extensionName].enabled) return;
    try {
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const startPos = textarea.prop("selectionStart");
        const endPos = textarea.prop("selectionEnd");
        const text = textarea.val() || "";
        const now = new Date();
        const timestamp = `[${now.toLocaleTimeString()}]`;
        const newText = text.substring(0, startPos) + timestamp + text.substring(endPos);
        textarea.val(newText);
        setTimeout(() => {
            textarea.prop("selectionStart", startPos + timestamp.length);
            textarea.prop("selectionEnd", startPos + timestamp.length);
            textarea.focus();
        }, 0);
        log("插入时间戳成功");
    } catch (error) {
        log("插入时间戳时出错", error);
    }
}

function insertDatetime() {
    if (!extension_settings[extensionName].enabled) return;
    try {
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const startPos = textarea.prop("selectionStart");
        const endPos = textarea.prop("selectionEnd");
        const text = textarea.val() || "";
        const now = new Date();
        const datetime = now.toLocaleString();
        const newText = text.substring(0, startPos) + datetime + text.substring(endPos);
        textarea.val(newText);
        setTimeout(() => {
            textarea.prop("selectionStart", startPos + datetime.length);
            textarea.prop("selectionEnd", startPos + datetime.length);
            textarea.focus();
        }, 0);
        log("插入日期时间成功");
    } catch (error) {
        log("插入日期时间时出错", error);
    }
}

function copyLastMessage() {
    if (!extension_settings[extensionName].enabled) return;
    try {
        const context = getContext();
        if (!context || !context.chat) {
            log("无法获取聊天上下文");
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
        setTimeout(() => {
            textarea.prop("selectionStart", cursorPos + lastMessage.length);
            textarea.prop("selectionEnd", cursorPos + lastMessage.length);
            textarea.focus();
        }, 0);
        log("复制上一条消息成功");
    } catch (error) {
        log("复制消息时出错", error);
    }
}

function clearInputField() {
    if (!extension_settings[extensionName].enabled) return;
    try {
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        textarea.val("");
        textarea.focus();
        log("清空输入框成功");
    } catch (error) {
        log("清空输入框时出错", error);
    }
}

function convertToUppercase() {
    if (!extension_settings[extensionName].enabled) return;
    try {
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
        log("转为大写成功");
    } catch (error) {
        log("转为大写时出错", error);
    }
}

function convertToLowercase() {
    if (!extension_settings[extensionName].enabled) return;
    try {
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
        log("转为小写成功");
    } catch (error) {
        log("转为小写时出错", error);
    }
}

function trimWhitespace() {
    if (!extension_settings[extensionName].enabled) return;
    try {
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const text = textarea.val() || "";
        textarea.val(text.trim());
        textarea.focus();
        log("去除空格成功");
    } catch (error) {
        log("去除空格时出错", error);
    }
}

jQuery(async () => {
    try {
        log("开始加载插件...");
        
        const toolbarHtml = await $.get(`${extensionFolderPath}/toolbar.html`);
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        
        let insertTarget = $("#send_form");
        if (!insertTarget.length) {
            insertTarget = $("#prompt_form");
        }
        if (!insertTarget.length) {
            insertTarget = $("form[id*='send'], form[id*='prompt']").first();
        }
        if (!insertTarget.length) {
            insertTarget = $(".send-form, .prompt-form, #sendMessage, #mes_form").first();
        }
        
        if (insertTarget.length) {
            insertTarget.before(toolbarHtml);
            log("工具栏已插入到表单前");
        } else {
            $("body").append(toolbarHtml);
            log("警告：无法找到目标表单，工具栏已添加到 body 末尾");
        }
        
        $("#extensions_settings").append(settingsHtml);
        log("设置面板已添加");

        $("#enable_toolbox").on("input", onEnableChange);
        $("#tool_timestamp").on("input", onToolVisibilityChange("timestamp"));
        $("#tool_datetime").on("input", onToolVisibilityChange("datetime"));
        $("#tool_copy_last").on("input", onToolVisibilityChange("copyLast"));
        $("#tool_clear_input").on("input", onToolVisibilityChange("clearInput"));
        $("#tool_uppercase").on("input", onToolVisibilityChange("uppercase"));
        $("#tool_lowercase").on("input", onToolVisibilityChange("lowercase"));
        $("#tool_trim").on("input", onToolVisibilityChange("trimWhitespace"));

        $("#toolbox_timestamp_btn").on("click", insertTimestamp);
        $("#toolbox_datetime_btn").on("click", insertDatetime);
        $("#toolbox_copy_btn").on("click", copyLastMessage);
        $("#toolbox_clear_btn").on("click", clearInputField);
        $("#toolbox_upper_btn").on("click", convertToUppercase);
        $("#toolbox_lower_btn").on("click", convertToLowercase);
        $("#toolbox_trim_btn").on("click", trimWhitespace);

        await loadSettings();
        log("插件加载完成");
        
    } catch (error) {
        log("插件初始化时出错", error);
    }
});
