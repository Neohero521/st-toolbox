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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createSVG() {
    const SVG = `
        <div id="toolbox-svg-container" style="width: 100%; height: 133px; position: relative; margin-bottom: 0;">
            <svg id="toolbox-svg" width="100%" height="100%" viewBox="0 0 800 133" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#2D1B44" stop-opacity="0.95"/>
                        <stop offset="50%" stop-color="#441B44" stop-opacity="0.95"/>
                        <stop offset="100%" stop-color="#5A2864" stop-opacity="0.95"/>
                    </linearGradient>
                    <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#A855F7"/>
                        <stop offset="100%" stop-color="#B482C8"/>
                    </linearGradient>
                    <linearGradient id="btnGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#581C87"/>
                        <stop offset="100%" stop-color="#7E22CE"/>
                    </linearGradient>
                    <linearGradient id="btnHoverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#7E22CE"/>
                        <stop offset="100%" stop-color="#A855F7"/>
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                    <filter id="shadow">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.3"/>
                    </filter>
                </defs>
                
                <rect x="0" y="0" width="800" height="133" fill="url(#bgGradient)" rx="8"/>
                <rect x="1" y="1" width="798" height="131" fill="none" stroke="url(#borderGradient)" stroke-width="2" rx="7" opacity="0.6"/>
                
                <g id="main-view">
                    <rect x="0" y="0" width="800" height="24" fill="rgba(0,0,0,0.3)"/>
                    <line x1="0" y1="24" x2="800" y2="24" stroke="rgba(180,130,200,0.3)" stroke-width="1"/>
                    
                    <text x="12" y="17" fill="rgba(148,163,184,0.8)" font-family="system-ui, sans-serif" font-size="11" font-weight="500" id="char-status">未加载</text>
                    
                    <g id="btn-gen3" class="svg-btn" transform="translate(12, 32)" style="cursor: pointer;">
                        <rect x="0" y="0" width="70" height="28" rx="4" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                        <text x="35" y="18" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="12" font-weight="600">生成</text>
                    </g>
                    <g id="btn-worldbook" class="svg-btn" transform="translate(90, 32)" style="cursor: pointer;">
                        <rect x="0" y="0" width="70" height="28" rx="4" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                        <text x="35" y="18" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="12" font-weight="600">世界书</text>
                    </g>
                    <g id="btn-summary" class="svg-btn" transform="translate(168, 32)" style="cursor: pointer;">
                        <rect x="0" y="0" width="70" height="28" rx="4" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                        <text x="35" y="18" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="12" font-weight="600">总结</text>
                    </g>
                    <g id="btn-analysis" class="svg-btn" transform="translate(246, 32)" style="cursor: pointer;">
                        <rect x="0" y="0" width="70" height="28" rx="4" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                        <text x="35" y="18" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="12" font-weight="600">分析</text>
                    </g>
                    <g id="btn-suggestion" class="svg-btn" transform="translate(324, 32)" style="cursor: pointer;">
                        <rect x="0" y="0" width="70" height="28" rx="4" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                        <text x="35" y="18" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="12" font-weight="600">建议</text>
                    </g>
                </g>
                
                <g id="detail-view" style="display: none;">
                    <rect x="0" y="0" width="800" height="24" fill="rgba(0,0,0,0.3)"/>
                    <line x1="0" y1="24" x2="800" y2="24" stroke="rgba(180,130,200,0.3)" stroke-width="1"/>
                    
                    <g id="btn-back" class="svg-btn" transform="translate(6, 2)" style="cursor: pointer;">
                        <rect x="0" y="0" width="40" height="20" rx="3" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                        <text x="20" y="14" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="11" font-weight="600">←</text>
                    </g>
                    <text x="52" y="17" fill="rgba(255,255,255,0.9)" font-family="system-ui, sans-serif" font-size="12" font-weight="600" id="detail-title">功能</text>
                    
                    <g id="detail-content-area">
                        <text x="12" y="48" fill="rgba(148,163,184,0.8)" font-family="system-ui, sans-serif" font-size="10" id="detail-status">就绪</text>
                    </g>
                </g>
            </svg>
            <div id="toolbox-html-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></div>
        </div>
    `;
    return SVG;
}

