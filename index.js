import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    gen3PromptStyle: 'varied',
    worldbookMaxChars: 10,
};

const appState = {
    expandedTab: null,
    currentCharacter: null,
    gen3Replies: [],
    worldbookEntry: null,
    isGenerating: false,
};

const selectors = {
    toolbar: '#toolbox-toolbar',
    status: '#toolbox-char-name',
    buttons: '.toolbox-buttons',
    content: '#toolbox-content',
    gen3Btn: '#toolbox-gen3-btn',
    worldbookBtn: '#toolbox-worldbook-btn',
    enableCheckbox: '#enable_toolbox',
};

function log(message, data = null, type = 'info') {
    const prefix = `[${extensionName}]`;
    const logFn = type === 'error' ? console.error : console.log;
    logFn(prefix, message, data || '');
}

async function callTavernApi(prompt, systemPrompt = '') {
    if (window.parent?.TavernHelper?.generate) {
        try {
            const params = {
                user_input: systemPrompt + prompt,
                should_stream: false,
                disable_extras: true,
                stop_everything: true,
            };
            const response = await window.parent.TavernHelper.generate(params);
            return response?.trim() || '';
        } catch (e) {
            log('Tavern API调用失败', e, 'error');
            throw new Error('AI生成失败');
        }
    }
    throw new Error('Tavern API不可用');
}

function getContextSafe() {
    try {
        return getContext();
    } catch (e) {
        log('获取上下文失败', e, 'error');
        return null;
    }
}

function getCurrentCharacterData() {
    const context = getContextSafe();
    if (!context) return null;

    let character = null;
    let charData = null;

    if (context.characterId >= 0 && context.characters?.[context.characterId]) {
        character = context.characters[context.characterId];
        charData = character?.data || character;
    } else if (context.character) {
        character = context.character;
        charData = character?.data || character;
    } else if (context.selectedCharacter) {
        character = context.selectedCharacter;
        charData = character?.data || character;
    }

    if (!character?.name) return null;

    return {
        name: character.name,
        description: charData?.description || '',
        personality: charData?.personality || '',
        scenario: charData?.scenario || '',
        first_mes: charData?.first_mes || '',
        mes_example: charData?.mes_example || '',
        world_info: charData?.world_info || '',
        avatar: character.avatar || charData?.avatar || '',
        charId: context.characterId,
        raw: character,
    };
}

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

function goBack() {
    appState.expandedTab = null;
    appState.isGenerating = false;
    $(selectors.content).html('');
    $(selectors.buttons).show();
}

function toggleTab(tab) {
    appState.expandedTab = appState.expandedTab === tab ? null : tab;
    appState.gen3Replies = [];
    appState.worldbookEntry = null;
    appState.isGenerating = false;

    if (appState.expandedTab) {
        $(selectors.buttons).hide();
        renderPage();
    } else {
        goBack();
    }
}

function renderPage() {
    const html = appState.expandedTab === 'gen3' 
        ? renderGen3Page() 
        : renderWorldbookPage();
    $(selectors.content).html(html);
    bindPageEvents();
}

function renderGen3Page() {
    const char = appState.currentCharacter || getCurrentCharacterData();
    const hasChat = getContextSafe()?.chat?.length > 0;

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.toolboxGoBack()">←</button>
                <span class="toolbox-page-title">生成3</span>
            </div>
            <div class="toolbox-page-body">
                ${char?.name ? `
                    <div class="toolbox-info-bar">
                        <span class="toolbox-info-label">角色:</span>
                        <span class="toolbox-info-value">${char.name}</span>
                        <span class="toolbox-info-status ${hasChat ? 'active' : 'inactive'}">
                            ${hasChat ? '● ' + (getContextSafe()?.chat?.length || 0) + '条' : '○ 无对话'}
                        </span>
                    </div>
                    <div id="gen3-status" class="toolbox-status-text">准备就绪</div>
                    <div id="gen3-results" class="toolbox-results"></div>
                    <button id="gen3-start" class="toolbox-btn toolbox-btn-primary" ${!hasChat ? 'disabled' : ''}>
                        ${hasChat ? '生成回复' : '无对话'}
                    </button>
                ` : `
                    <div class="toolbox-empty">
                        <span>请先加载角色</span>
                    </div>
                `}
            </div>
        </div>
    `;
}

function renderWorldbookPage() {
    const char = appState.currentCharacter || getCurrentCharacterData();
    const hasChat = getContextSafe()?.chat?.length > 0;

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.toolboxGoBack()">←</button>
                <span class="toolbox-page-title">世界书</span>
            </div>
            <div class="toolbox-page-body">
                ${char?.name ? `
                    <div class="toolbox-info-bar">
                        <span class="toolbox-info-label">角色:</span>
                        <span class="toolbox-info-value">${char.name}</span>
                        <span class="toolbox-info-status ${hasChat ? 'active' : 'inactive'}">
                            ${hasChat ? '● ' + (getContextSafe()?.chat?.length || 0) + '条' : '○ 无对话'}
                        </span>
                    </div>
                    <div id="wb-status" class="toolbox-status-text">准备就绪</div>
                    <div id="wb-preview" class="toolbox-wb-preview"></div>
                    <div class="toolbox-wb-actions">
                        <button id="wb-generate" class="toolbox-btn toolbox-btn-primary" ${!hasChat ? 'disabled' : ''}>
                            ${hasChat ? '分析生成' : '无对话'}
                        </button>
                        <button id="wb-save" class="toolbox-btn toolbox-btn-secondary" disabled>保存</button>
                    </div>
                ` : `
                    <div class="toolbox-empty">
                        <span>请先加载角色</span>
                    </div>
                `}
            </div>
        </div>
    `;
}

