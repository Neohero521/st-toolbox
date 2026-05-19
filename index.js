import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'st-toolbox';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    genCount: 3,
    compactMode: false,
    autoReturn: true
};

let appState = {
    expandedTab: null,
    currentCharacter: null,
    gen3Replies: [],
    worldbookEntries: [],
    summaryText: '',
    analysisText: '',
    suggestionText: '',
    isLoading: false,
    isGenerating: false,
    currentTab: null
};

const clickHandlers = {
    gen3ReplyHandler: null,
    summaryHandler: null,
    analysisHandler: null,
    suggestionHandler: null
};

const utils = {
    logInfo(message, data = null) {
        const prefix = `[${extensionName}]`;
        if (data !== null) {
            console.log(prefix, message, data);
        } else {
            console.log(prefix, message);
        }
    },
    
    logError(message, error = null) {
        const prefix = `[${extensionName}]`;
        if (error !== null) {
            console.error(prefix, message, error);
        } else {
            console.error(prefix, message);
        }
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

const api = {
    async callParentApi(prompt) {
        if (window.parent && window.parent.TavernHelper && 
            typeof window.parent.TavernHelper.generate === 'function') {
            const params = {
                user_input: prompt,
                should_stream: false,
                disable_extras: true,
                stop_everything: true
            };
            try {
                const response = await window.parent.TavernHelper.generate(params);
                return response ? response.trim() : null;
            } catch (e) {
                utils.logError('Parent API call failed', e);
                throw new Error('API call failed');
            }
        } else {
            throw new Error('Parent API not available');
        }
    },
    
    async safeGenerate(prompt, fallbackGenerator) {
        try {
            const response = await this.callParentApi(prompt);
            if (response && response.trim()) {
                return response;
            }
            throw new Error('Empty response');
        } catch (e) {
            utils.logError('API failed, using fallback', e);
            return typeof fallbackGenerator === 'function' ? fallbackGenerator() : (fallbackGenerator || '生成失败');
        }
    }
};

const characterManager = {
    getCurrentCharacterData() {
        try {
            const context = getContext();
            if (!context) {
                utils.logInfo('Context not available');
                return null;
            }
            
            let character = null;
            let charData = null;
            
            if (context.characterId !== undefined && context.characterId !== null && context.characters) {
                character = context.characters[context.characterId];
                if (character) {
                    charData = character.data || character;
                    utils.logInfo('Got character via characters[characterId]', character.name);
                }
            }
            
            if (!character && context.character) {
                character = context.character;
                charData = character.data || character;
                utils.logInfo('Got character via context.character', character.name);
            }
            
            if (!character && context.selectedCharacter) {
                character = context.selectedCharacter;
                charData = character.data || character;
                utils.logInfo('Got character via selectedCharacter', character.name);
            }
            
            if (!character || !character.name) {
                utils.logInfo('No character found');
                return null;
            }
            
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
        } catch (e) {
            utils.logError('Error getting character data', e);
            return null;
        }
    },
    
    tryLoadCharacter() {
        utils.logInfo('Attempting to load character...');
        const character = this.getCurrentCharacterData();
        if (character) {
            appState.currentCharacter = character;
            utils.logInfo('Character loaded successfully:', character.name);
            ui.updateStatus();
            return true;
        } else {
            utils.logInfo('Failed to load character');
            ui.updateStatus();
            return false;
        }
    }
};

const chatManager = {
    getRecentMessages(count = 5) {
        try {
            const context = getContext();
            if (!context || !context.chat) return [];
            return context.chat.slice(-count);
        } catch (e) {
            utils.logError('Error getting messages', e);
            return [];
        }
    },
    
    sendMessage(message) {
        if (!message) {
            utils.logError('Cannot send empty message');
            return;
        }
        
        const input = $('#send_textarea, #prompt_textarea').first();
        if (input.length) {
            input.val(message);
            input.focus();
            
            const sendButton = $('#send_but');
            if (sendButton.length && !sendButton.prop('disabled')) {
                sendButton.click();
            } else {
                const event = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                input[0].dispatchEvent(event);
            }
            
            if (extension_settings[extensionName]?.autoReturn) {
                setTimeout(() => ui.renderMainView(), 300);
            }
        }
    },
    
    copyToClipboard(text) {
        if (!text) return;
        
        navigator.clipboard.writeText(text).then(() => {
            if (typeof toastr !== 'undefined') {
                toastr.success('已复制');
            }
        }).catch(err => {
            utils.logError('Copy failed', err);
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            if (typeof toastr !== 'undefined') {
                toastr.success('已复制');
            }
        });
    }
};

const ui = {
    createSVG() {
        const compactClass = extension_settings[extensionName]?.compactMode ? 'compact' : '';
        return `
            <div id="toolbox-svg-container" class="${compactClass}">
                <div class="toolbox-bg"></div>
                <div class="toolbox-border"></div>
                
                <div id="main-view" class="toolbox-view">
                    <div class="toolbox-header">
                        <span id="char-status" class="toolbox-status">未加载</span>
                    </div>
                    <div class="toolbox-buttons">
                        <button id="btn-gen3" class="toolbox-btn" type="button">生成</button>
                        <button id="btn-worldbook" class="toolbox-btn" type="button">世界书</button>
                        <button id="btn-summary" class="toolbox-btn" type="button">总结</button>
                        <button id="btn-analysis" class="toolbox-btn" type="button">分析</button>
                        <button id="btn-suggestion" class="toolbox-btn" type="button">建议</button>
                        <button id="btn-settings" class="toolbox-btn-icon" type="button">&#9881;</button>
                    </div>
                </div>
                
                <div id="detail-view" class="toolbox-view" style="display: none;">
                    <div class="toolbox-header">
                        <button id="btn-back" class="toolbox-btn-back" type="button">&#8592;</button>
                        <span id="detail-title" class="toolbox-title">功能</span>
                    </div>
                    <div id="loading-indicator" class="toolbox-loading" style="display: none;">
                        <div class="toolbox-spinner"></div>
                    </div>
                </div>
                
                <div id="toolbox-content" class="toolbox-content"></div>
            </div>
        `;
    },
    
    updateStatus() {
        const statusText = document.getElementById('char-status');
        if (statusText) {
            if (appState.currentCharacter) {
                statusText.textContent = `\u2713 ${appState.currentCharacter.name}`;
                statusText.className = 'toolbox-status toolbox-status-loaded';
            } else {
                statusText.textContent = '未加载';
                statusText.className = 'toolbox-status';
            }
        }
    },
    
    setLoading(loading) {
        appState.isLoading = loading;
        const indicator = document.getElementById('loading-indicator');
        if (indicator) {
            indicator.style.display = loading ? 'block' : 'none';
        }
    },
    
    setGenerating(generating) {
        appState.isGenerating = generating;
        this.setLoading(generating);
    },
    
    renderMainView() {
        appState.expandedTab = null;
        appState.currentTab = null;
        
        this.cleanupEventListeners();
        
        const mainView = document.getElementById('main-view');
        const detailView = document.getElementById('detail-view');
        const content = document.getElementById('toolbox-content');
        
        if (mainView) mainView.style.display = 'flex';
        if (detailView) detailView.style.display = 'none';
        if (content) content.innerHTML = '';
    },
    
    renderDetailView(tab) {
        this.cleanupEventListeners();
        
        appState.expandedTab = tab;
        appState.currentTab = tab;
        
        const mainView = document.getElementById('main-view');
        const detailView = document.getElementById('detail-view');
        const content = document.getElementById('toolbox-content');
        
        if (mainView) mainView.style.display = 'none';
        if (detailView) detailView.style.display = 'flex';
        
        const titles = {
            'gen3': '生成回复',
            'worldbook': '世界书',
            'summary': '对话总结',
            'analysis': '角色分析',
            'suggestion': '情节建议'
        };
        
        const titleEl = document.getElementById('detail-title');
        if (titleEl) titleEl.textContent = titles[tab] || '功能';
        
        let contentHTML = '';
        
        switch(tab) {
            case 'gen3':
                contentHTML = this.renderGen3Content();
                break;
            case 'worldbook':
                contentHTML = this.renderWorldbookContent();
                break;
            case 'summary':
                contentHTML = this.renderSummaryContent();
                break;
            case 'analysis':
                contentHTML = this.renderAnalysisContent();
                break;
            case 'suggestion':
                contentHTML = this.renderSuggestionContent();
                break;
        }
        
        if (content) content.innerHTML = contentHTML;
        
        setTimeout(() => events.bindOverlayEvents(tab), 50);
    },
    
    cleanupEventListeners() {
        if (clickHandlers.gen3ReplyHandler) {
            document.removeEventListener('click', clickHandlers.gen3ReplyHandler);
            clickHandlers.gen3ReplyHandler = null;
        }
        if (clickHandlers.summaryHandler) {
            document.removeEventListener('click', clickHandlers.summaryHandler);
            clickHandlers.summaryHandler = null;
        }
        if (clickHandlers.analysisHandler) {
            document.removeEventListener('click', clickHandlers.analysisHandler);
            clickHandlers.analysisHandler = null;
        }
        if (clickHandlers.suggestionHandler) {
            document.removeEventListener('click', clickHandlers.suggestionHandler);
            clickHandlers.suggestionHandler = null;
        }
    },
    
    renderGen3Content() {
        const genCount = extension_settings[extensionName]?.genCount || 3;
        return `
            <div class="toolbox-gen-controls">
                <select id="gen-count-select" class="toolbox-select">
                    <option value="1" ${genCount == 1 ? 'selected' : ''}>1条</option>
                    <option value="2" ${genCount == 2 ? 'selected' : ''}>2条</option>
                    <option value="3" ${genCount == 3 ? 'selected' : ''}>3条</option>
                </select>
                <button id="gen-start-btn" class="toolbox-btn-primary" type="button">生成</button>
            </div>
            <div id="gen-results" class="toolbox-results"></div>
        `;
    },
    
    renderWorldbookContent() {
        return `
            <div class="toolbox-wb-controls">
                <button id="wb-start-btn" class="toolbox-btn-primary" type="button">生成</button>
                <button id="wb-save-btn" class="toolbox-btn-secondary" type="button" disabled>保存</button>
            </div>
            <div id="wb-preview" class="toolbox-results"></div>
        `;
    },
    
    renderSummaryContent() {
        return `
            <button id="sum-start-btn" class="toolbox-btn-primary" type="button">生成总结</button>
            <div id="sum-content" class="toolbox-results"></div>
        `;
    },
    
    renderAnalysisContent() {
        return `
            <button id="ana-start-btn" class="toolbox-btn-primary" type="button">分析角色</button>
            <div id="ana-content" class="toolbox-results"></div>
        `;
    },
    
    renderSuggestionContent() {
        return `
            <button id="sug-start-btn" class="toolbox-btn-primary" type="button">生成建议</button>
            <div id="sug-content" class="toolbox-results"></div>
        `;
    },
    
    renderGen3Results() {
        const resultsEl = document.getElementById('gen-results');
        if (!resultsEl || appState.gen3Replies.length === 0) return;
        
        let html = '';
        appState.gen3Replies.forEach((reply, i) => {
            const safeText = utils.escapeHtml(reply);
            const displayText = safeText.length > 90 ? safeText.substring(0, 90) + '...' : safeText;
            
            html += `
                <div class="toolbox-result-item">
                    <span class="toolbox-result-num">${i + 1}</span>
                    <span class="toolbox-result-text">${displayText}</span>
                    <div class="toolbox-result-actions">
                        <button class="toolbox-btn-small use-reply-btn" data-index="${i}" type="button">发</button>
                        <button class="toolbox-btn-small copy-reply-btn" data-index="${i}" type="button">复</button>
                    </div>
                </div>
            `;
        });
        resultsEl.innerHTML = html;
    },
    
    renderWorldbookEntry(entry) {
        const previewEl = document.getElementById('wb-preview');
        if (!previewEl) return;
        
        previewEl.innerHTML = `
            <div class="toolbox-wb-entry">
                <div class="toolbox-wb-name">${utils.escapeHtml(entry.name)}</div>
                <div class="toolbox-wb-keywords">${utils.escapeHtml(entry.keywords.join('、'))}</div>
                <div class="toolbox-wb-content">${utils.escapeHtml(entry.content)}</div>
            </div>
        `;
    },
    
    renderTextContent(type, text) {
        const elMap = {
            'summary': 'sum-content',
            'analysis': 'ana-content',
            'suggestion': 'sug-content'
        };
        const contentEl = document.getElementById(elMap[type]);
        if (!contentEl) return;
        
        let html = '';
        const character = appState.currentCharacter;
        
        if (type === 'analysis' && character) {
            html = `
                <div class="toolbox-analysis-item">
                    <div class="toolbox-analysis-name">${utils.escapeHtml(character.name)}</div>
                    <div class="toolbox-analysis-text">${utils.escapeHtml(text)}</div>
                    <button id="ana-copy-btn" class="toolbox-btn-full" type="button">复制</button>
                </div>
            `;
        } else {
            html = `
                <div class="toolbox-text-item">
                    <div class="toolbox-text-content">${utils.escapeHtml(text)}</div>
                    <div class="toolbox-text-actions">
                        <button id="${type}-use-btn" class="toolbox-btn-half" type="button">发送</button>
                        <button id="${type}-copy-btn" class="toolbox-btn-half" type="button">复制</button>
                    </div>
                </div>
            `;
        }
        contentEl.innerHTML = html;
    },
    
    showError(message, targetId) {
        const el = document.getElementById(targetId);
        if (el) {
            el.innerHTML = `
                <div class="toolbox-error">
                    ${utils.escapeHtml(message)}
                </div>
            `;
        }
    },
    
    showLoading(targetId) {
        const el = document.getElementById(targetId);
        if (el) {
            el.innerHTML = `
                <div class="toolbox-loading-inline">
                    <div class="toolbox-spinner-small"></div>
                    <span>生成中...</span>
                </div>
            `;
        }
    },
    
    resetButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('toolbox-btn-loading');
        }
    },
    
    disableButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = true;
            btn.classList.add('toolbox-btn-loading');
        }
    }
};

