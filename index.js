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
    $("#toolbox_state_btn").toggle(tools.characterState !== false);
    $("#toolbox_upper_btn").toggle(tools.uppercase === true);
    $("#toolbox_lower_btn").toggle(tools.lowercase === true);
    $("#toolbox_trim_btn").toggle(tools.trimWhitespace !== false);
    
    const allHidden = !tools.timestamp && !tools.datetime && !tools.copyLast &&
                     !tools.clearInput && !tools.characterAnchor &&
                     !tools.characterState &&
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
    <h3 style="color: #fff; margin: 0 0 20px 0; font-size: 20px;">角色信息 - ${charInfo.name}</h3>
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
    ">X</button>
</div>
<div class="anchor-overlay" onclick="document.querySelector('.anchor-info-panel')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 9999;
"></div>`;
        
        document.body.insertAdjacentHTML('beforeend', infoHtml);
    }
}

const anchorInjector = new CharacterAnchorInjector();

class CharacterStateTracker {
    constructor() {
        this.emotionKeywords = {
            happy: ['开心', '高兴', '喜欢', '兴奋', '满意', '快乐', '幸福', '愉悦', '满足', '兴奋'],
            sad: ['悲伤', '难过', '伤心', '沮丧', '失落', '痛苦', '忧郁', '沮丧', '绝望', '哀伤'],
            angry: ['愤怒', '生气', '恼火', '气愤', '大怒', '恼怒', '烦躁', '不爽', '暴怒'],
            fear: ['害怕', '恐惧', '紧张', '不安', '担忧', '忧虑', '惊慌', '畏缩', '惊恐'],
            surprise: ['惊讶', '震惊', '意外', '吃惊', '诧异', '愕然', '惊叹', '震惊'],
            disgust: ['讨厌', '厌恶', '反感', '嫌弃', '憎恶', '不屑', '鄙视', '厌倦'],
            love: ['爱', '喜欢', '心动', '倾心', '爱慕', '迷恋', '依恋', '深情', '温暖'],
            neutral: ['平静', '冷静', '思考', '观察', '等待', '沉默', '淡定', '平常']
        };

        this.stateData = {
            emotion: { current: 'neutral', history: [], intensity: 50 },
            relationship: { value: 60, history: [] },
            trust: { value: 50, history: [] },
            energy: { value: 100, history: [] }
        };

        this.autoTrack = false;
    }

    loadState() {
        const saved = localStorage.getItem(`st-toolbox-state-${getContext().chatId}`);
        if (saved) {
            try {
                this.stateData = JSON.parse(saved);
            } catch (e) {
                console.error('加载状态失败:', e);
            }
        }
    }

    saveState() {
        localStorage.setItem(`st-toolbox-state-${getContext().chatId}`, JSON.stringify(this.stateData));
    }

    detectEmotion(message) {
        const scores = {};
        
        for (const [emotion, keywords] of Object.entries(this.emotionKeywords)) {
            let score = 0;
            keywords.forEach(keyword => {
                if (message.includes(keyword)) score++;
            });
            scores[emotion] = score;
        }

        let maxEmotion = 'neutral';
        let maxScore = 0;
        
        for (const [emotion, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                maxEmotion = emotion;
            }
        }

        return {
            emotion: maxEmotion,
            confidence: maxScore,
            scores: scores
        };
    }

    updateFromMessage(message, isCharacterMessage = false) {
        if (!isCharacterMessage) return;

        const { emotion, confidence } = this.detectEmotion(message);
        
        if (confidence > 0) {
            this.stateData.emotion.history.push({
                timestamp: Date.now(),
                emotion: emotion,
                intensity: Math.min(confidence * 10, 100)
            });

            if (this.stateData.emotion.history.length > 20) {
                this.stateData.emotion.history.shift();
            }

            this.stateData.emotion.current = emotion;
        }

        this.saveState();
    }

    adjustRelationship(delta) {
        this.stateData.relationship.value = Math.max(0, Math.min(100, this.stateData.relationship.value + delta));
        this.stateData.relationship.history.push({
            timestamp: Date.now(),
            value: this.stateData.relationship.value,
            delta: delta
        });
        this.saveState();
    }

    adjustTrust(delta) {
        this.stateData.trust.value = Math.max(0, Math.min(100, this.stateData.trust.value + delta));
        this.stateData.trust.history.push({
            timestamp: Date.now(),
            value: this.stateData.trust.value,
            delta: delta
        });
        this.saveState();
    }

    adjustEnergy(delta) {
        this.stateData.energy.value = Math.max(0, Math.min(100, this.stateData.energy.value + delta));
        this.stateData.energy.history.push({
            timestamp: Date.now(),
            value: this.stateData.energy.value,
            delta: delta
        });
        this.saveState();
    }

    getEmotionEmoji(emotion) {
        const emojis = {
            happy: '😊',
            sad: '😢',
            angry: '😠',
            fear: '😨',
            surprise: '😲',
            disgust: '😒',
            love: '😍',
            neutral: '😐'
        };
        return emojis[emotion] || '😐';
    }

    getEmotionText(emotion) {
        const texts = {
            happy: '开心',
            sad: '悲伤',
            angry: '愤怒',
            fear: '恐惧',
            surprise: '惊讶',
            disgust: '厌恶',
            love: '喜爱',
            neutral: '平静'
        };
        return texts[emotion] || '平静';
    }

