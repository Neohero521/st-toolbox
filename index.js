import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-toolbox";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    tools: {
        anchor: true,
        ooc: true,
        status: true,
        summary: true,
        mark: true,
        branch: true,
        template: true,
        batch: true,
        optimize: true,
        scene: true,
        character: true,
        export: true
    }
};

let characterState = {
    emotion: "平静",
    relationship: 50,
    taskProgress: 0,
    customStates: {}
};

let markedInfo = [];
let chatBranches = [];
let templates = {};
let batchQueue = [];

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    const settings = extension_settings[extensionName];
    $("#enable_toolbox").prop("checked", settings.enabled).trigger("input");
    
    const tools = settings.tools;
    Object.keys(tools).forEach(tool => {
        $(`#tool_${tool}`).prop("checked", tools[tool] !== false).trigger("input");
    });
    
    updateToolVisibility();
}

function updateToolVisibility() {
    const tools = extension_settings[extensionName].tools;
    Object.keys(tools).forEach(tool => {
        $(`#toolbox_${tool}_btn`).toggle(tools[tool] !== false);
    });
    
    if (!extension_settings[extensionName].enabled) {
        $("#toolbox_toolbar").hide();
    } else {
        $("#toolbox_toolbar").show();
    }
}

function getMessageInput() {
    return $("#send_textarea, #prompt_textarea").first();
}

function getCurrentCharacter() {
    const context = getContext();
    return context.character;
}

function insertTextToInput(text) {
    const textarea = getMessageInput();
    if (!textarea.length) return;
    
    const startPos = textarea.prop("selectionStart");
    const endPos = textarea.prop("selectionEnd");
    const currentText = textarea.val() || "";
    const newText = currentText.substring(0, startPos) + text + currentText.substring(endPos);
    textarea.val(newText);
    textarea.focus();
}

function showToast(message, duration = 2000) {
    if (typeof toastr !== 'undefined') {
        toastr.info(message);
    } else {
        const toast = document.createElement('div');
        toast.className = 'toolbox-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(168, 85, 247, 0.95), rgba(236, 72, 153, 0.95));
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            animation: toast-fade 2s ease-in-out forwards;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }
}

// ===================================
// 功能1: 角色设定锚点注入器
// ===================================
function injectCharacterAnchor() {
    const character = getCurrentCharacter();
    if (!character) {
        showToast("未检测到角色");
        return;
    }
    
    let anchorText = "\n\n【角色锚点】\n";
    anchorText += `身份：${character.name}\n`;
    if (character.description) anchorText += `设定：${character.description}\n`;
    if (character.personality) anchorText += `性格：${character.personality}\n`;
    if (character.scenario) anchorText += `场景：${character.scenario}\n`;
    anchorText += "\n*请严格遵守以上角色设定*\n";
    
    insertTextToInput(anchorText);
    showToast("角色锚点已注入");
}

