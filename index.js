// The main script for the extension
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-toolbox";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    tools: {
        anchorInject: true,
        oocDetect: true,
        charState: true
    },
    anchorKeywords: [],
    injectMode: "temporary"
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    $("#enable_toolbox").prop("checked", extension_settings[extensionName].enabled).trigger("input");
    
    const tools = extension_settings[extensionName].tools || defaultSettings.tools;
    $("#tool_anchor_inject").prop("checked", tools.anchorInject !== false).trigger("input");
    $("#tool_ooc_detect").prop("checked", tools.oocDetect !== false).trigger("input");
    $("#tool_char_state").prop("checked", tools.charState !== false).trigger("input");
    
    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];
    const tools = settings.tools || defaultSettings.tools;
    const allHidden = !tools.anchorInject && !tools.oocDetect && !tools.charState;
    
    if (allHidden || !settings.enabled) {
        $("#toolbox-toolbar").hide();
    } else {
        $("#toolbox-toolbar").show();
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
        if (!extension_settings[extensionName].tools) {
            extension_settings[extensionName].tools = {};
        }
        extension_settings[extensionName].tools[toolKey] = checked;
        saveSettingsDebounced();
        updateToolVisibility();
    };
}

function getMessageInput() {
    return $("#send_textarea, #prompt_textarea").first();
}

function getCurrentCharacter() {
    try {
        const context = getContext();
        if (!context) return null;
        
        if (!context.name) {
            return null;
        }
        
        return {
            name: context.name,
            description: context.description || "",
            personality: context.personality || "",
            scenario: context.scenario || "",
            first_mes: context.first_mes || "",
            avatar: context.avatar || ""
        };
    } catch (e) {
        console.error("[ST-Toolbox] Error getting character:", e);
        return null;
    }
}

function extractCorePoints(character) {
    if (!character) return [];
    
    const points = [];
    const sources = [character.description, character.personality, character.scenario, character.first_mes];
    
    for (const source of sources) {
        if (!source) continue;
        
        const lines = source.split(/[\n\r。；；!?！？]/).filter(line => {
            line = line.trim();
            return line.length > 5 && line.length < 300;
        });
        
        for (let i = 0; i < Math.min(lines.length, 3); i++) {
            const point = lines[i].trim();
            if (point && !points.includes(point)) {
                points.push(point);
            }
        }
    }
    
    return points.slice(0, 15);
}

function injectAnchor() {
    const character = getCurrentCharacter();
    if (!character || !character.name) {
        toastr.warning("请先加载角色");
        return;
    }
    
    const corePoints = extractCorePoints(character);
    const userKeywords = extension_settings[extensionName].anchorKeywords || [];
    
    let weightText = "\n\n【角色设定提醒】\n";
    weightText += `<important>角色: ${character.name}</important>\n\n`;
    
    if (corePoints.length > 0) {
        weightText += "核心设定：\n";
        corePoints.forEach((point, idx) => {
            weightText += `${idx + 1}. ${point}\n`;
        });
        weightText += "\n";
    }
    
    if (userKeywords.length > 0) {
        weightText += "用户要求：\n";
        userKeywords.forEach(keyword => {
            weightText += `- ${keyword}\n`;
        });
        weightText += "\n";
    }
    
    weightText += "请严格保持角色一致性。\n";
    
    const input = getMessageInput();
    if (input.length) {
        const currentText = input.val() || "";
        input.val(currentText + weightText);
        input.focus();
        toastr.success("已注入角色设定锚点");
    }
}

function checkOOC() {
    const character = getCurrentCharacter();
    if (!character || !character.name) {
        toastr.warning("请先加载角色");
        return;
    }
    
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        toastr.info("暂无聊天记录");
        return;
    }
    
    const lastAIMsg = context.chat.filter(m => !m.is_user).slice(-1)[0];
    if (!lastAIMsg || !lastAIMsg.mes) {
        toastr.info("暂无 AI 消息");
        return;
    }
    
    toastr.info(`正在检查: ${character.name} 的回复`);
    
    $("#toolbox-expanded").show();
    renderOOCPanel(character, lastAIMsg.mes);
}