function renderDetailView(tab) {
    const svg = document.getElementById('toolbox-svg');
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const overlay = document.getElementById('toolbox-html-overlay');
    
    mainView.style.display = 'none';
    detailView.style.display = 'block';
    
    const titles = {
        'gen3': '生成',
        'worldbook': '世界书',
        'summary': '总结',
        'analysis': '分析',
        'suggestion': '建议'
    };
    document.getElementById('detail-title').textContent = titles[tab] || '功能';
    
    let overlayHTML = '';
    
    switch(tab) {
        case 'gen3':
            overlayHTML = `
                <div style="position: absolute; top: 28px; left: 0; right: 0; bottom: 0; padding: 8px; overflow-y: auto; pointer-events: auto;">
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                        <select id="gen-count-select" style="background: rgba(88,28,135,0.8); color: white; border: 1px solid rgba(180,130,200,0.5); border-radius: 4px; padding: 3px 6px; font-size: 10px;">
                            <option value="1">1条</option>
                            <option value="2">2条</option>
                            <option value="3" selected>3条</option>
                        </select>
                        <button id="gen-start-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.9), rgba(126,34,206,0.9)); color: white; border: 1px solid rgba(180,130,200,0.6); border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer;">生成</button>
                    </div>
                    <div id="gen-results" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                </div>
            `;
            break;
        case 'worldbook':
            overlayHTML = `
                <div style="position: absolute; top: 28px; left: 0; right: 0; bottom: 0; padding: 8px; overflow-y: auto; pointer-events: auto;">
                    <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                        <button id="wb-start-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.9), rgba(126,34,206,0.9)); color: white; border: 1px solid rgba(180,130,200,0.6); border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; flex: 1;">生成</button>
                        <button id="wb-save-btn" style="background: rgba(68,27,68,0.6); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; flex: 1; opacity: 0.5;" disabled>保存</button>
                    </div>
                    <div id="wb-preview" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                </div>
            `;
            break;
        case 'summary':
            overlayHTML = `
                <div style="position: absolute; top: 28px; left: 0; right: 0; bottom: 0; padding: 8px; overflow-y: auto; pointer-events: auto;">
                    <button id="sum-start-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.9), rgba(126,34,206,0.9)); color: white; border: 1px solid rgba(180,130,200,0.6); border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; margin-bottom: 6px;">总结</button>
                    <div id="sum-content" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                </div>
            `;
            break;
        case 'analysis':
            overlayHTML = `
                <div style="position: absolute; top: 28px; left: 0; right: 0; bottom: 0; padding: 8px; overflow-y: auto; pointer-events: auto;">
                    <button id="ana-start-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.9), rgba(126,34,206,0.9)); color: white; border: 1px solid rgba(180,130,200,0.6); border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; margin-bottom: 6px;">分析</button>
                    <div id="ana-content" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                </div>
            `;
            break;
        case 'suggestion':
            overlayHTML = `
                <div style="position: absolute; top: 28px; left: 0; right: 0; bottom: 0; padding: 8px; overflow-y: auto; pointer-events: auto;">
                    <button id="sug-start-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.9), rgba(126,34,206,0.9)); color: white; border: 1px solid rgba(180,130,200,0.6); border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; margin-bottom: 6px;">建议</button>
                    <div id="sug-content" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                </div>
            `;
            break;
    }
    
    overlay.innerHTML = overlayHTML;
    bindOverlayEvents(tab);
}