const features = {
    async generate3Replies() {
        if (appState.isGenerating) {
            utils.logInfo('Already generating, ignoring click');
            return;
        }
        
        const countSelect = document.getElementById('gen-count-select');
        const startBtn = document.getElementById('gen-start-btn');
        const resultsEl = document.getElementById('gen-results');
        
        if (!startBtn || !resultsEl) return;
        
        const genCount = parseInt(countSelect?.value) || 3;
        
        ui.disableButton('gen-start-btn');
        ui.setGenerating(true);
        resultsEl.innerHTML = '';
        ui.showLoading('gen-results');
        
        try {
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'gen-results');
                return;
            }
            
            const character = appState.currentCharacter || characterManager.getCurrentCharacterData();
            const recentMessages = chatManager.getRecentMessages(6);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            appState.gen3Replies = [];
            
            const prompt = `作为角色${character?.name || '角色'}，根据以下对话生成${genCount}条不同风格的回复选项。
请严格按格式返回，每行一条回复，不要加编号：
${chatHistory}

要求：每条回复简洁，60字以内，${genCount}条风格要有明显差异。`;
            
            const response = await api.safeGenerate(prompt, () => {
                const fallback = [];
                for (let i = 1; i <= genCount; i++) {
                    fallback.push(`回复选项${i}：这是模拟生成的回复内容`);
                }
                return fallback.join('\n');
            });
            
            if (response) {
                const lines = response.split('\n').filter(line => line.trim().length > 0);
                for (const line of lines) {
                    const cleanedLine = line.replace(/^\d+[\.\)\s:：]+|^[-*]\s*/, '').trim();
                    if (cleanedLine.length > 0 && appState.gen3Replies.length < genCount) {
                        appState.gen3Replies.push(cleanedLine);
                    }
                }
                
                if (appState.gen3Replies.length === 0) {
                    for (let i = 1; i <= genCount; i++) {
                        appState.gen3Replies.push(response.substring((i - 1) * 50, i * 50) || `回复选项${i}`);
                    }
                }
            } else {
                ui.showError('生成失败，请重试', 'gen-results');
                return;
            }
            
            ui.renderGen3Results();
            
        } catch (e) {
            utils.logError('Generate failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'gen-results');
        } finally {
            ui.resetButton('gen-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async generateWorldbookEntry() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('wb-start-btn');
        const saveBtn = document.getElementById('wb-save-btn');
        const previewEl = document.getElementById('wb-preview');
        
        if (!startBtn || !previewEl) return;
        
        ui.disableButton('wb-start-btn');
        ui.disableButton('wb-save-btn');
        ui.setGenerating(true);
        ui.showLoading('wb-preview');
        
        try {
            const context = getContext();
            const character = appState.currentCharacter;
            
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'wb-preview');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(20);
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
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `根据以下对话生成世界书条目，包含角色简介和场景描述（简洁）：\n\n${chatHistory.substring(0, 600)}`;
            
            const generatedContent = await api.safeGenerate(prompt, `出场人物：${charList.join('、')}\n场景：最近对话场景`);
            
            appState.worldbookEntries = [{
                name: entryName,
                keywords: charList,
                content: generatedContent
            }];
            
            ui.renderWorldbookEntry(appState.worldbookEntries[0]);
            
            if (saveBtn) {
                saveBtn.disabled = false;
            }
            
        } catch (e) {
            utils.logError('Worldbook generate failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'wb-preview');
        } finally {
            ui.resetButton('wb-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async saveToWorldbook() {
        if (appState.worldbookEntries.length === 0) return;
        
        const saveBtn = document.getElementById('wb-save-btn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';
        }
        
        try {
            if (typeof window.createWorldEntry !== 'undefined') {
                appState.worldbookEntries.forEach(entry => {
                    window.createWorldEntry({
                        name: entry.name,
                        content: entry.content,
                        keywords: entry.keywords
                    });
                });
                if (typeof toastr !== 'undefined') {
                    toastr.success('已保存到世界书');
                }
            } else {
                chatManager.copyToClipboard(JSON.stringify(appState.worldbookEntries, null, 2));
                if (typeof toastr !== 'undefined') {
                    toastr.info('已复制到剪贴板');
                }
            }
            
            if (saveBtn) {
                saveBtn.textContent = '已保存';
                setTimeout(() => {
                    if (saveBtn) {
                        saveBtn.disabled = true;
                        saveBtn.textContent = '保存';
                    }
                }, 2000);
            }
            
        } catch (e) {
            utils.logError('Save failed', e);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '保存';
            }
            if (typeof toastr !== 'undefined') {
                toastr.error('保存失败');
            }
        }
    },
    
    async generateSummary() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('sum-start-btn');
        const contentEl = document.getElementById('sum-content');
        
        if (!startBtn || !contentEl) return;
        
        ui.disableButton('sum-start-btn');
        ui.setGenerating(true);
        contentEl.innerHTML = '';
        ui.showLoading('sum-content');
        
        try {
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'sum-content');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(12);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `总结以下对话的关键内容（简洁，120字以内）：\n\n${chatHistory}`;
            appState.summaryText = await api.safeGenerate(prompt, '对话总结（模拟数据）');
            
            ui.renderTextContent('summary', appState.summaryText);
            
        } catch (e) {
            utils.logError('Summary failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'sum-content');
        } finally {
            ui.resetButton('sum-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async generateAnalysis() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('ana-start-btn');
        const contentEl = document.getElementById('ana-content');
        
        if (!startBtn || !contentEl) return;
        
        ui.disableButton('ana-start-btn');
        ui.setGenerating(true);
        contentEl.innerHTML = '';
        ui.showLoading('ana-content');
        
        try {
            const character = appState.currentCharacter || characterManager.getCurrentCharacterData();
            if (!character) {
                ui.showError('无角色信息', 'ana-content');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(6);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `分析角色${character.name}的性格特点：\n\n角色设定：${character.personality || character.description}\n\n近期对话：${chatHistory}\n\n请简洁分析（100字以内）。`;
            appState.analysisText = await api.safeGenerate(prompt, `${character.name}的性格分析（模拟数据）`);
            
            ui.renderTextContent('analysis', appState.analysisText);
            
        } catch (e) {
            utils.logError('Analysis failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'ana-content');
        } finally {
            ui.resetButton('ana-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async generateSuggestion() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('sug-start-btn');
        const contentEl = document.getElementById('sug-content');
        
        if (!startBtn || !contentEl) return;
        
        ui.disableButton('sug-start-btn');
        ui.setGenerating(true);
        contentEl.innerHTML = '';
        ui.showLoading('sug-content');
        
        try {
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'sug-content');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(6);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `基于以下对话，给出一个情节发展建议（简洁，90字以内）：\n\n${chatHistory}`;
            appState.suggestionText = await api.safeGenerate(prompt, '情节发展建议（模拟数据）');
            
            ui.renderTextContent('suggestion', appState.suggestionText);
            
        } catch (e) {
            utils.logError('Suggestion failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'sug-content');
        } finally {
            ui.resetButton('sug-start-btn');
            ui.setGenerating(false);
        }
    }
};

const events = {
    bindSVGEvents() {
        const btnGen3 = document.getElementById('btn-gen3');
        const btnWorldbook = document.getElementById('btn-worldbook');
        const btnSummary = document.getElementById('btn-summary');
        const btnAnalysis = document.getElementById('btn-analysis');
        const btnSuggestion = document.getElementById('btn-suggestion');
        const btnBack = document.getElementById('btn-back');
        const btnSettings = document.getElementById('btn-settings');
        
        if (btnGen3) btnGen3.addEventListener('click', () => ui.renderDetailView('gen3'));
        if (btnWorldbook) btnWorldbook.addEventListener('click', () => ui.renderDetailView('worldbook'));
        if (btnSummary) btnSummary.addEventListener('click', () => ui.renderDetailView('summary'));
        if (btnAnalysis) btnAnalysis.addEventListener('click', () => ui.renderDetailView('analysis'));
        if (btnSuggestion) btnSuggestion.addEventListener('click', () => ui.renderDetailView('suggestion'));
        if (btnBack) btnBack.addEventListener('click', () => ui.renderMainView());
        if (btnSettings) btnSettings.addEventListener('click', () => this.toggleSettings());
    },
    
    bindOverlayEvents(tab) {
        switch(tab) {
            case 'gen3':
                const genStartBtn = document.getElementById('gen-start-btn');
                const genCountSelect = document.getElementById('gen-count-select');
                
                if (genStartBtn) {
                    genStartBtn.addEventListener('click', () => features.generate3Replies());
                }
                if (genCountSelect) {
                    genCountSelect.addEventListener('change', (e) => {
                        extension_settings[extensionName].genCount = parseInt(e.target.value) || 3;
                        saveSettingsDebounced();
                    });
                }
                
                clickHandlers.gen3ReplyHandler = (e) => {
                    const target = e.target;
                    if (target.classList && target.classList.contains('use-reply-btn')) {
                        const idx = parseInt(target.getAttribute('data-index'));
                        if (!isNaN(idx) && appState.gen3Replies[idx]) {
                            chatManager.sendMessage(appState.gen3Replies[idx]);
                        }
                    }
                    if (target.classList && target.classList.contains('copy-reply-btn')) {
                        const idx = parseInt(target.getAttribute('data-index'));
                        if (!isNaN(idx) && appState.gen3Replies[idx]) {
                            chatManager.copyToClipboard(appState.gen3Replies[idx]);
                        }
                    }
                };
                document.addEventListener('click', clickHandlers.gen3ReplyHandler);
                break;
                
            case 'worldbook':
                const wbStartBtn = document.getElementById('wb-start-btn');
                const wbSaveBtn = document.getElementById('wb-save-btn');
                
                if (wbStartBtn) wbStartBtn.addEventListener('click', () => features.generateWorldbookEntry());
                if (wbSaveBtn) wbSaveBtn.addEventListener('click', () => features.saveToWorldbook());
                break;
                
            case 'summary':
                const sumStartBtn = document.getElementById('sum-start-btn');
                
                if (sumStartBtn) sumStartBtn.addEventListener('click', () => features.generateSummary());
                
                clickHandlers.summaryHandler = (e) => {
                    const target = e.target;
                    if (target.id === 'summary-use-btn' && appState.summaryText) {
                        chatManager.sendMessage(appState.summaryText);
                    }
                    if (target.id === 'summary-copy-btn' && appState.summaryText) {
                        chatManager.copyToClipboard(appState.summaryText);
                    }
                };
                document.addEventListener('click', clickHandlers.summaryHandler);
                break;
                
            case 'analysis':
                const anaStartBtn = document.getElementById('ana-start-btn');
                
                if (anaStartBtn) anaStartBtn.addEventListener('click', () => features.generateAnalysis());
                
                clickHandlers.analysisHandler = (e) => {
                    if (e.target.id === 'ana-copy-btn' && appState.analysisText) {
                        chatManager.copyToClipboard(appState.analysisText);
                    }
                };
                document.addEventListener('click', clickHandlers.analysisHandler);
                break;
                
            case 'suggestion':
                const sugStartBtn = document.getElementById('sug-start-btn');
                
                if (sugStartBtn) sugStartBtn.addEventListener('click', () => features.generateSuggestion());
                
                clickHandlers.suggestionHandler = (e) => {
                    const target = e.target;
                    if (target.id === 'suggestion-use-btn' && appState.suggestionText) {
                        chatManager.sendMessage(appState.suggestionText);
                    }
                    if (target.id === 'suggestion-copy-btn' && appState.suggestionText) {
                        chatManager.copyToClipboard(appState.suggestionText);
                    }
                };
                document.addEventListener('click', clickHandlers.suggestionHandler);
                break;
        }
    },
    
    toggleSettings() {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        extension_settings[extensionName].autoReturn = !extension_settings[extensionName].autoReturn;
        saveSettingsDebounced();
        if (typeof toastr !== 'undefined') {
            toastr.info(`自动返回: ${extension_settings[extensionName].autoReturn ? '开' : '关'}`);
        }
    },
    
    bindChatEvents() {
        const eventNames = ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'CHARACTER_CHANGED', 'CHARACTER_LOADED', 'CHARACTER_SELECTED', 'GROUP_CHANGED'];
        
        eventNames.forEach(eventName => {
            if (event_types[eventName]) {
                eventSource.on(event_types[eventName], () => {
                    utils.logInfo(`${eventName} event`);
                    setTimeout(() => characterManager.tryLoadCharacter(), 100);
                });
            }
        });
    }
};

const settings = {
    async load() {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        if (Object.keys(extension_settings[extensionName]).length === 0) {
            Object.assign(extension_settings[extensionName], defaultSettings);
        }
    },
    
    updateVisibility() {
        const toolbar = document.getElementById('toolbox-svg-container');
        if (toolbar) {
            toolbar.style.display = extension_settings[extensionName]?.enabled ? 'block' : 'none';
        }
    },
    
    async initSettingsUI() {
        try {
            const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
            $('#extensions_settings').append(settingsHtml);
            
            $('#enable_toolbox').on('input', function() {
                const value = Boolean($(this).prop('checked'));
                extension_settings[extensionName].enabled = value;
                saveSettingsDebounced();
                settings.updateVisibility();
            });
        } catch (e) {
            utils.logError('Settings panel load error', e);
        }
    }
};

jQuery(async function() {
    utils.logInfo('Initializing extension...');
    
    await settings.load();
    await settings.initSettingsUI();
    
    const sendForm = $('#send_form');
    if (sendForm.length) {
        sendForm.before(ui.createSVG());
        
        setTimeout(() => {
            events.bindSVGEvents();
            utils.logInfo('Toolbar added to DOM and events bound');
        }, 100);
    } else {
        utils.logError('#send_form not found');
        return;
    }
    
    events.bindChatEvents();
    
    utils.logInfo('Checking initial character...');
    characterManager.tryLoadCharacter();
    
    setTimeout(() => characterManager.tryLoadCharacter(), 500);
    setTimeout(() => characterManager.tryLoadCharacter(), 1500);
    setTimeout(() => characterManager.tryLoadCharacter(), 3000);
    
    settings.updateVisibility();
    utils.logInfo('Extension initialized successfully!');
});