    generateStatePrompt() {
        const emotion = this.getEmotionText(this.stateData.emotion.current);
        const relationship = this.stateData.relationship.value;
        const trust = this.stateData.trust.value;
        const energy = this.stateData.energy.value;

        return `【当前角色状态】
情绪状态：${emotion} ${this.getEmotionEmoji(this.stateData.emotion.current)}
关系好感度：${relationship}/100 ${relationship >= 70 ? '💕' : relationship >= 40 ? '💔' : '❌'}
信任程度：${trust}/100 ${trust >= 70 ? '✅' : trust >= 40 ? '⚠️' : '❌'}
活力值：${energy}/100 ${energy >= 50 ? '⚡' : '💤'}

【状态说明】
- 情绪变化历史：${this.stateData.emotion.history.slice(-5).map(h => `${this.getEmotionEmoji(h.emotion)}`).join(' → ') || '无'}
- 近期关系变化：${this.getRelationshipTrend()}
- 信任变化趋势：${this.getTrustTrend()}

请根据上述状态信息，保持角色行为的一致性。`;
    }

    getRelationshipTrend() {
        if (this.stateData.relationship.history.length < 2) return '数据不足';
        const recent = this.stateData.relationship.history.slice(-3);
        const trend = recent[recent.length - 1].value - recent[0].value;
        if (trend > 5) return '📈 上升';
        if (trend < -5) return '📉 下降';
        return '➡️ 稳定';
    }

    getTrustTrend() {
        if (this.stateData.trust.history.length < 2) return '数据不足';
        const recent = this.stateData.trust.history.slice(-3);
        const trend = recent[recent.length - 1].value - recent[0].value;
        if (trend > 5) return '📈 上升';
        if (trend < -5) return '📉 下降';
        return '➡️ 稳定';
    }

    injectToInput() {
        const prompt = this.generateStatePrompt();
        const textarea = getMessageInput();
        if (!textarea.length) return;

        const current = textarea.val() || '';
        textarea.val(current + (current ? '\n\n' : '') + prompt);
        textarea.focus();
        toastr.success('已注入角色状态', '状态追踪');
    }

    renderMiniPanel() {
        const emotion = this.stateData.emotion.current;
        const relationship = this.stateData.relationship.value;
        const trust = this.stateData.trust.value;
        const energy = this.stateData.energy.value;

        return `
<div class="state-tracker-mini" style="
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: rgba(20, 20, 30, 0.95);
    border: 2px solid rgba(99, 102, 241, 0.5);
    border-radius: 12px;
    padding: 16px;
    min-width: 200px;
    z-index: 9998;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
">
    <div style="color: #fff; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 24px;">${this.getEmotionEmoji(emotion)}</span>
        <div>
            <div style="font-weight: 600;">${this.getEmotionText(emotion)}</div>
            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6);">情绪状态</div>
        </div>
    </div>
    
    <div style="margin-bottom: 8px;">
        <div style="color: rgba(255, 255, 255, 0.7); font-size: 11px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>💕 关系</span>
            <span>${relationship}/100</span>
        </div>
        <div style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
            <div style="width: ${relationship}%; height: 100%; background: linear-gradient(90deg, #ec4899, #f472b6); transition: width 0.3s;"></div>
        </div>
    </div>
    
    <div style="margin-bottom: 8px;">
        <div style="color: rgba(255, 255, 255, 0.7); font-size: 11px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>🤝 信任</span>
            <span>${trust}/100</span>
        </div>
        <div style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
            <div style="width: ${trust}%; height: 100%; background: linear-gradient(90deg, #6366f1, #818cf8); transition: width 0.3s;"></div>
        </div>
    </div>
    
    <div style="margin-bottom: 12px;">
        <div style="color: rgba(255, 255, 255, 0.7); font-size: 11px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>⚡ 活力</span>
            <span>${energy}/100</span>
        </div>
        <div style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
            <div style="width: ${energy}%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399); transition: width 0.3s;"></div>
        </div>
    </div>
    
    <div style="display: flex; gap: 6px;">
        <button onclick="stateTracker.injectToInput()" style="
            flex: 1; padding: 8px; font-size: 12px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 6px; color: white; cursor: pointer;
        ">📌 注入状态</button>
        <button onclick="stateTracker.showFullPanel()" style="
            flex: 1; padding: 8px; font-size: 12px;
            background: linear-gradient(135deg, rgba(236, 72, 153, 0.6), rgba(99, 102, 241, 0.6));
            border: 1px solid rgba(236, 72, 153, 0.5); border-radius: 6px; color: white; cursor: pointer;
        ">⚙️ 调整</button>
    </div>
    
    <button onclick="this.closest('.state-tracker-mini').remove()" style="
        position: absolute; top: 8px; right: 8px; background: none; border: none; color: rgba(255, 255, 255, 0.5);
        font-size: 18px; cursor: pointer; line-height: 1;
    ">×</button>
</div>`;
    }

    showMiniPanel() {
        document.querySelectorAll('.state-tracker-mini').forEach(el => el.remove());
        document.body.insertAdjacentHTML('beforeend', this.renderMiniPanel());
    }

