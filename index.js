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
    <button id="toolbox_state_btn" class="toolbox-btn" title="角色状态追踪面板">
        <span class="btn-icon">🎭</span>
        <span class="btn-text">状态</span>
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
    $("#toolbox_state_btn").on("click", () => stateTracker.showMiniPanel());
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
