import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "st-toolbox";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    anchorEnabled: true,
    stateEnabled: true,
    markEnabled: true,
    templateEnabled: true,
    optimizerEnabled: true,
    exportEnabled: true,
    customKeywords: ''
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    const settings = extension_settings[extensionName];
    loadUI(settings);
}

function loadUI(settings) {
    $(".toolbox-btn[data-feature='anchor']").toggle(settings.anchorEnabled !== false);
    $(".toolbox-btn[data-feature='state']").toggle(settings.stateEnabled !== false);
    $(".toolbox-btn[data-feature='mark']").toggle(settings.markEnabled !== false);
    $(".toolbox-btn[data-feature='template']").toggle(settings.templateEnabled !== false);
    $(".toolbox-btn[data-feature='optimizer']").toggle(settings.optimizerEnabled !== false);
    $(".toolbox-btn[data-feature='export']").toggle(settings.exportEnabled !== false);
    
    if (!settings.enabled) {
        $("#toolbox_toolbar").hide();
    } else {
        $("#toolbox_toolbar").show();
    }
}

function getMessageInput() {
    return $("#send_textarea, #prompt_textarea").first();
}

function showToast(message) {
    if (typeof toastr !== 'undefined') {
        toastr.success(message);
    } else {
        alert(message);
    }
}

class CharacterAnchorTool {
    extractCharacterInfo() {
        const context = getContext();
        const character = context?.character;
        
        if (!character) {
            return { name: '未知角色', personality: '未设定', scenario: '未设定', description: '未设定' };
        }

        return {
            name: character.name || '未知角色',
            personality: character.data?.personality || character.personality || '未设定',
            scenario: character.data?.scenario || character.scenario || '未设定',
            description: character.data?.description || character.description || '未设定'
        };
    }

    generateAnchor(mode = 'temporary') {
        const charInfo = this.extractCharacterInfo();
        const customKeywords = extension_settings[extensionName].customKeywords || '';
        
        let anchor = '';
        
        if (mode === 'emergency') {
            anchor = `【紧急修正】你是${charInfo.name}。性格：${charInfo.personality}。场景：${charInfo.scenario}。设定：${charInfo.description}`;
            if (customKeywords) anchor += `。原则：${customKeywords}`;
            anchor += '。请严格遵守上述设定。';
        } else {
            anchor = `【角色设定】${charInfo.name}：${charInfo.personality} | 场景：${charInfo.scenario} | ${charInfo.description}`;
            if (customKeywords) anchor += ` | ${customKeywords}`;
        }
        
        return anchor;
    }

    inject(mode = 'temporary') {
        const anchor = this.generateAnchor(mode);
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const current = textarea.val() || '';
        textarea.val(current + (current ? '\n' : '') + anchor);
        textarea.focus();
        
        showToast(mode === 'emergency' ? '已注入紧急修正' : '已注入角色设定');
    }
}

class CharacterStateTool {
    getState() {
        const saved = localStorage.getItem(`st-toolbox-state-${getContext().chatId}`);
        return saved ? JSON.parse(saved) : { emotion: 'neutral', relationship: 60, trust: 50, energy: 100 };
    }

    saveState(state) {
        localStorage.setItem(`st-toolbox-state-${getContext().chatId}`, JSON.stringify(state));
    }

    adjust(field, delta) {
        const state = this.getState();
        state[field] = Math.max(0, Math.min(100, state[field] + delta));
        this.saveState(state);
        this.inject();
    }

    setEmotion(emotion) {
        const state = this.getState();
        state.emotion = emotion;
        this.saveState(state);
        this.inject();
    }

    inject() {
        const state = this.getState();
        const emotionText = { happy: '开心', sad: '悲伤', angry: '愤怒', fear: '恐惧', neutral: '平静', love: '喜爱' };
        
        const prompt = `【状态】情绪：${emotionText[state.emotion] || '平静'} | 关系：${state.relationship} | 信任：${state.trust} | 活力：${state.energy}`;
        
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const current = textarea.val() || '';
        textarea.val(current + (current ? '\n' : '') + prompt);
        textarea.focus();
        
        showToast('已注入角色状态');
    }

    reset() {
        this.saveState({ emotion: 'neutral', relationship: 60, trust: 50, energy: 100 });
        showToast('状态已重置');
    }
}