    showFullPanel() {
        const emotion = this.stateData.emotion.current;
        const relationship = this.stateData.relationship.value;
        const trust = this.stateData.trust.value;
        const energy = this.stateData.energy.value;

        const panelHtml = `
<div class="state-tracker-full" style="
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.98); border: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 16px; padding: 24px; min-width: 400px; z-index: 10001;
    backdrop-filter: blur(20px); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
">
    <h3 style="color: #fff; margin: 0 0 20px 0; font-size: 18px;">🎭 角色状态追踪器</h3>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
            <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">💕 关系好感度</label>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                <input type="range" id="relationship-slider" min="0" max="100" value="${relationship}" 
                    style="flex: 1;" oninput="stateTracker.updateRelationship(this.value)">
                <span id="relationship-value" style="color: #fff; min-width: 40px;">${relationship}</span>
            </div>
            <div style="display: flex; gap: 6px; margin-top: 8px;">
                <button onclick="stateTracker.adjustRelationship(-10)" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.3); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">-10</button>
                <button onclick="stateTracker.adjustRelationship(-5)" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">-5</button>
                <button onclick="stateTracker.adjustRelationship(5)" style="padding: 6px 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">+5</button>
                <button onclick="stateTracker.adjustRelationship(10)" style="padding: 6px 12px; background: rgba(16, 185, 129, 0.3); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">+10</button>
            </div>
        </div>
        
        <div>
            <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">🤝 信任程度</label>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                <input type="range" id="trust-slider" min="0" max="100" value="${trust}"
                    style="flex: 1;" oninput="stateTracker.updateTrust(this.value)">
                <span id="trust-value" style="color: #fff; min-width: 40px;">${trust}</span>
            </div>
            <div style="display: flex; gap: 6px; margin-top: 8px;">
                <button onclick="stateTracker.adjustTrust(-10)" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.3); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">-10</button>
                <button onclick="stateTracker.adjustTrust(-5)" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">-5</button>
                <button onclick="stateTracker.adjustTrust(5)" style="padding: 6px 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">+5</button>
                <button onclick="stateTracker.adjustTrust(10)" style="padding: 6px 12px; background: rgba(16, 185, 129, 0.3); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">+10</button>
            </div>
        </div>
        
        <div>
            <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">⚡ 活力值</label>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                <input type="range" id="energy-slider" min="0" max="100" value="${energy}"
                    style="flex: 1;" oninput="stateTracker.updateEnergy(this.value)">
                <span id="energy-value" style="color: #fff; min-width: 40px;">${energy}</span>
            </div>
            <div style="display: flex; gap: 6px; margin-top: 8px;">
                <button onclick="stateTracker.adjustEnergy(-20)" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.3); border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">-20</button>
                <button onclick="stateTracker.adjustEnergy(-10)" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">-10</button>
                <button onclick="stateTracker.adjustEnergy(10)" style="padding: 6px 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">+10</button>
                <button onclick="stateTracker.adjustEnergy(20)" style="padding: 6px 12px; background: rgba(16, 185, 129, 0.3); border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">+20</button>
            </div>
        </div>
        
        <div>
            <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">😊 当前情绪</label>
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">
                ${Object.keys(this.emotionKeywords).map(e => `
                    <button onclick="stateTracker.setEmotion('${e}')" style="
                        padding: 6px 10px; font-size: 12px;
                        background: ${emotion === e ? 'rgba(99, 102, 241, 0.6)' : 'rgba(255, 255, 255, 0.1)'};
                        border: 1px solid ${emotion === e ? 'rgba(99, 102, 241, 0.8)' : 'rgba(255, 255, 255, 0.2)'};
                        border-radius: 4px; color: white; cursor: pointer;
                    ">${this.getEmotionEmoji(e)}</button>
                `).join('')}
            </div>
        </div>
    </div>
    
    <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button onclick="stateTracker.injectToInput(); document.querySelector('.state-tracker-full')?.remove();" style="
            flex: 1; padding: 10px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 8px; color: white; cursor: pointer;
        ">📌 注入状态到输入框</button>
        <button onclick="stateTracker.resetState()" style="
            flex: 1; padding: 10px; background: rgba(239, 68, 68, 0.3);
            border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; color: white; cursor: pointer;
        ">🔄 重置状态</button>
    </div>
    
    <button onclick="this.closest('.state-tracker-full').remove()" style="
        position: absolute; top: 12px; right: 12px; background: none; border: none; color: rgba(255, 255, 255, 0.6);
        font-size: 24px; cursor: pointer; line-height: 1;
    ">×</button>
</div>
<div class="state-overlay" onclick="document.querySelector('.state-tracker-full')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6); z-index: 10000;
"></div>`;

        document.body.insertAdjacentHTML('beforeend', panelHtml);
    }

    updateRelationship(value) {
        this.stateData.relationship.value = parseInt(value);
        document.getElementById('relationship-value').textContent = value;
        this.saveState();
        this.updateMiniPanel();
    }

    updateTrust(value) {
        this.stateData.trust.value = parseInt(value);
        document.getElementById('trust-value').textContent = value;
        this.saveState();
        this.updateMiniPanel();
    }

    updateEnergy(value) {
        this.stateData.energy.value = parseInt(value);
        document.getElementById('energy-value').textContent = value;
        this.saveState();
        this.updateMiniPanel();
    }

    setEmotion(emotion) {
        this.stateData.emotion.current = emotion;
        this.stateData.emotion.history.push({
            timestamp: Date.now(),
            emotion: emotion,
            intensity: 80
        });
        this.saveState();
        this.showFullPanel();
    }

    resetState() {
        this.stateData = {
            emotion: { current: 'neutral', history: [], intensity: 50 },
            relationship: { value: 60, history: [] },
            trust: { value: 50, history: [] },
            energy: { value: 100, history: [] }
        };
        this.saveState();
        this.showFullPanel();
        toastr.success('状态已重置', '状态追踪');
    }