function renderOOCPanel(character, message) {
    const conflicts = [];
    const allText = (character.personality + " " + character.description + " " + character.scenario).toLowerCase();
    
    const checks = [
        { keywords: ["哑巴", "不会说话", "沉默不语", "不说话"], forbidden: ["说", "回答", "开口", "讲"], type: "speech", message: "角色设定为哑巴/沉默，但回复中出现了对话" },
        { keywords: ["害羞", "内向", "腼腆", "羞涩"], forbidden: ["大笑", "热情", "主动", "拥抱", "亲吻"], type: "behavior", message: "角色设定为害羞/内向，但表现过于外向" },
        { keywords: ["冷酷", "冷漠", "高冷", "冷淡"], forbidden: ["温柔", "关心", "体贴", "温暖", "热情"], type: "emotion", message: "角色设定为冷酷/高冷，但表现出温暖情感" },
        { keywords: ["小孩子", "年幼", "儿童", "小孩"], forbidden: ["成熟", "老练", "像大人", "稳重"], type: "age", message: "角色设定为年幼，但表现过于成熟" }
    ];
    
    for (const check of checks) {
        const hasTrait = check.keywords.some(kw => allText.includes(kw));
        if (!hasTrait) continue;
        
        const hasConflict = check.forbidden.some(word => message.includes(word));
        if (hasConflict) {
            conflicts.push(check);
        }
    }
    
    const html = `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">OOC 检查结果</span>
                <span class="toolbox-content-close" onclick="closePanel()">×</span>
            </div>
            <div class="toolbox-char-info">
                <span class="toolbox-char-name">角色: ${character.name}</span>
            </div>
            ${conflicts.length > 0 ? `
                <div class="toolbox-conflict-results">
                    <div class="toolbox-conflict-title">发现 ${conflicts.length} 个潜在问题</div>
                    <div class="toolbox-conflict-list">
                        ${conflicts.map(c => `
                            <div class="toolbox-conflict-item">
                                <div class="toolbox-conflict-message">${c.message}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : `
                <div class="toolbox-no-conflict">未发现明显问题</div>
            `}
            <div class="toolbox-actions">
                <button class="toolbox-secondary-btn" onclick="closePanel()">关闭</button>
            </div>
        </div>
    `;
    
    $("#toolbox-expanded").html(html);
}

function checkState() {
    const character = getCurrentCharacter();
    if (!character || !character.name) {
        toastr.warning("请先加载角色");
        return;
    }
    
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        toastr.info("暂无聊天记录");
        return;
    }
    
    $("#toolbox-expanded").show();
    renderStatePanel(character);
}

function renderStatePanel(character) {
    const emotion = detectCurrentEmotion();
    
    const emotionLabels = {
        happy: "开心",
        angry: "愤怒",
        shy: "害羞",
        sad: "悲伤",
        surprised: "惊讶",
        neutral: "中性"
    };
    
    const html = `
        <div class="toolbox-content-section">
            <div class="toolbox-content-header">
                <span class="toolbox-content-title">角色状态</span>
                <span class="toolbox-content-close" onclick="closePanel()">×</span>
            </div>
            <div class="toolbox-current-state">
                <div class="toolbox-char-name">角色: ${character.name}</div>
                <div class="toolbox-emotion-display">
                    <div class="toolbox-emotion-main">
                        <span class="toolbox-emotion-label">当前情绪:</span>
                        <span class="toolbox-emotion-value">${emotionLabels[emotion] || "中性"}</span>
                    </div>
                </div>
            </div>
            <div class="toolbox-actions">
                <button class="toolbox-secondary-btn" onclick="closePanel()">关闭</button>
            </div>
        </div>
    `;
    
    $("#toolbox-expanded").html(html);
}

function detectCurrentEmotion() {
    const context = getContext();
    if (!context || !context.chat || context.chat.length === 0) {
        return "neutral";
    }
    
    const recentMessages = context.chat.filter(m => !m.is_user).slice(-3);
    if (recentMessages.length === 0) {
        return "neutral";
    }
    
    const allText = recentMessages.map(m => m.mes).join(" ").toLowerCase();
    
    const emotionMap = {
        happy: ["笑", "开心", "高兴", "愉快", "欢乐", "喜悦"],
        angry: ["生气", "愤怒", "恼火", "怒", "气愤", "暴躁"],
        shy: ["害羞", "脸红", "羞涩", "腼腆", "不好意思"],
        sad: ["难过", "悲伤", "哭", "流泪", "伤心", "沮丧"],
        surprised: ["惊讶", "吃惊", "震惊", "意外", "诧异"]
    };
    
    for (const [emotion, keywords] of Object.entries(emotionMap)) {
        for (const keyword of keywords) {
            if (allText.includes(keyword)) {
                return emotion;
            }
        }
    }
    
    return "neutral";
}

function closePanel() {
    $("#toolbox-expanded").hide();
}

function addKeyword(keyword) {
    if (!keyword || keyword.trim() === "") return;
    
    if (!extension_settings[extensionName].anchorKeywords) {
        extension_settings[extensionName].anchorKeywords = [];
    }
    
    if (!extension_settings[extensionName].anchorKeywords.includes(keyword.trim())) {
        extension_settings[extensionName].anchorKeywords.push(keyword.trim());
        saveSettingsDebounced();
        toastr.success("已添加关键词");
    }
}

// Make functions global
window.closePanel = closePanel;
window.addKeyword = addKeyword;

jQuery(async () => {
    console.log("[ST-Toolbox] Loading extension...");
    
    try {
        await loadExtensionSettings();
        console.log("[ST-Toolbox] loadExtensionSettings completed");
    } catch (e) {
        console.error("[ST-Toolbox] Error loading extension settings:", e);
    }
    
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);
        console.log("[ST-Toolbox] Settings panel loaded");
    } catch (e) {
        console.error("[ST-Toolbox] Error loading settings HTML:", e);
    }
    
    const toolbarHtml = `
        <div id="toolbox-toolbar" style="display: none;">
            <div class="toolbox-buttons">
                <button id="toolbox-anchor-btn" class="toolbox-main-btn">锚点</button>
                <button id="toolbox-ooc-btn" class="toolbox-main-btn">检查</button>
                <button id="toolbox-state-btn" class="toolbox-main-btn">状态</button>
            </div>
        </div>
        <div id="toolbox-expanded" style="display: none;"></div>
    `;
    
    const sendForm = $("#send_form");
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
        console.log("[ST-Toolbox] Toolbar added to DOM");
    } else {
        console.error("[ST-Toolbox] Could not find send_form element");
    }
    
    $("#toolbox-anchor-btn").on("click", injectAnchor);
    $("#toolbox-ooc-btn").on("click", checkOOC);
    $("#toolbox-state-btn").on("click", checkState);
    
    $("#enable_toolbox").on("input", onEnableInput);
    $("#tool_anchor_inject").on("input", onToolVisibilityChange("anchorInject"));
    $("#tool_ooc_detect").on("input", onToolVisibilityChange("oocDetect"));
    $("#tool_char_state").on("input", onToolVisibilityChange("charState"));
    
    $("#add_keyword_btn").on("click", () => {
        const keyword = $("#new_keyword").val();
        addKeyword(keyword);
        $("#new_keyword").val("");
    });
    
    await loadSettings();
    
    console.log("[ST-Toolbox] Extension initialized");
    
    // Check if character is already loaded
    const character = getCurrentCharacter();
    if (character) {
        console.log("[ST-Toolbox] Character detected:", character.name);
    }
});

