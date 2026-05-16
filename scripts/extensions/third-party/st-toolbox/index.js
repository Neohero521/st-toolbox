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

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    if (!extension_settings[extensionName].tools) {
        extension_settings[extensionName].tools = defaultSettings.tools;
    }

    $("#enable_toolbox").prop("checked", extension_settings[extensionName].enabled);

    const tools = extension_settings[extensionName].tools;
    $("#tool_timestamp").prop("checked", tools.timestamp !== false);
    $("#tool_datetime").prop("checked", tools.datetime !== false);
    $("#tool_copy_last").prop("checked", tools.copyLast !== false);
    $("#tool_clear_input").prop("checked", tools.clearInput !== false);
    $("#tool_uppercase").prop("checked", tools.uppercase === true);
    $("#tool_lowercase").prop("checked", tools.lowercase === true);
    $("#tool_trim").prop("checked", tools.trimWhitespace !== false);

    updateToolVisibility();
}

function updateToolVisibility() {
    const tools = extension_settings[extensionName].tools;

    $("#toolbox_timestamp_btn").toggle(tools.timestamp !== false);
    $("#toolbox_datetime_btn").toggle(tools.datetime !== false);
    $("#toolbox_copy_btn").toggle(tools.copyLast !== false);
    $("#toolbox_clear_btn").toggle(tools.clearInput !== false);
    $("#toolbox_upper_btn").toggle(tools.uppercase === true);
    $("#toolbox_lower_btn").toggle(tools.lowercase === true);
    $("#toolbox_trim_btn").toggle(tools.trimWhitespace !== false);

    const allHidden = Object.values(tools).every(v => v === false);
    if (allHidden) {
        $("#toolbox_toolbar").hide();
    } else if (extension_settings[extensionName].enabled) {
        $("#toolbox_toolbar").show();
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
}

function onToolVisibilityChange(toolKey) {
    return function() {
        const checked = $(this).prop("checked");
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
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val();
    const now = new Date();
    const timestamp = `[${now.toLocaleTimeString()}]`;
    const newText = text.substring(0, startPos) + timestamp + text.substring(endPos);
    textarea.val(newText);
    setTimeout(() => {
        textarea.prop("selectionStart", startPos + timestamp.length);
        textarea.prop("selectionEnd", startPos + timestamp.length);
        textarea.focus();
    }, 0);
}

function insertDatetime() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val();
    const now = new Date();
    const datetime = now.toLocaleString();
    const newText = text.substring(0, startPos) + datetime + text.substring(endPos);
    textarea.val(newText);
    setTimeout(() => {
        textarea.prop("selectionStart", startPos + datetime.length);
        textarea.prop("selectionEnd", startPos + datetime.length);
        textarea.focus();
    }, 0);
}

function copyLastMessage() {
    if (!extension_settings[extensionName].enabled) return;
    const context = getContext();
    if (!context || !context.chat) return;

    const messages = context.chat.filter(m => m.is_user === false && m.mes);
    if (messages.length === 0) {
        toastr.warning("没有找到上一条消息");
        return;
    }

    const lastMessage = messages[messages.length - 1].mes;
    const textarea = getMessageInput();
    const cursorPos = textarea.prop("selectionStart");
    const text = textarea.val();
    const newText = text.substring(0, cursorPos) + lastMessage + text.substring(cursorPos);
    textarea.val(newText);
    setTimeout(() => {
        textarea.prop("selectionStart", cursorPos + lastMessage.length);
        textarea.prop("selectionEnd", cursorPos + lastMessage.length);
        textarea.focus();
    }, 0);
}

function clearInputField() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    textarea.val("");
    textarea.focus();
}

function convertToUppercase() {
    if (!extension_settings[extensionName].enabled) return;
    const textarea = getMessageInput();
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val();

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
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const text = textarea.val();

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
    const text = textarea.val();
    textarea.val(text.trim());
    textarea.focus();
}

jQuery(async () => {
    const toolbarHtml = await $.get(`${extensionFolderPath}/toolbar.html`);
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

    const sendForm = $("#send_form");
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }

    $("#extensions_settings").append(settingsHtml);

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
});