    updateMiniPanel() {
        const miniPanel = document.querySelector('.state-tracker-mini');
        if (miniPanel) {
            miniPanel.remove();
            this.showMiniPanel();
        }
    }
}

const stateTracker = new CharacterStateTracker();

class KeyInfoMarker {
    constructor() {
        this.storageKey = 'st-toolbox-marked-info';
        this.tags = ['剧情', '道具', '人物', '约定', '任务', '世界观'];
    }

    loadMarkedInfo() {
        const saved = localStorage.getItem(this.storageKey);
        return saved ? JSON.parse(saved) : [];
    }

    saveMarkedInfo(data) {
        localStorage.setItem(this.storageKey, JSON.stringify(data));
    }

    markText(text, tags = [], note = '') {
        const marked = {
            id: Date.now(),
            text: text,
            tags: tags,
            note: note,
            chatId: getContext().chatId || 'default',
            timestamp: new Date().toISOString()
        };

        const all = this.loadMarkedInfo();
        all.push(marked);
        this.saveMarkedInfo(all);

        toastr.success('已标记为重要信息', '标记');
        return marked;
    }

    markSelection() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (!selectedText) {
            toastr.warning('请先选中要标记的文本', '标记');
            return;
        }

        this.showMarkDialog(selectedText);
    }

    showMarkDialog(selectedText) {
        const dialogHtml = `
<div class="mark-dialog" style="
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.98); border: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 12px; padding: 20px; min-width: 400px; z-index: 10002;
    backdrop-filter: blur(16px); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
">
    <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">标记重要信息</h3>
    
    <div style="color: rgba(255, 255, 255, 0.7); font-size: 12px; margin-bottom: 8px;">选中的文本：</div>
    <div style="background: rgba(255, 255, 255, 0.05); border-radius: 6px; padding: 10px; margin-bottom: 16px; max-height: 100px; overflow-y: auto;">
        <p style="color: rgba(255, 255, 255, 0.9); margin: 0; font-size: 13px; line-height: 1.5;">${selectedText}</p>
    </div>
    
    <div style="margin-bottom: 12px;">
        <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px; display: block; margin-bottom: 6px;">选择标签：</label>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${this.tags.map(tag => `
                <label style="cursor: pointer;">
                    <input type="checkbox" class="mark-tag-checkbox" value="${tag}" style="margin-right: 4px;">
                    <span style="padding: 4px 10px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 4px; color: rgba(255, 255, 255, 0.8); font-size: 12px;">${tag}</span>
                </label>
            `).join('')}
        </div>
    </div>
    
    <div style="margin-bottom: 16px;">
        <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px; display: block; margin-bottom: 6px;">备注（可选）：</label>
        <input type="text" id="mark-note-input" placeholder="添加备注信息..." style="
            width: 100%; padding: 8px 12px; background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 6px;
            color: rgba(255, 255, 255, 0.9); font-size: 13px; box-sizing: border-box;
        ">
    </div>
    
    <div style="display: flex; gap: 10px;">
        <button onclick="
            const checkedBoxes = document.querySelectorAll('.mark-tag-checkbox:checked');
            const selectedTags = Array.from(checkedBoxes).map(cb => cb.value);
            const note = document.getElementById('mark-note-input').value;
            keyInfoMarker.markText(\`${selectedText.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, selectedTags, note);
            document.querySelector('.mark-dialog')?.remove();
        " style="
            flex: 1; padding: 10px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 6px; color: white; cursor: pointer;
        ">确认标记</button>
        <button onclick="document.querySelector('.mark-dialog')?.remove()" style="
            flex: 1; padding: 10px; background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: rgba(255, 255, 255, 0.8); cursor: pointer;
        ">取消</button>
    </div>
    
    <button onclick="document.querySelector('.mark-dialog')?.remove()" style="
        position: absolute; top: 10px; right: 10px; background: none; border: none; color: rgba(255, 255, 255, 0.5);
        font-size: 20px; cursor: pointer;
    ">X</button>
</div>
<div class="mark-overlay" onclick="document.querySelector('.mark-dialog')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6); z-index: 10001;
"></div>`;

        document.body.insertAdjacentHTML('beforeend', dialogHtml);
    }

    search(keyword) {
        const all = this.loadMarkedInfo();
        const currentChatId = getContext().chatId || 'default';
        
        return all.filter(item => 
            item.chatId === currentChatId && (
                item.text.includes(keyword) || 
                item.note.includes(keyword) ||
                item.tags.some(tag => tag.includes(keyword))
            )
        );
    }

    getCurrentChatMarks() {
        const all = this.loadMarkedInfo();
        const currentChatId = getContext().chatId || 'default';
        return all.filter(item => item.chatId === currentChatId);
    }

    deleteMark(markId) {
        const all = this.loadMarkedInfo();
        const filtered = all.filter(item => item.id !== markId);
        this.saveMarkedInfo(filtered);
        toastr.success('已删除标记', '标记');
    }

    exportToWorldInfo(markId) {
        const marked = this.loadMarkedInfo().find(m => m.id === markId);
        if (!marked) return false;

        const worldEntry = {
            key: marked.text.substring(0, 50),
            content: marked.text,
            type: 'flag',
            constant: false,
            selective: true,
            order: 999,
            comment: marked.note || marked.tags.join(', ')
        };

        toastr.success('已导出到世界书', '标记');
        return worldEntry;
    }

    formatForInjection(marked) {
        return `[重要标记 - ${marked.tags.join('/')}] ${marked.text}${marked.note ? ` (备注: ${marked.note})` : ''}`;
    }

    showSearchPanel() {
        const currentMarks = this.getCurrentChatMarks();
        
        const panelHtml = `
<div class="search-panel" style="
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.98); border: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 12px; padding: 20px; min-width: 500px; max-width: 700px; 
    max-height: 70vh; overflow-y: auto; z-index: 10002;
    backdrop-filter: blur(16px); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
">
    <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">标记信息检索</h3>
    
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        <input type="text" id="mark-search-input" placeholder="输入关键词搜索..." style="
            flex: 1; padding: 10px 12px; background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 6px;
            color: rgba(255, 255, 255, 0.9); font-size: 13px;
        ">
        <button onclick="keyInfoMarker.doSearch()" style="
            padding: 10px 20px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 6px; color: white; cursor: pointer;
        ">搜索</button>
    </div>
    
    <div style="margin-bottom: 12px;">
        <label style="color: rgba(255, 255, 255, 0.6); font-size: 12px;">标签筛选：</label>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            ${this.tags.map(tag => `
                <button onclick="keyInfoMarker.filterByTag('${tag}')" class="tag-filter-btn" style="
                    padding: 4px 12px; background: rgba(99, 102, 241, 0.15);
                    border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 4px;
                    color: rgba(255, 255, 255, 0.8); font-size: 12px; cursor: pointer;
                ">${tag}</button>
            `).join('')}
            <button onclick="keyInfoMarker.showAllMarks()" class="tag-filter-btn" style="
                padding: 4px 12px; background: rgba(99, 102, 241, 0.3);
                border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 4px;
                color: white; font-size: 12px; cursor: pointer;
            ">全部</button>
        </div>
    </div>
    
    <div id="mark-results" style="max-height: 400px; overflow-y: auto;">
        ${this.renderMarksList(currentMarks)}
    </div>
    
    <button onclick="document.querySelector('.search-panel')?.remove()" style="
        position: absolute; top: 10px; right: 10px; background: none; border: none; color: rgba(255, 255, 255, 0.5);
        font-size: 20px; cursor: pointer;
    ">X</button>
</div>
<div class="search-overlay" onclick="document.querySelector('.search-panel')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6); z-index: 10001;
"></div>`;

        document.body.insertAdjacentHTML('beforeend', panelHtml);

        document.getElementById('mark-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.doSearch();
            }
        });
    }

    renderMarksList(marks) {
        if (marks.length === 0) {
            return '<p style="color: rgba(255, 255, 255, 0.5); text-align: center; padding: 20px;">暂无标记信息</p>';
        }

        return marks.map(mark => `
            <div style="
                background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(99, 102, 241, 0.2);
                border-radius: 8px; padding: 12px; margin-bottom: 10px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${mark.tags.map(t => `
                            <span style="padding: 2px 8px; background: rgba(99, 102, 241, 0.2); border-radius: 3px; color: rgba(255, 255, 255, 0.7); font-size: 11px;">${t}</span>
                        `).join('')}
                    </div>
                    <span style="color: rgba(255, 255, 255, 0.4); font-size: 10px;">${new Date(mark.timestamp).toLocaleDateString()}</span>
                </div>
                <p style="color: rgba(255, 255, 255, 0.9); font-size: 13px; margin: 0 0 6px 0; line-height: 1.5;">${mark.text}</p>
                ${mark.note ? `<p style="color: rgba(255, 255, 255, 0.5); font-size: 11px; margin: 0 0 8px 0; font-style: italic;">备注: ${mark.note}</p>` : ''}
                <div style="display: flex; gap: 6px;">
                    <button onclick="keyInfoMarker.injectMark(${mark.id})" style="
                        padding: 6px 12px; background: rgba(99, 102, 241, 0.3);
                        border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 4px;
                        color: white; font-size: 11px; cursor: pointer;
                    ">插入</button>
                    <button onclick="keyInfoMarker.copyMark(${mark.id})" style="
                        padding: 6px 12px; background: rgba(16, 185, 129, 0.3);
                        border: 1px solid rgba(16, 185, 129, 0.5); border-radius: 4px;
                        color: white; font-size: 11px; cursor: pointer;
                    ">复制</button>
                    <button onclick="keyInfoMarker.deleteMark(${mark.id}); keyInfoMarker.showSearchPanel();" style="
                        padding: 6px 12px; background: rgba(239, 68, 68, 0.3);
                        border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 4px;
                        color: white; font-size: 11px; cursor: pointer;
                    ">删除</button>
                </div>
            </div>
        `).join('');
    }

    doSearch() {
        const keyword = document.getElementById('mark-search-input').value.trim();
        const results = keyword ? this.search(keyword) : this.getCurrentChatMarks();
        document.getElementById('mark-results').innerHTML = this.renderMarksList(results);
    }

    filterByTag(tag) {
        const all = this.getCurrentChatMarks();
        const filtered = all.filter(m => m.tags.includes(tag));
        document.getElementById('mark-results').innerHTML = this.renderMarksList(filtered);
    }

    showAllMarks() {
        const all = this.getCurrentChatMarks();
        document.getElementById('mark-results').innerHTML = this.renderMarksList(all);
    }

    injectMark(markId) {
        const marked = this.loadMarkedInfo().find(m => m.id === markId);
        if (!marked) return;

        const formatted = this.formatForInjection(marked);
        const textarea = getMessageInput();
        if (!textarea.length) return;

        const current = textarea.val() || '';
        textarea.val(current + (current ? '\n\n' : '') + formatted);
        textarea.focus();

        document.querySelector('.search-panel')?.remove();
        toastr.success('已插入标记信息', '标记');
    }

    copyMark(markId) {
        const marked = this.loadMarkedInfo().find(m => m.id === markId);
        if (!marked) return;

        const formatted = this.formatForInjection(marked);
        navigator.clipboard.writeText(formatted).then(() => {
            toastr.success('已复制到剪贴板', '标记');
        });
    }
}

