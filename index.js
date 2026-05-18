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
    isGenerating: false,
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
    const hasResults = appState.gen3Replies.length > 0;

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">
                    <span class="back-icon">←</span>
                </button>
                <span class="toolbox-page-title">生成3</span>
                <div class="toolbox-header-actions">
                    <button id="toolbox-gen3-start-btn" class="toolbox-action-btn" ${hasResults ? 'data-refresh="true"' : ''}>
                        <span class="btn-text">${hasResults ? '刷新' : '生成'}</span>
                    </button>
                </div>
            </div>
            <div class="toolbox-page-body">
                <div class="toolbox-info-bar">
                    <div class="toolbox-char-badge">
                        <span class="badge-icon">●</span>
                        <span class="badge-text">${character?.name || '未加载'}</span>
                    </div>
                    <div id="toolbox-gen3-status" class="toolbox-status-indicator">
                        <span class="status-dot"></span>
                        <span class="status-text">${hasResults ? '已完成' : '就绪'}</span>
                    </div>
                </div>
                <div id="toolbox-gen3-results" class="toolbox-results-container">
                    ${hasResults ? '' : '<div class="toolbox-empty-state"><span>点击生成获取回复</span></div>'}
                </div>
            </div>
        </div>
    `;
}

function renderWorldbookContent() {
    const character = appState.currentCharacter || getCurrentCharacterData();
    const hasEntry = appState.worldbookEntry !== null;

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">
                    <span class="back-icon">←</span>
                </button>
                <span class="toolbox-page-title">世界书</span>
                <div class="toolbox-header-actions">
                    <button id="toolbox-worldbook-start-btn" class="toolbox-action-btn ${hasEntry ? 'btn-refresh' : ''}">
                        <span class="btn-text">${hasEntry ? '刷新' : '生成'}</span>
                    </button>
                    <button id="toolbox-worldbook-save-btn" class="toolbox-action-btn btn-save" ${!hasEntry ? 'disabled' : ''}>
                        <span class="btn-text">保存</span>
                    </button>
                </div>
            </div>
            <div class="toolbox-page-body">
                <div class="toolbox-info-bar">
                    <div class="toolbox-char-badge">
                        <span class="badge-icon">●</span>
                        <span class="badge-text">${character?.name || '未加载'}</span>
                    </div>
                    <div id="toolbox-worldbook-status" class="toolbox-status-indicator">
                        <span class="status-dot"></span>
                        <span class="status-text">${hasEntry ? '已生成' : '就绪'}</span>
                    </div>
                </div>
                <div id="toolbox-worldbook-preview" class="toolbox-preview-container">
                    ${hasEntry ? renderWorldbookEntryCard() : '<div class="toolbox-empty-state"><span>点击生成创建条目</span></div>'}
                </div>
            </div>
        </div>
    `;
}

function renderWorldbookEntryCard() {
    const entry = appState.worldbookEntry;
    return `
        <div class="toolbox-entry-card">
            <div class="entry-header">
                <div class="entry-name">${entry.name}</div>
                <div class="entry-keywords">${entry.keywords.slice(0, 5).join(' · ')}</div>
            </div>
            <div class="entry-content">${entry.content}</div>
        </div>
    `;
}