function renderMainView() {
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const overlay = document.getElementById('toolbox-html-overlay');
    
    mainView.style.display = 'block';
    detailView.style.display = 'none';
    overlay.innerHTML = '';
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
        renderMainView();
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

async function generate3Replies() {
    const countSelect = document.getElementById('gen-count-select');
    const startBtn = document.getElementById('gen-start-btn');
    const resultsEl = document.getElementById('gen-results');
    const genCount = parseInt(countSelect.value) || 3;
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    
    try {
        const context = getContext();
        if (!context.chat) {
            resultsEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">无聊天</div>';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            return;
        }
        
        const character = appState.currentCharacter || getCurrentCharacterData();
        const recentMessages = context.chat.slice(-5);
        const chatHistory = recentMessages.map(m => m.mes).join('\\n');
        
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
            const lines = repliesText.split('\\n').filter(line => line.trim().length > 0);
            for (const line of lines) {
                const cleanedLine = line.replace(/^\\d+[\\.\\)\\s]*|^\\s*[-*]\\s*/, '').trim();
                if (cleanedLine.length > 0 && appState.gen3Replies.length < genCount) {
                    appState.gen3Replies.push(cleanedLine);
                }
            }
            if (appState.gen3Replies.length === 0) {
                for (let i = 1; i <= genCount; i++) {
                    appState.gen3Replies.push(`[回复 ${i}] ${repliesText.substring((i - 1) * 40, i * 40) || '模拟内容'}`);
                }
            }
        }
        
        let html = '';
        appState.gen3Replies.forEach((reply, i) => {
            html += `
                <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(180,130,200,0.2); border-radius: 4px; padding: 5px; margin-bottom: 5px; display: flex; gap: 6px; align-items: flex-start;">
                    <div style="font-size: 9px; font-weight: 700; color: rgba(168,85,247,0.9); min-width: 18px;">${i + 1}</div>
                    <div style="flex: 1; font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.3;">${escapeHtml(reply.substring(0, 80))}${reply.length > 80 ? '...' : ''}</div>
                    <div style="display: flex; gap: 3px;">
                        <button class="use-reply-btn" data-index="${i}" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 2px 6px; font-size: 9px; cursor: pointer;">发</button>
                        <button class="copy-reply-btn" data-index="${i}" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 2px 6px; font-size: 9px; cursor: pointer;">复</button>
                    </div>
                </div>
            `;
        });
        resultsEl.innerHTML = html;
        
        document.querySelectorAll('.use-reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                sendMessageToChat(appState.gen3Replies[index]);
            });
        });
        document.querySelectorAll('.copy-reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                copyToClipboard(appState.gen3Replies[index]);
            });
        });
        
    } catch (e) {
        logError('生成失败', e);
        resultsEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">失败</div>';
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
}