const keyInfoMarker = new KeyInfoMarker();

class PromptTemplateEngine {
    constructor() {
        this.templates = {
            narrative: {
                id: 'narrative',
                name: '剧情推进',
                category: '剧情',
                description: '用于推动故事发展，制造戏剧冲突',
                template: `【场景设定】
{{current_scene}}

【剧情目标】
{{narrative_goal}}

【用户输入】
{{user_input}}

请以{{character_name}}的身份，推进剧情发展，注意：
1. 保持角色一致性
2. 制造适当的戏剧冲突
3. 为用户留下互动空间`,
                variables: ['current_scene', 'narrative_goal', 'character_name', 'user_input']
            },

            combat: {
                id: 'combat',
                name: '战斗系统',
                category: '互动',
                description: '用于描述战斗场景和动作',
                template: `【战斗场景】
{{battle_scene}}

【双方状态】
我方：{{player_status}}
敌方：{{enemy_status}}

【战斗指令】
{{player_action}}

请描述战斗回合结果，包含：
1. 行动结果
2. 伤害计算
3. 状态变化
4. 敌方反击`,
                variables: ['battle_scene', 'player_status', 'enemy_status', 'player_action']
            },

            romance: {
                id: 'romance',
                name: '角色互动',
                category: '互动',
                description: '用于角色之间的情感交流',
                template: `【互动场景】
{{interaction_scene}}

【关系状态】
{{relationship_status}}

【氛围】
{{atmosphere}}

请以{{character_name}}的身份进行角色互动，体现：
1. 符合角色性格的情感表达
2. 与关系阶段相符的亲密度
3. 细腻的心理描写`,
                variables: ['interaction_scene', 'relationship_status', 'atmosphere', 'character_name']
            },

            mystery: {
                id: 'mystery',
                name: '解谜环节',
                category: '剧情',
                description: '用于设计谜题和线索',
                template: `【谜题背景】
{{mystery_background}}

【已知线索】
{{known_clues}}

【当前探索】
{{current_exploration}}

请设计解谜环节：
1. 提供新的线索暗示
2. 保持适当的难度
3. 不直接给出答案`,
                variables: ['mystery_background', 'known_clues', 'current_exploration']
            },

            description: {
                id: 'description',
                name: '场景描写',
                category: '描写',
                description: '用于详细描述环境和场景',
                template: `【描写类型】
{{description_type}}

【场景要素】
{{scene_elements}}

【情绪基调】
{{emotional_tone}}

请进行{{description_type}}描写，要求：
1. 细节丰富，身临其境
2. 符合{{emotional_tone}}的情绪基调
3. 使用感官描写（视觉、听觉、嗅觉等）
4. 自然融入场景要素`,
                variables: ['description_type', 'scene_elements', 'emotional_tone']
            },

            dialogue: {
                id: 'dialogue',
                name: '对话生成',
                category: '对话',
                description: '用于生成角色对话',
                template: `【对话场景】
{{dialogue_scene}}

【对话双方】
{{speaker_a}}：{{speaker_a_personality}}
{{speaker_b}}：{{speaker_b_personality}}

【对话主题】
{{dialogue_topic}}

【对话目的】
{{dialogue_purpose}}

请生成{{speaker_a}}和{{speaker_b}}之间的对话，要求：
1. 符合各自的性格设定
2. 自然流畅，避免过于书面化
3. 体现对话主题和目的
4. 包含适当的动作描写`,
                variables: ['dialogue_scene', 'speaker_a', 'speaker_a_personality', 'speaker_b', 'speaker_b_personality', 'dialogue_topic', 'dialogue_purpose']
            },

            action: {
                id: 'action',
                name: '动作描写',
                category: '描写',
                description: '用于描写角色动作和行为',
                template: `【动作主体】
{{action_subject}}

【动作类型】
{{action_type}}

【动作背景】
{{action_context}}

【情绪状态】
{{emotional_state}}

请描写{{action_subject}}的{{action_type}}，要求：
1. 动作细节清晰
2. 融入{{emotional_state}}的情绪
3. 符合{{action_context}}的背景
4. 使用生动的动词和形容词`,
                variables: ['action_subject', 'action_type', 'action_context', 'emotional_state']
            }
        };

        this.customTemplates = this.loadCustomTemplates();
    }