class KeyInfoTool {
    markSelection() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        if (!text) {
            showToast('请先选中要标记的文本');
            return;
        }

        const marked = {
            id: Date.now(),
            text: text,
            chatId: getContext().chatId || 'default',
            timestamp: new Date().toISOString()
        };

        const all = this.loadMarks();
        all.push(marked);
        localStorage.setItem('st-toolbox-marks', JSON.stringify(all));
        
        showToast('已标记');
    }

    loadMarks() {
        const saved = localStorage.getItem('st-toolbox-marks');
        return saved ? JSON.parse(saved) : [];
    }

    showMarks() {
        const all = this.loadMarks();
        const current = all.filter(m => m.chatId === (getContext().chatId || 'default')).slice(-10);
        
        if (current.length === 0) {
            showToast('暂无标记');
            return;
        }

        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const markedText = current.map(m => `[标记] ${m.text}`).join('\n');
        const currentVal = textarea.val() || '';
        textarea.val(currentVal + (currentVal ? '\n' : '') + markedText);
        textarea.focus();
        
        showToast(`已插入${current.length}条标记`);
    }
}

class PromptTemplateTool {
    useTemplate(type) {
        const templates = {
            narrative: '【剧情推进】请推进故事发展，保持角色一致性，制造戏剧冲突，为用户留下互动空间。',
            combat: '【战斗】请描述战斗场景和结果，包含行动、伤害、状态变化。',
            romance: '【情感互动】请以角色身份进行情感表达，体现性格和关系。',
            description: '【场景描写】请详细描写环境细节，使用感官描写，营造氛围。',
            dialogue: '【对话】请生成符合角色性格的自然对话，包含动作描写。',
            action: '【动作描写】请描写角色动作和行为，融入情绪和背景。'
        };

        const template = templates[type] || templates.narrative;
        const textarea = getMessageInput();
        if (!textarea.length) return;
        
        const current = textarea.val() || '';
        textarea.val(current + (current ? '\n' : '') + template);
        textarea.focus();
        
        showToast(`已插入${type}模板`);
    }
}

class PromptOptimizerTool {
    analyze() {
        const textarea = getMessageInput();
        const prompt = textarea.val() || '';
        
        if (!prompt) {
            showToast('请先输入提示词');
            return;
        }

        const issues = [];
        
        if (prompt.length < 20) {
            issues.push('提示词过短，建议添加更多细节');
        }
        
        if (/大概|可能|有点/.test(prompt)) {
            issues.push('存在模糊表述，建议更明确');
        }
        
        if (!/角色|身份|设定/.test(prompt) && !getContext().character) {
            issues.push('未明确角色身份');
        }

        const optimized = prompt
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (issues.length > 0) {
            showToast(issues[0]);
        } else {
            textarea.val(optimized);
            showToast('提示词已优化');
        }
    }
}