async function generateWorldbookEntry() {
    const startBtn = document.getElementById('wb-start-btn');
    const saveBtn = document.getElementById('wb-save-btn');
    const previewEl = document.getElementById('wb-preview');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    
    try {
        const context = getContext();
        const character = appState.currentCharacter;
        
        if (!context.chat || context.chat.length === 0) {
            previewEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">无聊天</div>';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            return;
        }
        
        const recentMessages = context.chat.slice(-20);
        const characters = new Set([character?.name || '主角']);
        
        recentMessages.forEach(msg => {
            if (msg.mes) {
                const matches = msg.mes.match(/([A-Z][a-zA-Z]+|[一二三四五六七八九十百千万]+[号位人个等])/g);
                if (matches) {
                    matches.forEach(m => {
                        if (m.length > 1 && m.length < 20) characters.add(m);
                    });
                }
            }
        });
        
        const charList = Array.from(characters).slice(0, 8);
        const entryName = `${character?.name || '角色'}的出场人物`;
        const chatHistory = recentMessages.map(m => m.mes).join('\\n');
        
        let generatedContent = '';
        
        try {
            const prompt = `根据以下对话生成世界书条目，包含角色简介和场景描述（简洁）：\\n\\n${chatHistory.substring(0, 500)}`;
            generatedContent = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败，使用默认内容', apiError);
            generatedContent = `出场人物：${charList.join('、')}\\n场景：最近${recentMessages.length}条对话`;
        }
        
        appState.worldbookEntries = [{
            name: entryName,
            keywords: charList,
            content: generatedContent
        }];
        
        previewEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(180,130,200,0.2); border-radius: 4px; padding: 6px;">
                <div style="font-size: 11px; font-weight: 600; color: rgba(168,85,247,0.95); margin-bottom: 4px;">${escapeHtml(entryName)}</div>
                <div style="font-size: 9px; color: rgba(200,150,255,0.8); margin-bottom: 4px;">${escapeHtml(charList.join('、'))}</div>
                <div style="font-size: 10px; color: rgba(255,255,255,0.8); line-height: 1.3;">${escapeHtml(generatedContent)}</div>
            </div>
        `;
        
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        
    } catch (e) {
        logError('生成失败', e);
        previewEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">失败</div>';
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
}

async function saveToWorldbook() {
    if (appState.worldbookEntries.length === 0) return;
    
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
    } catch (e) {
        logError('保存失败', e);
    }
}

async function generateSummary() {
    const startBtn = document.getElementById('sum-start-btn');
    const contentEl = document.getElementById('sum-content');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    
    try {
        const context = getContext();
        if (!context.chat || context.chat.length === 0) {
            contentEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">无聊天</div>';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            return;
        }
        
        const recentMessages = context.chat.slice(-10);
        const chatHistory = recentMessages.map(m => m.mes).join('\\n');
        let summary = '';
        
        try {
            const prompt = `总结以下对话的关键内容（简洁，100字以内）：\\n\\n${chatHistory}`;
            summary = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            summary = '对话总结（模拟数据）';
        }
        
        appState.summaryText = summary;
        contentEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(180,130,200,0.2); border-radius: 4px; padding: 6px;">
                <div style="font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.4; margin-bottom: 6px;">${escapeHtml(summary)}</div>
                <div style="display: flex; gap: 6px;">
                    <button id="sum-use-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 3px 8px; font-size: 9px; cursor: pointer; flex: 1;">发</button>
                    <button id="sum-copy-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 3px 8px; font-size: 9px; cursor: pointer; flex: 1;">复</button>
                </div>
            </div>
        `;
        
        document.getElementById('sum-use-btn').addEventListener('click', () => sendMessageToChat(appState.summaryText));
        document.getElementById('sum-copy-btn').addEventListener('click', () => copyToClipboard(appState.summaryText));
        
    } catch (e) {
        logError('总结失败', e);
        contentEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">失败</div>';
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
}

async function generateAnalysis() {
    const startBtn = document.getElementById('ana-start-btn');
    const contentEl = document.getElementById('ana-content');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    
    try {
        const character = appState.currentCharacter || getCurrentCharacterData();
        
        if (!character) {
            contentEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">无角色</div>';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            return;
        }
        
        const context = getContext();
        const recentMessages = context.chat?.slice(-5) || [];
        const chatHistory = recentMessages.map(m => m.mes).join('\\n');
        let analysis = '';
        
        try {
            const prompt = `分析角色${character.name}的性格特点：\\n\\n角色设定：${character.personality || character.description}\\n\\n近期对话：${chatHistory}`;
            analysis = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            analysis = `${character.name}的性格分析（模拟数据）`;
        }
        
        appState.analysisText = analysis;
        contentEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(180,130,200,0.2); border-radius: 4px; padding: 6px;">
                <div style="font-size: 11px; font-weight: 600; color: rgba(168,85,247,0.95); margin-bottom: 4px;">${escapeHtml(character.name)}</div>
                <div style="font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.4; margin-bottom: 6px;">${escapeHtml(analysis)}</div>
                <div style="display: flex;">
                    <button id="ana-copy-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 3px 8px; font-size: 9px; cursor: pointer; width: 100%;">复</button>
                </div>
            </div>
        `;
        
        document.getElementById('ana-copy-btn').addEventListener('click', () => copyToClipboard(appState.analysisText));
        
    } catch (e) {
        logError('分析失败', e);
        contentEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">失败</div>';
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
}

async function generateSuggestion() {
    const startBtn = document.getElementById('sug-start-btn');
    const contentEl = document.getElementById('sug-content');
    
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    
    try {
        const context = getContext();
        if (!context.chat || context.chat.length === 0) {
            contentEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">无聊天</div>';
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            return;
        }
        
        const recentMessages = context.chat.slice(-5);
        const chatHistory = recentMessages.map(m => m.mes).join('\\n');
        let suggestion = '';
        
        try {
            const prompt = `基于以下对话，给出一个情节发展建议（简洁，80字以内）：\\n\\n${chatHistory}`;
            suggestion = await callParentApiForSummary(chatHistory, prompt);
        } catch (apiError) {
            logError('API调用失败', apiError);
            suggestion = '情节发展建议（模拟数据）';
        }
        
        appState.suggestionText = suggestion;
        contentEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(180,130,200,0.2); border-radius: 4px; padding: 6px;">
                <div style="font-size: 10px; color: rgba(255,255,255,0.85); line-height: 1.4; margin-bottom: 6px;">${escapeHtml(suggestion)}</div>
                <div style="display: flex; gap: 6px;">
                    <button id="sug-use-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 3px 8px; font-size: 9px; cursor: pointer; flex: 1;">发</button>
                    <button id="sug-copy-btn" style="background: linear-gradient(135deg, rgba(88,28,135,0.8), rgba(126,34,206,0.8)); color: white; border: 1px solid rgba(180,130,200,0.4); border-radius: 3px; padding: 3px 8px; font-size: 9px; cursor: pointer; flex: 1;">复</button>
                </div>
            </div>
        `;
        
        document.getElementById('sug-use-btn').addEventListener('click', () => sendMessageToChat(appState.suggestionText));
        document.getElementById('sug-copy-btn').addEventListener('click', () => copyToClipboard(appState.suggestionText));
        
    } catch (e) {
        logError('建议失败', e);
        contentEl.innerHTML = '<div style="font-size: 11px; color: rgba(248,113,113,0.9);">失败</div>';
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
}

function bindOverlayEvents(tab) {
    switch(tab) {
        case 'gen3':
            document.getElementById('gen-start-btn').addEventListener('click', generate3Replies);
            document.getElementById('gen-count-select').value = extension_settings[extensionName].genCount || 3;
            document.getElementById('gen-count-select').addEventListener('change', (e) => {
                extension_settings[extensionName].genCount = parseInt(e.target.value);
                saveSettingsDebounced();
            });
            break;
        case 'worldbook':
            document.getElementById('wb-start-btn').addEventListener('click', generateWorldbookEntry);
            document.getElementById('wb-save-btn').addEventListener('click', saveToWorldbook);
            break;
        case 'summary':
            document.getElementById('sum-start-btn').addEventListener('click', generateSummary);
            break;
        case 'analysis':
            document.getElementById('ana-start-btn').addEventListener('click', generateAnalysis);
            break;
        case 'suggestion':
            document.getElementById('sug-start-btn').addEventListener('click', generateSuggestion);
            break;
    }
}

function bindSVGEvents() {
    document.getElementById('btn-gen3').addEventListener('click', () => {
        appState.expandedTab = 'gen3';
        renderDetailView('gen3');
    });
    document.getElementById('btn-worldbook').addEventListener('click', () => {
        appState.expandedTab = 'worldbook';
        renderDetailView('worldbook');
    });
    document.getElementById('btn-summary').addEventListener('click', () => {
        appState.expandedTab = 'summary';
        renderDetailView('summary');
    });
    document.getElementById('btn-analysis').addEventListener('click', () => {
        appState.expandedTab = 'analysis';
        renderDetailView('analysis');
    });
    document.getElementById('btn-suggestion').addEventListener('click', () => {
        appState.expandedTab = 'suggestion';
        renderDetailView('suggestion');
    });
    document.getElementById('btn-back').addEventListener('click', () => {
        appState.expandedTab = null;
        renderMainView();
    });
}

function updateToolbarStatus() {
    const statusText = document.getElementById('char-status');
    if (statusText) {
        if (appState.currentCharacter) {
            statusText.textContent = `✓ ${appState.currentCharacter.name}`;
            statusText.setAttribute('fill', 'rgba(74,222,128,0.95)');
        } else {
            statusText.textContent = '未加载';
            statusText.setAttribute('fill', 'rgba(148,163,184,0.7)');
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
        return true;
    } else {
        logInfo('Failed to load character');
        updateToolbarStatus();
        return false;
    }
}

function handleChatChanged() {
    logInfo('Chat changed');
    setTimeout(() => tryLoadCharacter(), 100);
}

function handleCharacterChanged() {
    logInfo('Character changed');
    setTimeout(() => tryLoadCharacter(), 100);
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
}

function updateToolVisibility() {
    const toolbar = document.getElementById('toolbox-svg-container');
    if (toolbar) {
        toolbar.style.display = extension_settings[extensionName].enabled ? 'block' : 'none';
    }
}

jQuery(async function() {
    logInfo('Extension initializing...');
    
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        
        $('#enable_toolbox').on('input', function() {
            const value = Boolean($(this).prop('checked'));
            extension_settings[extensionName].enabled = value;
            saveSettingsDebounced();
            updateToolVisibility();
        });
    } catch (e) {
        logError('Settings panel load error', e);
    }
    
    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(createSVG());
        bindSVGEvents();
        logInfo('Toolbar added to DOM');
    } else {
        logError('#send_form not found');
        return;
    }
    
    await loadSettings();
    
    try {
        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            logInfo('eventSource is available');
            const events = ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'CHARACTER_CHANGED', 'CHARACTER_LOADED', 'CHARACTER_SELECTED', 'GROUP_CHANGED'];
            
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
    
    logInfo('Checking initial character...');
    tryLoadCharacter();
    setTimeout(() => tryLoadCharacter(), 500);
    setTimeout(() => tryLoadCharacter(), 1500);
    setTimeout(() => tryLoadCharacter(), 3000);
    
    updateToolVisibility();
    logInfo('Extension initialized successfully');
});