    loadCustomTemplates() {
        const saved = localStorage.getItem('st-toolbox-custom-templates');
        return saved ? JSON.parse(saved) : [];
    }

    saveCustomTemplates() {
        localStorage.setItem('st-toolbox-custom-templates', JSON.stringify(this.customTemplates));
    }

    getAllTemplates() {
        return {
            builtIn: Object.values(this.templates),
            custom: this.customTemplates
        };
    }

    getTemplateById(id) {
        return this.templates[id] || this.customTemplates.find(t => t.id === id);
    }

    getTemplatesByCategory(category) {
        const builtIn = Object.values(this.templates).filter(t => t.category === category);
        const custom = this.customTemplates.filter(t => t.category === category);
        return [...builtIn, ...custom];
    }

    getCategories() {
        const categories = new Set();
        Object.values(this.templates).forEach(t => categories.add(t.category));
        this.customTemplates.forEach(t => categories.add(t.category));
        return Array.from(categories);
    }

    fillTemplate(templateId, variableValues = {}) {
        const template = this.getTemplateById(templateId);
        if (!template) return null;

        let filled = template.template;
        
        for (const [key, value] of Object.entries(variableValues)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            filled = filled.replace(regex, value || `[请填写${key}]`);
        }

        return {
            templateId: template.id,
            templateName: template.name,
            filled: filled
        };
    }

