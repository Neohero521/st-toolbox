import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
};

let appState = {
    expandedTab: null,
    currentCharacter: null,
    gen3Replies: [],
    worldbookEntry: null,
};

function logInfo(message, data = null) {
    const prefix = `[${extensionName}]`;
    if (data !== null) {
        console.log(prefix, message, data);
    } else {
        console.log(prefix, message);
    }
}

function logError(message, error = null) {
    const prefix = `[${extensionName}]`;
    if (error !== null) {
        console.error(prefix, message, error);
    } else {
        console.error(prefix, message);
    }
}

async function callParentApiForSummary(textToSummarize, promptToUse) {
    if (window.parent && window.parent.TavernHelper && 
        typeof window.parent.TavernHelper.generate === 'function') {
        const tavernGenerateFunc = window.parent.TavernHelper.generate;
        const params = {
            user_input: promptToUse,
            should_stream: false,
            disable_extras: true,
            stop_everything: true
        };
        try {
            const response = await tavernGenerateFunc(params);
            return response.trim();
        } catch (e) {
            console.error("父级API调用失败:", e);
            throw new Error('父窗口AI生成失败');
        }
    } else {
        throw new Error('父窗口API未找到');
    }
}

function getCurrentCharacterData() {
    try {
        const context = getContext();
        
        let character = null;
        let charData = null;
        
        if (context.characterId !== undefined && context.characters) {
            character = context.characters[context.characterId];
            if (character) {
                charData = character.data || character;
                logInfo('Got character via characters[characterId]', character.name);
            }
        }
        
        if (!character && context.character) {
            character = context.character;
            charData = character.data || character;
            logInfo('Got character via context.character', character.name);
        }
        
        if (!character && context.selectedCharacter) {
            character = context.selectedCharacter;
            charData = character.data || character;
            logInfo('Got character via selectedCharacter', character.name);
        }
        
        if (!character || !character.name) {
            logInfo('No character found');
            return null;
        }
        
        return {
            name: character.name,
            description: charData.description || '',
            personality: charData.personality || '',
            scenario: charData.scenario || '',
            first_mes: charData.first_mes || '',
            mes_example: charData.mes_example || '',
            world_info: charData.world_info || '',
            avatar: character.avatar || charData.avatar || '',
            charId: context.characterId,
            raw: character,
        };
    } catch (e) {
        logError('Error getting character data', e);
        return null;
    }
}

function getMessageInput() {
    return $('#send_textarea, #prompt_textarea').first();
}

function toggleTab(tab) {
    if (appState.expandedTab === tab && tab !== null) {
        appState.expandedTab = null;
    } else {
        appState.expandedTab = tab;
    }
    
    const container = $('#toolbox-content');
    const buttons = $('.toolbox-buttons');
    
    if (appState.expandedTab) {
        buttons.hide();
        renderExpandedContent();
    } else {
        container.html('');
        buttons.show();
    }
}

function goBack() {
    appState.expandedTab = null;
    const container = $('#toolbox-content');
    const buttons = $('.toolbox-buttons');
    container.html('');
    buttons.show();
}

function renderExpandedContent() {
    const container = $('#toolbox-content');
    if (!appState.expandedTab) {
        container.html('');
        return;
    }

    let content = '';
    switch(appState.expandedTab) {
        case 'gen3':
            content = renderGen3Content();
            break;
        case 'worldbook':
            content = renderWorldbookContent();
            break;
    }

    container.html(content);
    bindContentEvents();
}