class ChatExporterTool {
    export(format = 'txt') {
        const context = getContext();
        if (!context?.chat) {
            showToast('暂无聊天记录');
            return;
        }

        let content = '';
        const messages = context.chat;

        if (format === 'txt') {
            content = messages.map(m => `${m.is_user ? '用户' : 'AI'}：${m.mes || m.value}`).join('\n\n');
        } else if (format === 'md') {
            content = `# ${context.character?.name || '聊天记录'}\n\n`;
            content += messages.map(m => `**${m.is_user ? '用户' : 'AI'}**：${m.mes || m.value}`).join('\n\n');
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat_${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast(`已导出为${format.toUpperCase()}格式`);
    }
}

const anchorTool = new CharacterAnchorTool();
const stateTool = new CharacterStateTool();
const markTool = new KeyInfoTool();
const templateTool = new PromptTemplateTool();
const optimizerTool = new PromptOptimizerTool();
const exporterTool = new ChatExporterTool();

jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    
    const toolbarHtml = `
<div id="toolbox_toolbar" class="toolbox-vertical">
    <button class="toolbox-btn" data-feature="anchor" onclick="anchorTool.inject()" title="角色锚点">
        <span class="btn-icon">锚</span>
        <span class="btn-text">角色</span>
    </button>
    <button class="toolbox-btn" data-feature="anchor" onclick="anchorTool.inject('emergency')" title="紧急修正">
        <span class="btn-icon">急</span>
        <span class="btn-text">修正</span>
    </button>
    <div class="toolbox-sep"></div>
    <button class="toolbox-btn" data-feature="state" onclick="stateTool.inject()" title="注入状态">
        <span class="btn-icon">状</span>
        <span class="btn-text">状态</span>
    </button>
    <button class="toolbox-btn" data-feature="state" onclick="stateTool.adjust('relationship', 5)" title="关系+5">
        <span class="btn-icon">关</span>
        <span class="btn-text">+关系</span>
    </button>
    <button class="toolbox-btn" data-feature="state" onclick="stateTool.adjust('trust', 5)" title="信任+5">
        <span class="btn-icon">信</span>
        <span class="btn-text">+信任</span>
    </button>
    <div class="toolbox-sep"></div>
    <button class="toolbox-btn" data-feature="mark" onclick="markTool.markSelection()" title="标记选中文本">
        <span class="btn-icon">标</span>
        <span class="btn-text">标记</span>
    </button>
    <button class="toolbox-btn" data-feature="mark" onclick="markTool.showMarks()" title="显示标记">
        <span class="btn-icon">记</span>
        <span class="btn-text">查标记</span>
    </button>
    <div class="toolbox-sep"></div>
    <button class="toolbox-btn" data-feature="template" onclick="templateTool.useTemplate('narrative')" title="剧情模板">
        <span class="btn-icon">剧</span>
        <span class="btn-text">剧情</span>
    </button>
    <button class="toolbox-btn" data-feature="template" onclick="templateTool.useTemplate('combat')" title="战斗模板">
        <span class="btn-icon">战</span>
        <span class="btn-text">战斗</span>
    </button>
    <button class="toolbox-btn" data-feature="template" onclick="templateTool.useTemplate('romance')" title="情感模板">
        <span class="btn-icon">情</span>
        <span class="btn-text">情感</span>
    </button>
    <button class="toolbox-btn" data-feature="template" onclick="templateTool.useTemplate('description')" title="描写模板">
        <span class="btn-icon">描</span>
        <span class="btn-text">描写</span>
    </button>
    <div class="toolbox-sep"></div>
    <button class="toolbox-btn" data-feature="optimizer" onclick="optimizerTool.analyze()" title="优化提示词">
        <span class="btn-icon">优</span>
        <span class="btn-text">优化</span>
    </button>
    <div class="toolbox-sep"></div>
    <button class="toolbox-btn" data-feature="export" onclick="exporterTool.export('txt')" title="导出为TXT">
        <span class="btn-icon">导</span>
        <span class="btn-text">导出</span>
    </button>
    <button class="toolbox-btn" data-feature="export" onclick="exporterTool.export('md')" title="导出为Markdown">
        <span class="btn-icon">MD</span>
        <span class="btn-text">MD</span>
    </button>
</div>`;
    
    const sendForm = $("#send_form");
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
    }

    loadSettings();

    $("#enable_toolbox").on("input", function() {
        extension_settings[extensionName].enabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_anchor").on("input", function() {
        extension_settings[extensionName].anchorEnabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_state").on("input", function() {
        extension_settings[extensionName].stateEnabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_mark").on("input", function() {
        extension_settings[extensionName].markEnabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_template").on("input", function() {
        extension_settings[extensionName].templateEnabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_optimizer").on("input", function() {
        extension_settings[extensionName].optimizerEnabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_export").on("input", function() {
        extension_settings[extensionName].exportEnabled = $(this).prop("checked");
        saveSettingsDebounced();
        loadUI(extension_settings[extensionName]);
    });

    $("#tool_custom_keywords").on("input", function() {
        extension_settings[extensionName].customKeywords = $(this).val();
        saveSettingsDebounced();
    });

    const settings = extension_settings[extensionName];
    $("#enable_toolbox").prop("checked", settings.enabled).trigger("input");
    $("#tool_anchor").prop("checked", settings.anchorEnabled !== false).trigger("input");
    $("#tool_state").prop("checked", settings.stateEnabled !== false).trigger("input");
    $("#tool_mark").prop("checked", settings.markEnabled !== false).trigger("input");
    $("#tool_template").prop("checked", settings.templateEnabled !== false).trigger("input");
    $("#tool_optimizer").prop("checked", settings.optimizerEnabled !== false).trigger("input");
    $("#tool_export").prop("checked", settings.exportEnabled !== false).trigger("input");
    $("#tool_custom_keywords").val(settings.customKeywords || '').trigger("input");
});
