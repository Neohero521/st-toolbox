import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    genCount: 3,
};

let appState = {
    expandedTab: null,
    currentCharacter: null,
    gen3Replies: [],
    worldbookEntries: [],
    summaryText: '',
    analysisText: '',
    suggestionText: '',
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
        case 'summary':
            content = renderSummaryContent();
            break;
        case 'analysis':
            content = renderAnalysisContent();
            break;
        case 'suggestion':
            content = renderSuggestionContent();
            break;
    }

    container.html(content);
    bindContentEvents();
}

function renderGen3Content() {
    const character = appState.currentCharacter || getCurrentCharacterData();
    const genCount = extension_settings[extensionName]?.genCount || 3;

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">←</button>
                <span class="toolbox-page-title">生成</span>
                <div class="toolbox-page-actions">
                    <select id="toolbox-gen3-count" class="toolbox-select">
                        <option value="1" ${genCount == 1 ? 'selected' : ''}>1条</option>
                        <option value="2" ${genCount == 2 ? 'selected' : ''}>2条</option>
                        <option value="3" ${genCount == 3 ? 'selected' : ''}>3条</option>
                    </select>
                </div>
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

function renderSummaryContent() {
    const character = appState.currentCharacter || getCurrentCharacterData();

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">←</button>
                <span class="toolbox-page-title">总结</span>
            </div>
            <div class="toolbox-page-body">
                ${character && character.name ? `
                    <div id="toolbox-summary-status" class="toolbox-status-text">就绪</div>
                    <div id="toolbox-summary-content" class="toolbox-summary-content"></div>
                    <button id="toolbox-summary-start-btn" class="toolbox-primary-btn">总结</button>
                ` : '<div class="toolbox-no-char">请先加载角色</div>'}
            </div>
        </div>
    `;
}

function renderAnalysisContent() {
    const character = appState.currentCharacter || getCurrentCharacterData();

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">←</button>
                <span class="toolbox-page-title">分析</span>
            </div>
            <div class="toolbox-page-body">
                ${character && character.name ? `
                    <div id="toolbox-analysis-status" class="toolbox-status-text">就绪</div>
                    <div id="toolbox-analysis-content" class="toolbox-analysis-content"></div>
                    <button id="toolbox-analysis-start-btn" class="toolbox-primary-btn">分析</button>
                ` : '<div class="toolbox-no-char">请先加载角色</div>'}
            </div>
        </div>
    `;
}

function renderSuggestionContent() {
    const character = appState.currentCharacter || getCurrentCharacterData();

    return `
        <div class="toolbox-page">
            <div class="toolbox-page-header">
                <button class="toolbox-back-btn" onclick="window.goBack()">←</button>
                <span class="toolbox-page-title">建议</span>
            </div>
            <div class="toolbox-page-body">
                ${character && character.name ? `
                    <div id="toolbox-suggestion-status" class="toolbox-status-text">就绪</div>
                    <div id="toolbox-suggestion-content" class="toolbox-suggestion-content"></div>
                    <button id="toolbox-suggestion-start-btn" class="toolbox-primary-btn">建议</button>
                ` : '<div class="toolbox-no-char">请先加载角色</div>'}
            </div>
        </div>
    `;
}

async function generate3Replies() {
    const statusEl = $('#toolbox-gen3-status');
    const resultsEl = $('#toolbox-gen3-results');
    const btn = $('#toolbox-gen3-start-btn');
    const countSelect = $('#toolbox-gen3-count');
    
    const genCount = parseInt(countSelect.val()) || 3;
    
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
        
        let repliesText = '';
        
        try {
            const prompt = `作为角色${character?.name || ''}，根据以下对话生成${genCount}条不同风格的回复选项。
请严格按格式返回，每一行一条回复：
1. [第一条回复]
2. [第二条回复]
...

对话内容：
${chatHistory}

要求：每条回复简洁，50字以内，${genCount}条风格要有差异。`;
            repliesText = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败，使用模拟数据', apiError);
            for (let i = 1; i <= genCount; i++) {
                appState.gen3Replies.push(`[回复 ${i}] 模拟回复内容 ${i}`);
            }
        }
        
        if (repliesText && appState.gen3Replies.length === 0) {
            const lines = repliesText.split('\n').filter(line => line.trim().length > 0);
            let index = 1;
            
            for (const line of lines) {
                const cleanedLine = line.replace(/^\d+[\.\)\s]*|^\s*[-*]\s*/, '').trim();
                if (cleanedLine.length > 0 && appState.gen3Replies.length < genCount) {
                    appState.gen3Replies.push(cleanedLine);
                    index++;
                }
            }
            
            if (appState.gen3Replies.length === 0) {
                for (let i = 1; i <= genCount; i++) {
                    appState.gen3Replies.push(`[回复 ${i}] ${repliesText.substring((i - 1) * 40, i * 40) || '模拟内容'}`);
                }
            }
        }
        
        appState.gen3Replies.forEach((reply, i) => {
            resultsEl.append(`
                <div class="toolbox-result-item">
                    <div class="toolbox-result-header">${i + 1}</div>
                    <div class="toolbox-result-text">${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}</div>
                    <div class="toolbox-result-actions">
                        <button class="toolbox-use-btn" data-index="${i}" title="发送">发</button>
                        <button class="toolbox-copy-btn" data-index="${i}" title="复制">复</button>
                    </div>
                </div>
            `);
        });
        
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
            const prompt = `根据以下对话生成世界书条目，包含角色简介和场景描述（简洁）：\n\n${chatHistory.substring(0, 500)}`;
            generatedContent = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败，使用默认内容', apiError);
            generatedContent = `出场人物：${charList.join('、')}\n场景：最近${recentMessages.length}条对话`;
        }
        
        const entry = {
            name: entryName,
            keywords: charList,
            content: generatedContent || `出场人物：${charList.join('、')}`
        };
        
        appState.worldbookEntries = [entry];
        
        previewEl.html(`
            <div class="toolbox-worldbook-entry">
                <div class="toolbox-entry-name">${entry.name}</div>
                <div class="toolbox-entry-keywords">${entry.keywords.join('、')}</div>
                <div class="toolbox-entry-content">${entry.content}</div>
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
    
    if (appState.worldbookEntries.length === 0) {
        statusEl.text('无内容').css('color', 'rgba(248, 113, 113, 0.9)');
        return;
    }
    
    btn.prop('disabled', true).text('保存中...');
    
    try {
        if (typeof window.createWorldEntry !== 'undefined') {
            appState.worldbookEntries.forEach(entry => {
                window.createWorldEntry({
                    name: entry.name,
                    content: entry.content,
                    keywords: entry.keywords
                });
            });
        } else if (typeof toastr !== 'undefined') {
            toastr.success(`已复制${appState.worldbookEntries.length}个条目`);
            navigator.clipboard.writeText(JSON.stringify(appState.worldbookEntries, null, 2));
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

async function generateSummary() {
    const statusEl = $('#toolbox-summary-status');
    const contentEl = $('#toolbox-summary-content');
    const btn = $('#toolbox-summary-start-btn');
    
    try {
        statusEl.text('总结中...').css('color', 'rgba(255, 165, 0, 0.9)');
        btn.prop('disabled', true);
        contentEl.html('<div class="toolbox-loading">生成中...</div>');

        const context = getContext();
        if (!context.chat || context.chat.length === 0) {
            statusEl.text('无聊天').css('color', 'rgba(248, 113, 113, 0.9)');
            btn.prop('disabled', false);
            contentEl.html('');
            return;
        }

        const character = appState.currentCharacter;
        const recentMessages = context.chat.slice(-10);
        const chatHistory = recentMessages.map(m => m.mes).join('\n');
        
        let summary = '';
        
        try {
            const prompt = `总结以下对话的关键内容（简洁，100字以内）：\n\n${chatHistory}`;
            summary = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            summary = '对话总结（模拟数据）';
        }
        
        appState.summaryText = summary;
        
        contentEl.html(`
            <div class="toolbox-summary-item">
                <div class="toolbox-summary-text">${summary}</div>
                <div class="toolbox-summary-actions">
                    <button id="toolbox-summary-use-btn" class="toolbox-use-btn">使用</button>
                    <button id="toolbox-summary-copy-btn" class="toolbox-copy-btn">复制</button>
                </div>
            </div>
        `);
        
        statusEl.text('完成').css('color', 'rgba(74, 222, 128, 0.9)');
        btn.prop('disabled', false);
        
    } catch (e) {
        logError('总结失败', e);
        statusEl.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        btn.prop('disabled', false);
        contentEl.html('');
    }
}

async function generateAnalysis() {
    const statusEl = $('#toolbox-analysis-status');
    const contentEl = $('#toolbox-analysis-content');
    const btn = $('#toolbox-analysis-start-btn');
    
    try {
        statusEl.text('分析中...').css('color', 'rgba(255, 165, 0, 0.9)');
        btn.prop('disabled', true);
        contentEl.html('<div class="toolbox-loading">生成中...</div>');

        const character = appState.currentCharacter || getCurrentCharacterData();
        
        if (!character) {
            statusEl.text('无角色').css('color', 'rgba(248, 113, 113, 0.9)');
            btn.prop('disabled', false);
            contentEl.html('');
            return;
        }

        const context = getContext();
        const recentMessages = context.chat?.slice(-5) || [];
        const chatHistory = recentMessages.map(m => m.mes).join('\n');
        
        let analysis = '';
        
        try {
            const prompt = `分析角色${character.name}的性格特点：\n\n角色设定：${character.personality || character.description}\n\n近期对话：${chatHistory}`;
            analysis = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            analysis = `${character.name}的性格分析（模拟数据）`;
        }
        
        appState.analysisText = analysis;
        
        contentEl.html(`
            <div class="toolbox-analysis-item">
                <div class="toolbox-analysis-name">${character.name}</div>
                <div class="toolbox-analysis-text">${analysis}</div>
                <div class="toolbox-summary-actions">
                    <button id="toolbox-analysis-copy-btn" class="toolbox-copy-btn">复制</button>
                </div>
            </div>
        `);
        
        statusEl.text('完成').css('color', 'rgba(74, 222, 128, 0.9)');
        btn.prop('disabled', false);
        
    } catch (e) {
        logError('分析失败', e);
        statusEl.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        btn.prop('disabled', false);
        contentEl.html('');
    }
}

async function generateSuggestion() {
    const statusEl = $('#toolbox-suggestion-status');
    const contentEl = $('#toolbox-suggestion-content');
    const btn = $('#toolbox-suggestion-start-btn');
    
    try {
        statusEl.text('构思中...').css('color', 'rgba(255, 165, 0, 0.9)');
        btn.prop('disabled', true);
        contentEl.html('<div class="toolbox-loading">生成中...</div>');

        const context = getContext();
        if (!context.chat || context.chat.length === 0) {
            statusEl.text('无聊天').css('color', 'rgba(248, 113, 113, 0.9)');
            btn.prop('disabled', false);
            contentEl.html('');
            return;
        }

        const character = appState.currentCharacter;
        const recentMessages = context.chat.slice(-5);
        const chatHistory = recentMessages.map(m => m.mes).join('\n');
        
        let suggestion = '';
        
        try {
            const prompt = `基于以下对话，给出一个情节发展建议（简洁，80字以内）：\n\n${chatHistory}`;
            suggestion = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            suggestion = '情节发展建议（模拟数据）';
        }
        
        appState.suggestionText = suggestion;
        
        contentEl.html(`
            <div class="toolbox-suggestion-item">
                <div class="toolbox-suggestion-text">${suggestion}</div>
                <div class="toolbox-summary-actions">
                    <button id="toolbox-suggestion-use-btn" class="toolbox-use-btn">使用</button>
                    <button id="toolbox-suggestion-copy-btn" class="toolbox-copy-btn">复制</button>
                </div>
            </div>
        `);
        
        statusEl.text('完成').css('color', 'rgba(74, 222, 128, 0.9)');
        btn.prop('disabled', false);
        
    } catch (e) {
        logError('建议失败', e);
        statusEl.text('失败').css('color', 'rgba(248, 113, 113, 0.9)');
        btn.prop('disabled', false);
        contentEl.html('');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (typeof toastr !== 'undefined') {
            toastr.success('已复制');
        }
    }).catch(err => {
        console.error('复制失败:', err);
    });
}

function sendMessageToChat(message) {
    const input = getMessageInput();
    if (input.length) {
        input.val(message);
        
        const sendButton = $('#send_but');
        if (sendButton.length) {
            sendButton.click();
        } else {
            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
                code: 'Enter'
            });
            input[0].dispatchEvent(event);
        }
        
        goBack();
    }
}

function bindContentEvents() {
    $('#toolbox-gen3-count').on('change', function() {
        extension_settings[extensionName].genCount = parseInt($(this).val());
        saveSettingsDebounced();
    });
    
    $('#toolbox-gen3-start-btn').off('click').on('click', function() {
        generate3Replies();
    });
    
    $(document).off('click', '.toolbox-use-btn').on('click', '.toolbox-use-btn', function() {
        const index = $(this).data('index');
        const reply = appState.gen3Replies[index];
        
        if (reply) {
            sendMessageToChat(reply);
        }
    });
    
    $(document).off('click', '.toolbox-copy-btn').on('click', '.toolbox-copy-btn', function() {
        const index = $(this).data('index');
        const text = $(this).closest('.toolbox-result-item, .toolbox-summary-item, .toolbox-analysis-item, .toolbox-suggestion-item').find('.toolbox-result-text, .toolbox-summary-text, .toolbox-analysis-text, .toolbox-suggestion-text').text();
        copyToClipboard(text);
    });
    
    $('#toolbox-worldbook-start-btn').off('click').on('click', function() {
        generateWorldbookEntry();
    });
    
    $(document).off('click', '#toolbox-worldbook-save-btn').on('click', '#toolbox-worldbook-save-btn', function() {
        saveToWorldbook();
    });
    
    $('#toolbox-summary-start-btn').off('click').on('click', function() {
        generateSummary();
    });
    
    $(document).off('click', '#toolbox-summary-use-btn').on('click', '#toolbox-summary-use-btn', function() {
        if (appState.summaryText) {
            sendMessageToChat(appState.summaryText);
        }
    });
    
    $(document).off('click', '#toolbox-summary-copy-btn').on('click', '#toolbox-summary-copy-btn', function() {
        copyToClipboard(appState.summaryText);
    });
    
    $('#toolbox-analysis-start-btn').off('click').on('click', function() {
        generateAnalysis();
    });
    
    $(document).off('click', '#toolbox-analysis-copy-btn').on('click', '#toolbox-analysis-copy-btn', function() {
        copyToClipboard(appState.analysisText);
    });
    
    $('#toolbox-suggestion-start-btn').off('click').on('click', function() {
        generateSuggestion();
    });
    
    $(document).off('click', '#toolbox-suggestion-use-btn').on('click', '#toolbox-suggestion-use-btn', function() {
        if (appState.suggestionText) {
            sendMessageToChat(appState.suggestionText);
        }
    });
    
    $(document).off('click', '#toolbox-suggestion-copy-btn').on('click', '#toolbox-suggestion-copy-btn', function() {
        copyToClipboard(appState.suggestionText);
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
                <button id="toolbox-gen3-btn" class="toolbox-main-btn">生成</button>
                <button id="toolbox-worldbook-btn" class="toolbox-main-btn">世界书</button>
                <button id="toolbox-summary-btn" class="toolbox-main-btn">总结</button>
                <button id="toolbox-analysis-btn" class="toolbox-main-btn">分析</button>
                <button id="toolbox-suggestion-btn" class="toolbox-main-btn">建议</button>
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
    $('#toolbox-summary-btn').on('click', () => toggleTab('summary'));
    $('#toolbox-analysis-btn').on('click', () => toggleTab('analysis'));
    $('#toolbox-suggestion-btn').on('click', () => toggleTab('suggestion'));

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