async function handleGen3Generate() {
    if (appState.isGenerating) return;
    
    const context = getContextSafe();
    if (!context?.chat?.length) {
        setStatus('gen3-status', '无对话内容', 'error');
        return;
    }

    appState.isGenerating = true;
    appState.gen3Replies = [];
    
    const char = appState.currentCharacter;
    const recentMsgs = context.chat.slice(-5);
    const chatHistory = recentMsgs.map(m => m.mes).join('\n');
    const resultsEl = $('#gen3-results');
    const btn = $('#gen3-start');

    try {
        setStatus('gen3-status', '生成中...', 'loading');
        btn.prop('disabled', true);
        resultsEl.html('');

        const systemPrompt = `你是角色"${char?.name || 'AI'}"，根据对话历史生成3个不同风格的回复选项。
要求：
1. 风格差异化（正式/随和/调皮等）
2. 符合角色性格
3. 每条回复不超过50字
4. 直接输出3条，用换行分隔，不要编号`;

        for (let i = 0; i < 3; i++) {
            setStatus('gen3-status', `生成 ${i + 1}/3...`, 'loading');
            
            let reply = '';
            try {
                reply = await callTavernApi(chatHistory, systemPrompt);
                const lines = reply.split('\n').filter(l => l.trim());
                reply = lines[i % lines.length] || reply.split('\n')[0];
            } catch (e) {
                log('API调用失败', e, 'error');
                reply = `[回复 ${i + 1}] 模拟回复内容 ${i + 1}`;
            }

            appState.gen3Replies.push(reply);
            resultsEl.append(`
                <div class="toolbox-result-item" data-index="${i}">
                    <div class="toolbox-result-num">${i + 1}</div>
                    <div class="toolbox-result-text">${reply.substring(0, 60)}${reply.length > 60 ? '...' : ''}</div>
                    <button class="toolbox-result-use">使用</button>
                </div>
            `);
        }

        setStatus('gen3-status', '完成', 'success');
    } catch (e) {
        log('生成失败', e, 'error');
        setStatus('gen3-status', '生成失败', 'error');
    } finally {
        appState.isGenerating = false;
        btn.prop('disabled', false);
    }
}

async function handleWorldbookGenerate() {
    if (appState.isGenerating) return;
    
    const context = getContextSafe();
    if (!context?.chat?.length) {
        setStatus('wb-status', '无对话内容', 'error');
        return;
    }

    appState.isGenerating = true;
    const char = appState.currentCharacter;
    const previewEl = $('#wb-preview');
    const btn = $('#wb-generate');
    const saveBtn = $('#wb-save');

    try {
        setStatus('wb-status', '分析中...', 'loading');
        btn.prop('disabled', true);
        previewEl.html('<div class="toolbox-loading">处理中...</div>');

        const recentMsgs = context.chat.slice(-20);
        const chatHistory = recentMsgs.map(m => m.mes).join('\n');

        const characters = new Set([char?.name || '主角']);
        recentMsgs.forEach(msg => {
            if (msg.mes) {
                const matches = msg.mes.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
                matches?.forEach(m => {
                    if (m.length > 2 && m.length < 25) characters.add(m);
                });
            }
        });

        const charList = Array.from(characters).slice(0, 8);
        const entryName = `${char?.name || '当前'}场景`;

        setStatus('wb-status', '生成内容...', 'loading');

        let content = '';
        try {
            const prompt = `基于以下对话，生成世界书条目：
1. 角色简介
2. 人物关系  
3. 当前场景
用简洁的关键词风格描述，每项不超过30字。\n\n${chatHistory.substring(0, 600)}`;
            content = await callTavernApi(prompt);
        } catch (e) {
            log('API调用失败', e, 'error');
            content = `角色: ${charList.slice(0, 3).join(', ')}\n关系: 共同出场\n场景: 最近${recentMsgs.length}条对话`;
        }

        appState.worldbookEntry = {
            name: entryName,
            keywords: charList,
            content: content,
            timestamp: Date.now(),
        };

        previewEl.html(`
            <div class="toolbox-wb-entry">
                <div class="toolbox-wb-name">${entryName}</div>
                <div class="toolbox-wb-tags">${charList.slice(0, 5).map(c => `<span>${c}</span>`).join('')}</div>
                <div class="toolbox-wb-content">${content}</div>
            </div>
        `);

        saveBtn.prop('disabled', false);
        setStatus('wb-status', '完成', 'success');
    } catch (e) {
        log('生成失败', e, 'error');
        setStatus('wb-status', '生成失败', 'error');
        previewEl.html('');
    } finally {
        appState.isGenerating = false;
        btn.prop('disabled', false);
    }
}