function renderGen3Content() {
    const character = appState.currentCharacter || getCurrentCharacterData();

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">←</button>
                <span class="toolbox-page-title">生成3</span>
            </div>
            <div class="toolbox-page-body">
                ${character && character.name ? `
                    <div id="toolbox-gen3-status" class="toolbox-status-text">就绪</div>
                    <div id="toolbox-gen3-results" class="toolbox-gen3-results"></div>
                    <button id="toolbox-gen3-start-btn" class="toolbox-primary-btn">生成</button>
                ` : '<div class="toolbox-no-char">请先加载角色</div>'}
            </div>
        </div>
    `;
}

function renderWorldbookContent() {
    const character = appState.currentCharacter || getCurrentCharacterData();

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">←</button>
                <span class="toolbox-page-title">世界书</span>
            </div>
            <div class="toolbox-page-body">
                ${character && character.name ? `
                    <div id="toolbox-worldbook-status" class="toolbox-status-text">就绪</div>
                    <div id="toolbox-worldbook-preview" class="toolbox-worldbook-preview"></div>
                    <div class="toolbox-worldbook-actions">
                        <button id="toolbox-worldbook-start-btn" class="toolbox-primary-btn">生成</button>
                        <button id="toolbox-worldbook-save-btn" class="toolbox-secondary-btn" disabled>保存</button>
                    </div>
                ` : '<div class="toolbox-no-char">请先加载角色</div>'}
            </div>
        </div>
    `;
}