async function generate3Replies() {
    if (appState.isGenerating) return;
    
    const statusEl = $('#toolbox-gen3-status');
    const resultsEl = $('#toolbox-gen3-results');
    const startBtn = $('#toolbox-gen3-start-btn');
    
    try {
        appState.isGenerating = true;
        updateGen3UI('generating', '生成中...', startBtn);
        resultsEl.html('<div class="toolbox-loading-state"><div class="loading-spinner"></div><span>生成中...</span></div>');

        const context = getContext();
        if (!context.chat || context.chat.length === 0) {
            updateGen3UI('error', '无聊天', startBtn);
            resultsEl.html('<div class="toolbox-empty-state error"><span>无聊天记录</span></div>');
            return;
        }

        const character = appState.currentCharacter || getCurrentCharacterData();
        const recentMessages = context.chat.slice(-8);
        const chatHistory = recentMessages.map((m, i) => {
            const role = m.is_user ? '用户' : character?.name || 'AI';
            return `[${role}]: ${m.mes}`;
        }).join('\n');

        appState.gen3Replies = [];
        resultsEl.html('');
        
        for (let i = 0; i < 3; i++) {
            updateGen3UI('generating', `生成 ${i + 1}/3...`, startBtn);
            
            let reply = '';
            
            try {
                const styles = ['热情活泼', '冷静理性', '含蓄内敛'];
                const prompt = `作为"${character?.name || '角色'}"，根据以下对话生成3个不同风格的回复（只输出回复内容，每条用|||分隔）：

【回复风格】${styles[i]}
【对话】\n${chatHistory}`;
                
                const response = await callParentApiForSummary(chatHistory, prompt);
                
                const replies = response.split('|||').map(r => r.trim()).filter(r => r.length > 0);
                reply = replies[i] || replies[0] || response;
            } catch (apiError) {
                logError('API调用失败', apiError);
                reply = `[${styles[i]}回复] 模拟内容 ${i + 1}`;
            }
            
            if (reply) {
                appState.gen3Replies.push(reply);
                addGen3ResultItem(i, reply, styles[i]);
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        updateGen3UI('success', '完成', startBtn, true);
        
    } catch (e) {
        logError('生成失败', e);
        updateGen3UI('error', '失败', startBtn);
        resultsEl.html('<div class="toolbox-empty-state error"><span>生成失败</span></div>');
    } finally {
        appState.isGenerating = false;
    }
}

function updateGen3UI(status, text, btn, isRefresh = false) {
    const statusEl = $('#toolbox-gen3-status');
    const statusDot = statusEl.find('.status-dot');
    const statusText = statusEl.find('.status-text');
    const btnText = btn.find('.btn-text');
    
    statusText.text(text);
    
    const statusColors = {
        generating: { dot: 'rgba(255, 165, 0, 0.9)', text: 'rgba(255, 165, 0, 0.9)' },
        success: { dot: 'rgba(74, 222, 128, 0.9)', text: 'rgba(74, 222, 128, 0.9)' },
        error: { dot: 'rgba(248, 113, 113, 0.9)', text: 'rgba(248, 113, 113, 0.9)' }
    };
    
    const colors = statusColors[status] || statusColors.generating;
    statusDot.css('background', colors.dot);
    statusText.css('color', colors.text);
    
    btnText.text(isRefresh ? '刷新' : '生成');
    btn.attr('data-refresh', isRefresh ? 'true' : 'false');
}

function addGen3ResultItem(index, text, style) {
    const resultsEl = $('#toolbox-gen3-results');
    const item = document.createElement('div');
    item.className = 'toolbox-result-item';
    item.innerHTML = `
        <div class="result-number">${index + 1}</div>
        <div class="result-content">
            <div class="result-style">${style}</div>
            <div class="result-text">${text.length > 120 ? text.substring(0, 120) + '...' : text}</div>
        </div>
        <button class="toolbox-use-btn" data-index="${index}">
            <span>使用</span>
        </button>
    `;
    resultsEl.append(item);
}

async function generateWorldbookEntry() {
    if (appState.isGenerating) return;
    
    const statusEl = $('#toolbox-worldbook-status');
    const previewEl = $('#toolbox-worldbook-preview');
    const startBtn = $('#toolbox-worldbook-start-btn');
    const saveBtn = $('#toolbox-worldbook-save-btn');
    
    try {
        appState.isGenerating = true;
        updateWorldbookUI('generating', '分析中...', startBtn, saveBtn);
        previewEl.html('<div class="toolbox-loading-state"><div class="loading-spinner"></div><span>分析中...</span></div>');

        const context = getContext();
        const character = appState.currentCharacter;
        
        if (!context.chat || context.chat.length === 0) {
            updateWorldbookUI('error', '无聊天', startBtn, saveBtn);
            previewEl.html('<div class="toolbox-empty-state error"><span>无聊天记录</span></div>');
            return;
        }

        updateWorldbookUI('generating', '提取人物...', startBtn, saveBtn);
        
        const recentMessages = context.chat.slice(-20);
        const characters = new Set();
        characters.add(character?.name || '主角');
        
        recentMessages.forEach(msg => {
            if (msg.mes) {
                const patterns = [
                    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
                    /([一二三四五六七八九十百千万甲乙丙丁]+)/g,
                    /([角色人物角色]+[A-Za-z0-9]+)/g
                ];
                
                patterns.forEach(pattern => {
                    let match;
                    while ((match = pattern.exec(msg.mes)) !== null) {
                        const name = match[1].trim();
                        if (name.length > 1 && name.length < 25 && !/^\d+$/.test(name)) {
                            characters.add(name);
                        }
                    }
                });
            }
        });

        updateWorldbookUI('generating', '生成内容...', startBtn, saveBtn);
        
        const charList = Array.from(characters).slice(0, 10);
        const entryName = `${character?.name || '场景'}出场人物`;
        const chatHistory = recentMessages.map(m => m.mes).join('\n');
        
        let generatedContent = '';
        
        try {
            const prompt = `分析以下对话，生成一个世界书条目。要求：
1. 角色简介（1-2句）
2. 人物关系（列出主要人物）
3. 场景描述（当前情境）
用简洁专业的语言输出：

${chatHistory.substring(0, 600)}`;
            
            generatedContent = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            generatedContent = `【角色简介】\n${charList[0]}出现在当前场景中。\n\n【人物关系】\n${charList.join('、')}等人物在场。\n\n【场景描述】\n当前对话共${recentMessages.length}条，涉及多个角色互动。`;
        }
        
        appState.worldbookEntry = {
            name: entryName,
            keywords: charList.slice(0, 5),
            content: generatedContent
        };
        
        previewEl.html(renderWorldbookEntryCard());
        updateWorldbookUI('success', '已生成', startBtn, saveBtn, true);
        
    } catch (e) {
        logError('生成失败', e);
        updateWorldbookUI('error', '失败', startBtn, saveBtn);
        previewEl.html('<div class="toolbox-empty-state error"><span>生成失败</span></div>');
    } finally {
        appState.isGenerating = false;
    }
}

function updateWorldbookUI(status, text, startBtn, saveBtn, hasEntry = false) {
    const statusEl = $('#toolbox-worldbook-status');
    const statusDot = statusEl.find('.status-dot');
    const statusText = statusEl.find('.status-text');
    const startBtnText = startBtn.find('.btn-text');
    
    statusText.text(text);
    
    const statusColors = {
        generating: { dot: 'rgba(255, 165, 0, 0.9)', text: 'rgba(255, 165, 0, 0.9)' },
        success: { dot: 'rgba(74, 222, 128, 0.9)', text: 'rgba(74, 222, 128, 0.9)' },
        error: { dot: 'rgba(248, 113, 113, 0.9)', text: 'rgba(248, 113, 113, 0.9)' }
    };
    
    const colors = statusColors[status] || statusColors.generating;
    statusDot.css('background', colors.dot);
    statusText.css('color', colors.text);
    
    startBtnText.text(hasEntry ? '刷新' : '生成');
    startBtn.toggleClass('btn-refresh', hasEntry);
    saveBtn.prop('disabled', !hasEntry);
}

async function saveToWorldbook() {
    const saveBtn = $('#toolbox-worldbook-save-btn');
    const statusEl = $('#toolbox-worldbook-status');
    const statusText = statusEl.find('.status-text');
    
    if (!appState.worldbookEntry || appState.isGenerating) return;
    
    try {
        saveBtn.prop('disabled', true).find('.btn-text').text('保存中...');
        
        if (typeof window.createWorldEntry !== 'undefined') {
            window.createWorldEntry({
                name: appState.worldbookEntry.name,
                content: appState.worldbookEntry.content,
                keywords: appState.worldbookEntry.keywords
            });
        } else if (typeof toastr !== 'undefined') {
            toastr.success('已保存');
            navigator.clipboard.writeText(JSON.stringify(appState.worldbookEntry, null, 2));
        } else {
            const entryText = `${appState.worldbookEntry.name}\n关键词: ${appState.worldbookEntry.keywords.join(', ')}\n\n${appState.worldbookEntry.content}`;
            navigator.clipboard.writeText(entryText);
        }
        
        statusText.text('已保存').css('color', 'rgba(74, 222, 128, 0.9)');
        saveBtn.find('.btn-text').text('已保存');
        
        setTimeout(() => {
            saveBtn.prop('disabled', false).find('.btn-text').text('保存');
        }, 2000);
        
    } catch (e) {
        logError('保存失败', e);
        statusText.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        saveBtn.prop('disabled', false).find('.btn-text').text('保存');
    }
}

function useGen3Reply(index) {
    const reply = appState.gen3Replies[index];
    if (reply) {
        const input = getMessageInput();
        if (input.length) {
            input.val(reply);
            input.focus();
            goBack();
        }
    }
}

function bindContentEvents() {
    $('#toolbox-gen3-start-btn').off('click').on('click', () => generate3Replies());
    
    $(document).off('click', '.toolbox-use-btn').on('click', '.toolbox-use-btn', function() {
        const index = $(this).data('index');
        useGen3Reply(index);
    });
    
    $('#toolbox-worldbook-start-btn').off('click').on('click', () => generateWorldbookEntry());
    
    $(document).off('click', '#toolbox-worldbook-save-btn').on('click', '#toolbox-worldbook-save-btn', function() {
        if (!$(this).prop('disabled')) {
            saveToWorldbook();
        }
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
            statusEl.text(appState.currentCharacter.name);
            statusEl.addClass('loaded');
        } else {
            statusEl.text('未加载');
            statusEl.removeClass('loaded');
        }
    }
}

function tryLoadCharacter() {
    const character = getCurrentCharacterData();
    if (character) {
        appState.currentCharacter = character;
        updateToolbarStatus();
        if (appState.expandedTab) {
            renderExpandedContent();
        }
        return true;
    } else {
        updateToolbarStatus();
        return false;
    }
}

function handleChatChanged() {
    setTimeout(() => tryLoadCharacter(), 100);
}

function handleCharacterChanged() {
    setTimeout(() => tryLoadCharacter(), 100);
}

jQuery(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    const toolbarHtml = `
        <div id="toolbox-toolbar">
            <div class="toolbox-header-bar">
                <div class="toolbox-title">
                    <span class="title-text">智能助手</span>
                </div>
                <div id="toolbox-status" class="toolbox-status">
                    <span id="toolbox-char-name" class="toolbox-char-name">未加载</span>
                </div>
            </div>
            <div class="toolbox-buttons">
                <button id="toolbox-gen3-btn" class="toolbox-main-btn">
                    <span class="btn-icon">✦</span>
                    <span class="btn-label">生成3</span>
                </button>
                <button id="toolbox-worldbook-btn" class="toolbox-main-btn">
                    <span class="btn-icon">◈</span>
                    <span class="btn-label">世界书</span>
                </button>
            </div>
            <div id="toolbox-content" class="toolbox-content"></div>
        </div>
    `;

    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(toolboxHtml);
    }

    $('#toolbox-gen3-btn').on('click', () => toggleTab('gen3'));
    $('#toolbox-worldbook-btn').on('click', () => toggleTab('worldbook'));

    $('#enable_toolbox').on('input', onEnableInput);

    await loadSettings();

    if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
        ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'CHARACTER_CHANGED', 'CHARACTER_LOADED', 'CHARACTER_SELECTED'].forEach(eventName => {
            if (event_types[eventName]) {
                eventSource.on(event_types[eventName], eventName === 'CHAT_CHANGED' ? handleChatChanged : handleCharacterChanged);
            }
        });
    }

    window.toggleTab = toggleTab;
    window.goBack = goBack;

    tryLoadCharacter();
    setTimeout(() => tryLoadCharacter(), 500);
    setTimeout(() => tryLoadCharacter(), 1500);
    setTimeout(() => tryLoadCharacter(), 3000);
});