// ===================================
// 功能2: OOC检测与修正
// ===================================
function detectOOC() {
    const context = getContext();
    if (!context || !context.chat || context.chat.length < 2) {
        showToast("聊天记录不足");
        return;
    }
    
    const lastMessages = context.chat.slice(-3).filter(m => !m.is_user);
    if (lastMessages.length === 0) {
        showToast("未找到AI回复");
        return;
    }
    
    const lastReply = lastMessages[lastMessages.length - 1].mes;
    const character = getCurrentCharacter();
    
    const indicators = [
        { pattern: /^\s*以下是|以下是对|作为AI|我是一个|我可以帮|I am an AI|I'm an AI/i, issue: "明确声明自己是AI" },
        { pattern: /不能|无法|我没有|我没有办法|I cannot|I can't|I don't have/i, issue: "表达AI能力限制" },
        { pattern: /抱歉|对不起|很抱歉|Apology|sorry/i, issue: "过度道歉" }
    ];
    
    let issues = [];
    indicators.forEach(ind => {
        if (ind.pattern.test(lastReply)) {
            issues.push(ind.issue);
        }
    });
    
    if (issues.length > 0) {
        const fixText = `\n\n【角色修正提示】\n请避免：${issues.join('、')}。\n继续保持${character?.name || '角色'}的身份和性格。\n`;
        insertTextToInput(fixText);
        showToast(`检测到OOC风险：${issues.length}项`);
    } else {
        showToast("未检测到OOC问题");
    }
}

// ===================================
// 功能3: 角色状态追踪
// ===================================
function updateCharacterStatus() {
    const context = getContext();
    if (!context || !context.chat) {
        showToast("无法获取聊天上下文");
        return;
    }
    
    const lastMessages = context.chat.slice(-5).filter(m => !m.is_user);
    const emotionKeywords = {
        "开心": ["笑", "高兴", "开心", "愉快", "happy", "joy"],
        "愤怒": ["生气", "愤怒", "恼火", "angry", "mad"],
        "悲伤": ["哭", "难过", "伤心", "sad", "cry"],
        "害羞": ["脸红", "害羞", "不好意思", "shy", "embarrassed"],
        "惊讶": ["惊讶", "震惊", "没想到", "surprised", "shocked"]
    };
    
    let detectedEmotion = "平静";
    let maxCount = 0;
    
    emotionKeywords.forEach((keywords, emotion) => {
        const count = lastMessages.reduce((sum, msg) => {
            return sum + keywords.filter(kw => msg.mes.includes(kw)).length;
        }, 0);
        if (count > maxCount) {
            maxCount = count;
            detectedEmotion = emotion;
        }
    });
    
    characterState.emotion = detectedEmotion;
    
    const statusText = `\n\n【当前状态】\n情绪：${characterState.emotion}\n关系值：${characterState.relationship}\n任务进度：${characterState.taskProgress}%\n`;
    insertTextToInput(statusText);
    showToast(`状态已更新：${detectedEmotion}`);
}

// ===================================
// 功能4: 上下文摘要
// ===================================
function generateContextSummary() {
    const context = getContext();
    if (!context || !context.chat) {
        showToast("无法获取聊天上下文");
        return;
    }
    
    const chat = context.chat;
    const recentMessages = chat.slice(-10);
    
    let summary = "\n\n【上下文摘要】\n";
    summary += `对话轮次：${recentMessages.length}\n`;
    summary += "关键内容：\n";
    
    recentMessages.forEach((msg, i) => {
        const role = msg.is_user ? "用户" : "AI";
        const preview = msg.mes.substring(0, 50);
        summary += `${i + 1}. [${role}] ${preview}...\n`;
    });
    
    insertTextToInput(summary);
    showToast("上下文摘要已生成");
}

// ===================================
// 功能5: 关键信息标记
// ===================================
function markImportantInfo() {
    const textarea = getMessageInput();
    const selectedText = textarea.val().substring(
        textarea.prop("selectionStart"),
        textarea.prop("selectionEnd")
    );
    
    if (!selectedText || selectedText.length < 3) {
        showToast("请先选中文本");
        return;
    }
    
    const mark = {
        text: selectedText,
        timestamp: new Date().toISOString(),
        tag: "重要"
    };
    
    markedInfo.push(mark);
    
    const markedText = `【${mark.tag}】${selectedText}`;
    const currentText = textarea.val();
    textarea.val(currentText.replace(selectedText, markedText));
    
    showToast(`已标记：${selectedText.substring(0, 20)}...`);
}

function insertMarkedInfo() {
    if (markedInfo.length === 0) {
        showToast("暂无标记信息");
        return;
    }
    
    const latestMark = markedInfo[markedInfo.length - 1];
    const text = `\n\n【重要信息回溯】\n${latestMark.text}\n`;
    insertTextToInput(text);
    showToast("已插入最近标记");
}

// ===================================
// 功能6: 分支管理
// ===================================
function manageBranches() {
    const context = getContext();
    if (!context || !context.chat) {
        showToast("无法获取聊天上下文");
        return;
    }
    
    const branchText = "\n\n【对话分支】\n";
    const branchCount = context.chat.filter(m => m.swipe_id !== undefined).length || 1;
    const branchInfo = `当前分支数：${branchCount}\n`;
    
    insertTextToInput(branchText + branchInfo);
    showToast(`检测到 ${branchCount} 个分支`);
}

// ===================================
// 功能7: 提示词模板
// ===================================
const defaultTemplates = {
    "剧情推进": "请继续推进剧情，增加一些紧张感和悬念。",
    "场景描写": "请详细描写当前场景的环境、氛围和细节。",
    "角色互动": "请展示角色之间的互动和情感交流。",
    "动作描写": "请添加角色的动作和表情描写。",
    "对话推进": "请让角色进行一段自然的对话。"
};

function insertTemplate() {
    const templateNames = Object.keys(defaultTemplates);
    const templateText = "\n\n【提示词模板】\n";
    const templatesList = templateNames.map((name, i) => 
        `${i + 1}. ${name}：${defaultTemplates[name]}`
    ).join("\n");
    
    insertTextToInput(templateText + templatesList + "\n请选择要使用的模板类型。");
    showToast("模板列表已插入");
}

// ===================================
// 功能8: 批量发送
// ===================================
function setupBatchSend() {
    const context = getContext();
    if (!context || !context.chat) {
        showToast("无法获取聊天上下文");
        return;
    }
    
    showToast("批量发送模式：请在输入框输入多条消息，使用|分隔");
    
    const textarea = getMessageInput();
    const currentText = textarea.val();
    
    if (currentText.includes('|')) {
        const messages = currentText.split('|').map(m => m.trim()).filter(m => m);
        batchQueue = messages;
        textarea.val("");
        
        let index = 0;
        const sendNext = () => {
            if (index < batchQueue.length) {
                insertTextToInput(batchQueue[index]);
                setTimeout(() => {
                    const sendBtn = $("#send_message, #send_text, .mes_send").first();
                    if (sendBtn.length) {
                        sendBtn.click();
                    }
                    index++;
                    setTimeout(sendNext, 3000);
                }, 1000);
            } else {
                showToast("批量发送完成");
            }
        };
        
        sendNext();
    }
}

// ===================================
// 功能9: 提示词优化
// ===================================
function optimizePrompt() {
    const textarea = getMessageInput();
    const text = textarea.val();
    
    if (!text || text.length < 10) {
        showToast("提示词太短，无需优化");
        return;
    }
    
    let optimized = text;
    
    if (!text.startsWith('【') && !text.startsWith('[')) {
        optimized = `【核心指令】\n${text}`;
    }
    
    if (!text.includes('*') && !text.includes('（')) {
        const withAction = prompt("是否添加动作描写？输入描述或直接发送");
        if (withAction && withAction.trim()) {
            optimized = `*${withAction}*\n${optimized}`;
        }
    }
    
    if (!text.includes('。\n') && text.length > 50) {
        optimized += "\n\n请详细回复，保持角色一致。";
    }
    
    textarea.val(optimized);
    showToast("提示词已优化");
}

// ===================================
// 功能10: 场景生成
// ===================================
function generateScene() {
    const context = getContext();
    if (!context || !context.chat) {
        showToast("无法获取聊天上下文");
        return;
    }
    
    const lastMessages = context.chat.slice(-5);
    const text = lastMessages.map(m => m.mes).join(" ");
    
    const sceneKeywords = {
        "咖啡馆": ["咖啡", "喝", "坐", "店"],
        "森林": ["森林", "树", "鸟", "自然"],
        "城市": ["街道", "建筑", "城市", "人"],
        "室内": ["房间", "房子", "家里", "室内"],
        "海边": ["海", "沙滩", "浪", "海风"]
    };
    
    let detectedScene = "未知场景";
    let maxCount = 0;
    
    sceneKeywords.forEach((keywords, scene) => {
        const count = keywords.filter(kw => text.includes(kw)).length;
        if (count > maxCount) {
            maxCount = count;
            detectedScene = scene;
        }
    });
    
    const sceneText = `\n\n【场景设定】\n当前场景：${detectedScene}\n请描述这个场景的详细环境、氛围和光线。`;
    insertTextToInput(sceneText);
    showToast(`检测到场景：${detectedScene}`);
}

// ===================================
// 功能11: 角色调度
// ===================================
function scheduleCharacter() {
    const context = getContext();
    if (!context || !context.groupId) {
        showToast("当前不是群聊模式");
        return;
    }
    
    const scheduleText = "\n\n【角色调度】\n请按以下顺序让角色发言：\n1. 先让角色A发言\n2. 然后角色B回应\n3. 最后角色C总结";
    insertTextToInput(scheduleText);
    showToast("角色调度提示已插入");
}

// ===================================
// 功能12: 导出功能
// ===================================
function exportChat() {
    const context = getContext();
    if (!context || !context.chat) {
        showToast("无法获取聊天上下文");
        return;
    }
    
    const chat = context.chat;
    let exportText = "【聊天记录导出】\n\n";
    
    chat.forEach(msg => {
        const role = msg.is_user ? "用户" : "AI";
        const name = msg.name || role;
        const time = msg.send_date || "";
        exportText += `[${time}] ${name}：\n${msg.mes}\n\n`;
    });
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_export_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast("聊天记录已导出");
}

// ===================================
// 初始化工具栏
// ===================================
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    
    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <button id="toolbox_anchor_btn" class="toolbox-btn" title="角色设定锚点注入">
        <span class="btn-icon">⚓</span>
        <span class="btn-text">锚点</span>
    </button>
    
    <div class="toolbox-divider"></div>
    
    <button id="toolbox_ooc_btn" class="toolbox-btn" title="OOC检测与修正">
        <span class="btn-icon">🔍</span>
        <span class="btn-text">检测</span>
    </button>
    
    <button id="toolbox_status_btn" class="toolbox-btn" title="角色状态追踪">
        <span class="btn-icon">📊</span>
        <span class="btn-text">状态</span>
    </button>
    
    <div class="toolbox-divider"></div>
    
    <button id="toolbox_summary_btn" class="toolbox-btn" title="上下文摘要">
        <span class="btn-icon">📝</span>
        <span class="btn-text">摘要</span>
    </button>
    
    <button id="toolbox_mark_btn" class="toolbox-btn" title="标记重要信息">
        <span class="btn-icon">🏷️</span>
        <span class="btn-text">标记</span>
    </button>
    
    <button id="toolbox_branch_btn" class="toolbox-btn" title="分支管理">
        <span class="btn-icon">🌳</span>
        <span class="btn-text">分支</span>
    </button>
    
    <div class="toolbox-divider"></div>
    
    <button id="toolbox_template_btn" class="toolbox-btn" title="提示词模板">
        <span class="btn-icon">📋</span>
        <span class="btn-text">模板</span>
    </button>
    
    <button id="toolbox_batch_btn" class="toolbox-btn" title="批量发送">
        <span class="btn-icon">📨</span>
        <span class="btn-text">批量</span>
    </button>
    
    <button id="toolbox_optimize_btn" class="toolbox-btn" title="提示词优化">
        <span class="btn-icon">✨</span>
        <span class="btn-text">优化</span>
    </button>
    
    <div class="toolbox-divider"></div>
    
    <button id="toolbox_scene_btn" class="toolbox-btn" title="场景生成">
        <span class="btn-icon">🎬</span>
        <span class="btn-text">场景</span>
    </button>
    
    <button id="toolbox_character_btn" class="toolbox-btn" title="角色调度">
        <span class="btn-icon">🎭</span>
        <span class="btn-text">调度</span>
    </button>
    
    <div class="toolbox-divider"></div>
    
    <button id="toolbox_export_btn" class="toolbox-btn" title="导出聊天">
        <span class="btn-icon">💾</span>
        <span class="btn-text">导出</span>
    </button>
</div>`;
    
    const sendForm = $("#send_form");
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }
    
    // 绑定事件
    $("#enable_toolbox").on("input", (e) => {
        const checked = Boolean($(e.target).prop("checked"));
        extension_settings[extensionName].enabled = checked;
        saveSettingsDebounced();
        updateToolVisibility();
    });
    
    // 工具开关
    Object.keys(defaultSettings.tools).forEach(tool => {
        $(`#tool_${tool}`).on("input", (e) => {
            const checked = Boolean($(e.target).prop("checked"));
            extension_settings[extensionName].tools[tool] = checked;
            saveSettingsDebounced();
            updateToolVisibility();
        });
    });
    
    // 功能按钮绑定
    $("#toolbox_anchor_btn").on("click", injectCharacterAnchor);
    $("#toolbox_ooc_btn").on("click", detectOOC);
    $("#toolbox_status_btn").on("click", updateCharacterStatus);
    $("#toolbox_summary_btn").on("click", generateContextSummary);
    $("#toolbox_mark_btn").on("click", markImportantInfo);
    $("#toolbox_branch_btn").on("click", manageBranches);
    $("#toolbox_template_btn").on("click", insertTemplate);
    $("#toolbox_batch_btn").on("click", setupBatchSend);
    $("#toolbox_optimize_btn").on("click", optimizePrompt);
    $("#toolbox_scene_btn").on("click", generateScene);
    $("#toolbox_character_btn").on("click", scheduleCharacter);
    $("#toolbox_export_btn").on("click", exportChat);
    
    loadSettings();
});