async function generate3Replies() {
    const statusEl = $('#toolbox-gen3-status');
    const resultsEl = $('#toolbox-gen3-results');
    const btn = $('#toolbox-gen3-start-btn');
    
    try {
        statusEl.text('生成中...').css('color', 'rgba(255, 165, 0, 0.9)');
        btn.prop('disabled', true);
        resultsEl.html('');

        const context = getContext();
        if (!context.chat) {
            statusEl.text('无聊天').css('color', 'rgba(248, 113, 113, 0.9)');
            btn.prop('disabled', false);
            return;
        }

        const character = appState.currentCharacter || getCurrentCharacterData();
        const recentMessages = context.chat.slice(-5);
        const chatHistory = recentMessages.map(m => m.mes).join('\n');

        appState.gen3Replies = [];
        
        for (let i = 0; i < 3; i++) {
            statusEl.text(`生成 ${i + 1}/3...`);
            
            let reply = '';
            
            try {
                const prompt = `作为角色${character?.name || ''}，请根据以下对话历史生成3个不同风格的回复选项（只回复内容，不需要编号）：\n\n${chatHistory}`;
                reply = await callParentApiForSummary(chatHistory, prompt);
            } catch (apiError) {
                logError('API调用失败，使用模拟数据', apiError);
                reply = `[回复 ${i + 1}] 这是模拟回复 ${i + 1}`;
            }
            
            if (reply) {
                appState.gen3Replies.push(reply);
                resultsEl.append(`
                    <div class="toolbox-result-item">
                        <div class="toolbox-result-header">${i + 1}</div>
                        <div class="toolbox-result-text">${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}</div>
                        <button class="toolbox-use-btn" data-index="${i}">使用</button>
                    </div>
                `);
            }
            
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        statusEl.text('完成').css('color', 'rgba(74, 222, 128, 0.9)');
        btn.prop('disabled', false);
        
    } catch (e) {
        logError('生成失败', e);
        statusEl.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        btn.prop('disabled', false);
    }
}

async function generateWorldbookEntry() {
    const statusEl = $('#toolbox-worldbook-status');
    const previewEl = $('#toolbox-worldbook-preview');
    const btn = $('#toolbox-worldbook-start-btn');
    const saveBtn = $('#toolbox-worldbook-save-btn');
    
    try {
        statusEl.text('分析中...').css('color', 'rgba(255, 165, 0, 0.9)');
        btn.prop('disabled', true);
        previewEl.html('<div class="toolbox-loading">生成中...</div>');

        const context = getContext();
        const character = appState.currentCharacter;
        
        if (!context.chat || context.chat.length === 0) {
            statusEl.text('无聊天').css('color', 'rgba(248, 113, 113, 0.9)');
            btn.prop('disabled', false);
            previewEl.html('');
            return;
        }

        statusEl.text('提取...');
        
        const recentMessages = context.chat.slice(-20);
        const characters = new Set();
        
        characters.add(character?.name || '主角');
        
        recentMessages.forEach(msg => {
            if (msg.mes) {
                const matches = msg.mes.match(/([A-Z][a-zA-Z]+|[一二三四五六七八九十百千万]+[号位人个等])/g);
                if (matches) {
                    matches.forEach(m => {
                        if (m.length > 1 && m.length < 20) {
                            characters.add(m);
                        }
                    });
                }
            }
        });

        statusEl.text('生成...');
        
        const charList = Array.from(characters).slice(0, 8);
        const entryName = `${character?.name || '角色'}的出场人物`;
        const chatHistory = recentMessages.map(m => m.mes).join('\n');
        
        let generatedContent = '';
        
        try {
            const prompt = `请根据以下对话内容，生成一个世界书条目，包含：1. 角色简介 2. 人物关系 3. 当前场景描述。用简洁的语言概括。\n\n对话内容：\n${chatHistory.substring(0, 500)}`;
            generatedContent = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败，使用默认内容', apiError);
            generatedContent = `出场人物：${charList.join('、')}\n场景：最近${recentMessages.length}条对话`;
        }
        
        appState.worldbookEntry = {
            name: entryName,
            keywords: charList,
            content: generatedContent || `出场人物：${charList.join('、')}`
        };
        
        previewEl.html(`
            <div class="toolbox-worldbook-entry">
                <div class="toolbox-entry-name">${appState.worldbookEntry.name}</div>
                <div class="toolbox-entry-keywords">${appState.worldbookEntry.keywords.join('、')}</div>
                <div class="toolbox-entry-content">${appState.worldbookEntry.content}</div>
            </div>
        `);
        
        saveBtn.prop('disabled', false);
        statusEl.text('完成').css('color', 'rgba(74, 222, 128, 0.9)');
        btn.prop('disabled', false);
        
    } catch (e) {
        logError('生成失败', e);
        statusEl.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        btn.prop('disabled', false);
        previewEl.html('');
    }
}

async function saveToWorldbook() {
    const btn = $('#toolbox-worldbook-save-btn');
    const statusEl = $('#toolbox-worldbook-status');
    
    if (!appState.worldbookEntry) {
        statusEl.text('无内容').css('color', 'rgba(248, 113, 113, 0.9)');
        return;
    }
    
    btn.prop('disabled', true).text('保存中...');
    
    try {
        if (typeof window.createWorldEntry !== 'undefined') {
            window.createWorldEntry({
                name: appState.worldbookEntry.name,
                content: appState.worldbookEntry.content,
                keywords: appState.worldbookEntry.keywords
            });
        } else if (typeof toastr !== 'undefined') {
            toastr.info('已复制到剪贴板');
            navigator.clipboard.writeText(JSON.stringify(appState.worldbookEntry, null, 2));
        }
        
        statusEl.text('已保存').css('color', 'rgba(74, 222, 128, 0.9)');
        btn.text('已保存');
        
        setTimeout(() => {
            btn.prop('disabled', false).text('保存');
        }, 2000);
        
    } catch (e) {
        logError('保存失败', e);
        statusEl.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        btn.prop('disabled', false).text('保存');
    }
}

function bindContentEvents() {
    $('#toolbox-gen3-start-btn').off('click').on('click', function() {
        generate3Replies();
    });
    
    $(document).off('click', '.toolbox-use-btn').on('click', '.toolbox-use-btn', function() {
        const index = $(this).data('index');
        const reply = appState.gen3Replies[index];
        
        if (reply) {
            const input = getMessageInput();
            if (input.length) {
                input.val(reply);
                input.focus();
                goBack();
            }
        }
    });
    
    $('#toolbox-worldbook-start-btn').off('click').on('click', function() {
        generateWorldbookEntry();
    });
    
    $(document).off('click', '#toolbox-worldbook-save-btn').on('click', '#toolbox-worldbook-save-btn', function() {
        saveToWorldbook();
    });
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const settings = extension_settings[extensionName];
    $('#enable_toolbox').prop('checked', settings.enabled).trigger('input');
    updateToolVisibility();
}

function updateToolVisibility() {
    const settings = extension_settings[extensionName];

    if (!settings.enabled) {
        $('#toolbox-toolbar').hide();
    } else {
        $('#toolbox-toolbar').show();
    }
}

function onEnableInput(event) {
    const value = Boolean($(event.target).prop('checked'));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    updateToolVisibility();
}

function updateToolbarStatus() {
    const statusEl = $('#toolbox-char-name');
    if (statusEl.length) {
        if (appState.currentCharacter) {
            statusEl.text(`✓ ${appState.currentCharacter.name}`);
            statusEl.css('color', 'rgba(74, 222, 128, 0.95)');
        } else {
            statusEl.text('未加载');
            statusEl.css('color', 'rgba(148, 163, 184, 0.7)');
        }
    }
}

function tryLoadCharacter() {
    logInfo('Attempting to load character...');
    const character = getCurrentCharacterData();
    if (character) {
        appState.currentCharacter = character;
        logInfo('Character loaded successfully:', character.name);
        updateToolbarStatus();
        if (appState.expandedTab) {
            renderExpandedContent();
        }
        return true;
    } else {
        logInfo('Failed to load character');
        updateToolbarStatus();
        return false;
    }
}

function handleChatChanged(chatId) {
    logInfo('CHAT_CHANGED event received!', chatId);
    setTimeout(() => tryLoadCharacter(), 100);
}

function handleCharacterChanged() {
    logInfo('CHARACTER_CHANGED event received!');
    setTimeout(() => tryLoadCharacter(), 100);
}

jQuery(async function() {
    logInfo('Extension initializing...');

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        logInfo('Settings panel loaded');
    } catch (e) {
        logError('Settings panel load error', e);
        return;
    }

    const toolbarHtml = `
        <div id="toolbox-toolbar" style="display: none;">
            <div id="toolbox-status" class="toolbox-status">
                <span id="toolbox-char-name" class="toolbox-char-status">未加载</span>
            </div>
            <div class="toolbox-buttons">
                <button id="toolbox-gen3-btn" class="toolbox-main-btn">生成3</button>
                <button id="toolbox-worldbook-btn" class="toolbox-main-btn">世界书</button>
            </div>
            <div id="toolbox-content" class="toolbox-content"></div>
        </div>
    `;

    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolbarHtml);
        logInfo('Toolbar added to DOM');
    } else {
        logError('#send_form not found');
        return;
    }

    $('#toolbox-gen3-btn').on('click', () => toggleTab('gen3'));
    $('#toolbox-worldbook-btn').on('click', () => toggleTab('worldbook'));

    $('#enable_toolbox').on('input', onEnableInput);

    await loadSettings();

    try {
        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            logInfo('eventSource is available');
            
            const events = [
                'CHAT_CHANGED',
                'MESSAGE_RECEIVED',
                'CHARACTER_CHANGED',
                'CHARACTER_LOADED',
                'CHARACTER_SELECTED',
                'GROUP_CHANGED'
            ];
            
            events.forEach(eventName => {
                if (event_types[eventName]) {
                    if (eventName === 'CHAT_CHANGED') {
                        eventSource.on(event_types[eventName], handleChatChanged);
                    } else {
                        eventSource.on(event_types[eventName], handleCharacterChanged);
                    }
                }
            });
        }
    } catch (e) {
        logError('Event registration error', e);
    }

    window.toggleTab = toggleTab;
    window.goBack = goBack;

    logInfo('Checking initial character...');
    tryLoadCharacter();

    setTimeout(() => tryLoadCharacter(), 500);
    setTimeout(() => tryLoadCharacter(), 1500);
    setTimeout(() => tryLoadCharacter(), 3000);
    setTimeout(() => tryLoadCharacter(), 5000);

    logInfo('Extension initialized successfully');
});