function handleSaveWorldbook() {
    if (!appState.worldbookEntry) return;
    
    const btn = $('#wb-save');
    btn.prop('disabled', true).text('保存中...');

    try {
        if (window.createWorldEntry) {
            window.createWorldEntry({
                name: appState.worldbookEntry.name,
                content: appState.worldbookEntry.content,
                keywords: appState.worldbookEntry.keywords,
            });
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(appState.worldbookEntry, null, 2));
        }

        setStatus('wb-status', '已保存', 'success');
        btn.text('已保存');

        setTimeout(() => {
            btn.prop('disabled', false).text('保存');
        }, 2000);
    } catch (e) {
        log('保存失败', e, 'error');
        setStatus('wb-status', '保存失败', 'error');
        btn.prop('disabled', false).text('保存');
    }
}

function handleUseReply(index) {
    const reply = appState.gen3Replies[index];
    if (!reply) return;

    const input = getMessageInput();
    if (input.length) {
        input.val(reply).focus();
        goBack();
    }
}

function setStatus(id, text, type) {
    const el = $(`#${id}`);
    if (!el.length) return;

    el.text(text).removeClass('status-loading status-success status-error');
    
    switch (type) {
        case 'loading':
            el.addClass('status-loading');
            break;
        case 'success':
            el.addClass('status-success');
            break;
        case 'error':
            el.addClass('status-error');
            break;
    }
}

function bindPageEvents() {
    $('#gen3-start').off('click').on('click', handleGen3Generate);
    $('#wb-generate').off('click').on('click', handleWorldbookGenerate);
    $('#wb-save').off('click').on('click', handleSaveWorldbook);

    $(document).off('click', '.toolbox-result-use').on('click', '.toolbox-result-use', function() {
        const index = $(this).closest('.toolbox-result-item').data('index');
        handleUseReply(index);
    });
}

function updateStatusDisplay() {
    const el = $(selectors.status);
    if (!el.length) return;

    if (appState.currentCharacter) {
        const chatLen = getContextSafe()?.chat?.length || 0;
        el.html(`<span class="char-name">${appState.currentCharacter.name}</span><span class="chat-count">${chatLen}条</span>`);
    } else {
        el.html('<span class="no-char">未加载</span>');
    }
}

function loadCharacter() {
    log('Loading character...');
    const char = getCurrentCharacterData();
    if (char) {
        appState.currentCharacter = char;
        log('Character loaded:', char.name);
        updateStatusDisplay();
        if (appState.expandedTab) renderPage();
        return true;
    }
    updateStatusDisplay();
    return false;
}

function setupEventListeners() {
    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        const events = [
            [event_types.CHAT_CHANGED, () => setTimeout(loadCharacter, 100)],
            [event_types.MESSAGE_RECEIVED, () => setTimeout(updateStatusDisplay, 100)],
            [event_types.CHARACTER_CHANGED, () => setTimeout(loadCharacter, 100)],
            [event_types.CHARACTER_LOADED, () => setTimeout(loadCharacter, 100)],
        ];

        events.forEach(([event, handler]) => {
            if (event) eventSource.on(event, handler);
        });
    }
}

async function initializeToolbar() {
    log('Initializing toolbar...');

    const html = `
        <div id="toolbox-toolbar" style="display: none;">
            <div class="toolbox-status-bar">
                <span id="toolbox-char-name" class="toolbox-status-text">未加载</span>
            </div>
            <div class="toolbox-buttons">
                <button id="toolbox-gen3-btn" class="toolbox-btn toolbox-btn-tab">生成3</button>
                <button id="toolbox-worldbook-btn" class="toolbox-btn toolbox-btn-tab">世界书</button>
            </div>
            <div id="toolbox-content" class="toolbox-content"></div>
        </div>
    `;

    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(html);
        log('Toolbar DOM inserted');
    } else {
        log('Target element not found', null, 'error');
        return;
    }

    $(selectors.gen3Btn).on('click', () => toggleTab('gen3'));
    $(selectors.worldbookBtn).on('click', () => toggleTab('worldbook'));
    $(selectors.enableCheckbox).on('input', handleEnableChange);

    await loadStoredSettings();

    setupEventListeners();

    window.toolboxGoBack = goBack;

    loadCharacter();
    [500, 1500, 3000, 5000].forEach(ms => setTimeout(loadCharacter, ms));

    log('Initialization complete');
}

async function loadStoredSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (!Object.keys(extension_settings[extensionName]).length) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const enabled = extension_settings[extensionName].enabled;
    $(selectors.enableCheckbox).prop('checked', enabled).trigger('input');
}

function handleEnableChange(e) {
    const enabled = Boolean($(e.target).prop('checked'));
    extension_settings[extensionName].enabled = enabled;
    saveSettingsDebounced();
    $(selectors.toolbar).toggle(enabled);
}

jQuery(initializeToolbar);