    injectToInput(templateId, variableValues = {}) {
        const result = this.fillTemplate(templateId, variableValues);
        if (!result) return;

        const textarea = getMessageInput();
        if (!textarea.length) return;

        const current = textarea.val() || '';
        textarea.val(current + (current ? '\n\n' : '') + result.filled);
        textarea.focus();
        
        toastr.success(`已插入模板：${result.templateName}`, '提示词模板');
    }

    createCustomTemplate(templateData) {
        const newTemplate = {
            id: `custom_${Date.now()}`,
            ...templateData,
            isCustom: true
        };
        
        this.customTemplates.push(newTemplate);
        this.saveCustomTemplates();
        
        return newTemplate;
    }

    deleteCustomTemplate(templateId) {
        const index = this.customTemplates.findIndex(t => t.id === templateId);
        if (index > -1) {
            this.customTemplates.splice(index, 1);
            this.saveCustomTemplates();
            return true;
        }
        return false;
    }

    showTemplateSelector() {
        const allTemplates = this.getAllTemplates();
        const categories = this.getCategories();

        let categoriesHtml = categories.map(cat => {
            const templates = allTemplates.builtIn.filter(t => t.category === cat);
            const customTemplates = allTemplates.custom.filter(t => t.category === cat);
            const allCatTemplates = [...templates, ...customTemplates];

            if (allCatTemplates.length === 0) return '';

            return `
                <div style="margin-bottom: 16px;">
                    <h4 style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid rgba(99, 102, 241, 0.3);">${cat}</h4>
                    <div style="display: grid; gap: 8px;">
                        ${allCatTemplates.map(t => `
                            <div onclick="promptEngine.showTemplatePanel('${t.id}')" style="
                                background: rgba(255, 255, 255, 0.03);
                                border: 1px solid rgba(99, 102, 241, 0.2);
                                border-radius: 8px;
                                padding: 12px;
                                cursor: pointer;
                                transition: all 0.2s;
                            " onmouseover="this.style.background='rgba(99, 102, 241, 0.1)'; this.style.borderColor='rgba(99, 102, 241, 0.5)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.03)'; this.style.borderColor='rgba(99, 102, 241, 0.2)';">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #fff; font-size: 14px; font-weight: 500;">${t.name}</span>
                                    ${t.isCustom ? '<span style="padding: 2px 6px; background: rgba(139, 92, 246, 0.3); border-radius: 3px; color: rgba(255, 255, 255, 0.7); font-size: 10px;">自定义</span>' : ''}
                                </div>
                                <p style="color: rgba(255, 255, 255, 0.5); font-size: 12px; margin: 6px 0 0 0;">${t.description}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        const panelHtml = `
<div class="template-selector" style="
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.98); border: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 12px; padding: 20px; min-width: 600px; max-width: 800px;
    max-height: 80vh; overflow-y: auto; z-index: 10002;
    backdrop-filter: blur(16px); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
">
    <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 18px;">提示词模板库</h3>
    ${categoriesHtml}
    <button onclick="document.querySelector('.template-selector')?.remove()" style="
        position: absolute; top: 10px; right: 10px; background: none; border: none; color: rgba(255, 255, 255, 0.5);
        font-size: 20px; cursor: pointer;
    ">X</button>
</div>
<div class="template-overlay" onclick="document.querySelector('.template-selector')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6); z-index: 10001;
"></div>`;

        document.body.insertAdjacentHTML('beforeend', panelHtml);
    }

    showTemplatePanel(templateId) {
        const template = this.getTemplateById(templateId);
        if (!template) return;

        document.querySelector('.template-selector')?.remove();

        let variablesHtml = template.variables.map(v => `
            <div style="margin-bottom: 12px;">
                <label style="color: rgba(255, 255, 255, 0.7); font-size: 12px; display: block; margin-bottom: 6px;">${v}：</label>
                <textarea id="var_${v}" rows="2" placeholder="请输入${v}..." style="
                    width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 6px;
                    color: rgba(255, 255, 255, 0.9); font-size: 13px; box-sizing: border-box;
                    resize: vertical;
                "></textarea>
            </div>
        `).join('');

        const panelHtml = `
<div class="template-panel" style="
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.98); border: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 12px; padding: 20px; min-width: 500px; max-width: 700px;
    max-height: 85vh; overflow-y: auto; z-index: 10003;
    backdrop-filter: blur(16px); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
">
    <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 18px;">${template.name}</h3>
    <p style="color: rgba(255, 255, 255, 0.6); font-size: 13px; margin: 0 0 16px 0;">${template.description}</p>
    
    <div style="margin-bottom: 16px;">
        <h4 style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin: 0 0 12px 0;">填写变量</h4>
        ${variablesHtml}
    </div>
    
    <div style="margin-bottom: 16px;">
        <h4 style="color: rgba(255, 255, 255, 0.8); font-size: 14px; margin: 0 0 12px 0;">模板预览</h4>
        <div id="template-preview" style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 6px; padding: 12px; max-height: 200px; overflow-y: auto;">
            <pre style="color: rgba(255, 255, 255, 0.8); font-size: 12px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${template.template}</pre>
        </div>
    </div>
    
    <div style="display: flex; gap: 10px;">
        <button onclick="promptEngine.updatePreview('${templateId}')" style="
            flex: 1; padding: 10px; background: rgba(99, 102, 241, 0.3);
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 6px; color: white; cursor: pointer;
        ">更新预览</button>
        <button onclick="promptEngine.confirmAndInject('${templateId}')" style="
            flex: 1; padding: 10px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.6));
            border: 1px solid rgba(99, 102, 241, 0.5); border-radius: 6px; color: white; cursor: pointer;
        ">插入到输入框</button>
    </div>
    
    <button onclick="document.querySelector('.template-panel')?.remove()" style="
        position: absolute; top: 10px; right: 10px; background: none; border: none; color: rgba(255, 255, 255, 0.5);
        font-size: 20px; cursor: pointer;
    ">X</button>
</div>
<div class="template-panel-overlay" onclick="document.querySelector('.template-panel')?.remove()" style="
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6); z-index: 10002;
"></div>`;

        document.body.insertAdjacentHTML('beforeend', panelHtml);
    }

    updatePreview(templateId) {
        const template = this.getTemplateById(templateId);
        if (!template) return;

        let preview = template.template;
        
        template.variables.forEach(v => {
            const value = document.getElementById(`var_${v}`)?.value || `[${v}]`;
            const regex = new RegExp(`{{${v}}}`, 'g');
            preview = preview.replace(regex, value);
        });

        document.getElementById('template-preview').innerHTML = `<pre style="color: rgba(255, 255, 255, 0.8); font-size: 12px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${preview}</pre>`;
    }

    confirmAndInject(templateId) {
        const template = this.getTemplateById(templateId);
        if (!template) return;

        const variableValues = {};
        template.variables.forEach(v => {
            variableValues[v] = document.getElementById(`var_${v}`)?.value || '';
        });

        this.injectToInput(templateId, variableValues);
        document.querySelector('.template-panel')?.remove();
    }
}

const promptEngine = new PromptTemplateEngine();

jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    
    const toolbarHtml = `
<div id="toolbox_toolbar" style="display: none;">
    <button id="toolbox_timestamp_btn" class="toolbox-btn" title="插入当前时间戳">
        <span class="btn-text">时间</span>
    </button>
    <button id="toolbox_datetime_btn" class="toolbox-btn" title="插入完整日期时间">
        <span class="btn-text">日期</span>
    </button>
    <button id="toolbox_copy_btn" class="toolbox-btn" title="复制上一条AI消息">
        <span class="btn-text">复制</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_clear_btn" class="toolbox-btn" title="清空输入框">
        <span class="btn-text">清空</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_anchor_btn" class="toolbox-btn" title="角色设定锚点注入器">
        <span class="btn-text">锚点</span>
    </button>
    <button id="toolbox_state_btn" class="toolbox-btn" title="角色状态追踪面板">
        <span class="btn-text">状态</span>
    </button>
    <button id="toolbox_mark_btn" class="toolbox-btn" title="标记和检索重要信息">
        <span class="btn-text">标记</span>
    </button>
    <button id="toolbox_template_btn" class="toolbox-btn" title="提示词模板引擎">
        <span class="btn-text">模板</span>
    </button>
    <div class="toolbox-divider"></div>
    <button id="toolbox_upper_btn" class="toolbox-btn" title="将选中文本转为大写">
        <span class="btn-text">大写</span>
    </button>
    <button id="toolbox_lower_btn" class="toolbox-btn" title="将选中文本转为小写">
        <span class="btn-text">小写</span>
    </button>
    <button id="toolbox_trim_btn" class="toolbox-btn" title="去除文本首尾空格">
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
    $("#toolbox_state_btn").on("click", () => stateTracker.showMiniPanel());
    $("#toolbox_mark_btn").on("click", () => keyInfoMarker.showSearchPanel());
    $("#toolbox_template_btn").on("click", () => promptEngine.showTemplateSelector());
    $("#toolbox_upper_btn").on("click", convertToUppercase);
    $("#toolbox_lower_btn").on("click", convertToLowercase);
    $("#toolbox_trim_btn").on("click", trimWhitespace);

    loadSettings();
    
    stateTracker.loadState();
    
    const originalSendMessage = window.sendChatMessage;
    if (originalSendMessage) {
        window.sendChatMessage = function(...args) {
            const result = originalSendMessage.apply(this, args);
            setTimeout(() => {
                const context = getContext();
                if (context.chat && context.chat.length > 0) {
                    const lastMessage = context.chat[context.chat.length - 1];
                    if (!lastMessage.is_user) {
                        stateTracker.updateFromMessage(lastMessage.mes, true);
                    }
                }
            }, 100);
            return result;
        };
    }
});
