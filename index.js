import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

const extensionName = 'st-smart-toolbar';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    genCount: 3,
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
        return `
            <div id="smart-toolbar-container">
                <div class="smart-toolbar-glow"></div>
                <div class="smart-toolbar-bg"></div>
                <div class="smart-toolbar-border"></div>
                
                <div id="smart-toolbar-main" class="smart-toolbar-view">
                    <div class="smart-toolbar-header">
                        <span id="smart-toolbar-status" class="smart-toolbar-status">未加载</span>
                    </div>
                    <div class="smart-toolbar-buttons">
                        <button id="smart-btn-gen3" class="smart-toolbar-btn" type="button">生成</button>
                        <button id="smart-btn-worldbook" class="smart-toolbar-btn" type="button">世界书</button>
                        <button id="smart-btn-summary" class="smart-toolbar-btn" type="button">总结</button>
                        <button id="smart-btn-analysis" class="smart-toolbar-btn" type="button">分析</button>
                        <button id="smart-btn-suggestion" class="smart-toolbar-btn" type="button">建议</button>
                        <button id="smart-btn-settings" class="smart-toolbar-btn-icon" type="button">&#9881;</button>
                    </div>
                </div>
                
                <div id="smart-toolbar-detail" class="smart-toolbar-view" style="display: none;">
                    <div class="smart-toolbar-header">
                        <button id="smart-btn-back" class="smart-toolbar-btn-back" type="button">&#8592;</button>
                        <span id="smart-toolbar-title" class="smart-toolbar-title">功能</span>
                    </div>
                </div>
                
                <div id="smart-toolbar-content" class="smart-toolbar-content"></div>
            </div>
        `;
    },
    
    updateStatus() {
        const statusText = document.getElementById('smart-toolbar-status');
        if (statusText) {
            if (appState.currentCharacter) {
                statusText.textContent = `\u2713 ${appState.currentCharacter.name}`;
                statusText.className = 'smart-toolbar-status smart-toolbar-status-loaded';
            } else {
                statusText.textContent = '未加载';
                statusText.className = 'smart-toolbar-status';
            }
        }
    },
    
    setLoading(loading) {
        appState.isLoading = loading;
    },
    
    setGenerating(generating) {
        appState.isGenerating = generating;
    },
    
    renderMainView() {
        appState.expandedTab = null;
        appState.currentTab = null;
        
        this.cleanupEventListeners();
        
        const mainView = document.getElementById('smart-toolbar-main');
        const detailView = document.getElementById('smart-toolbar-detail');
        const content = document.getElementById('smart-toolbar-content');
        
        if (mainView) mainView.style.display = 'flex';
        if (detailView) detailView.style.display = 'none';
        if (content) content.innerHTML = '';
    },
    
    renderDetailView(tab) {
        this.cleanupEventListeners();
        
        appState.expandedTab = tab;
        appState.currentTab = tab;
        
        const mainView = document.getElementById('smart-toolbar-main');
        const detailView = document.getElementById('smart-toolbar-detail');
        const content = document.getElementById('smart-toolbar-content');
        
        if (mainView) mainView.style.display = 'none';
        if (detailView) detailView.style.display = 'flex';
        
        const titles = {
            'gen3': '生成回复',
            'worldbook': '世界书',
            'summary': '对话总结',
            'analysis': '角色分析',
            'suggestion': '情节建议'
        };
        
        const titleEl = document.getElementById('smart-toolbar-title');
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
            <div class="smart-toolbar-gen-controls">
                <select id="smart-gen-count-select" class="smart-toolbar-select">
                    <option value="1" ${genCount == 1 ? 'selected' : ''}>1条</option>
                    <option value="2" ${genCount == 2 ? 'selected' : ''}>2条</option>
                    <option value="3" ${genCount == 3 ? 'selected' : ''}>3条</option>
                </select>
                <button id="smart-gen-start-btn" class="smart-toolbar-btn-primary" type="button">生成</button>
            </div>
            <div id="smart-gen-results" class="smart-toolbar-results"></div>
        `;
    },
    
    renderWorldbookContent() {
        return `
            <div class="smart-toolbar-wb-controls">
                <button id="smart-wb-start-btn" class="smart-toolbar-btn-primary" type="button">生成</button>
                <button id="smart-wb-save-btn" class="smart-toolbar-btn-secondary" type="button" disabled>保存</button>
            </div>
            <div id="smart-wb-preview" class="smart-toolbar-results"></div>
        `;
    },
    
    renderSummaryContent() {
        return `
            <button id="smart-sum-start-btn" class="smart-toolbar-btn-primary" type="button">生成总结</button>
            <div id="smart-sum-content" class="smart-toolbar-results"></div>
        `;
    },
    
    renderAnalysisContent() {
        return `
            <button id="smart-ana-start-btn" class="smart-toolbar-btn-primary" type="button">分析角色</button>
            <div id="smart-ana-content" class="smart-toolbar-results"></div>
        `;
    },
    
    renderSuggestionContent() {
        return `
            <button id="smart-sug-start-btn" class="smart-toolbar-btn-primary" type="button">生成建议</button>
            <div id="smart-sug-content" class="smart-toolbar-results"></div>
        `;
    },
    
    renderGen3Results() {
        const resultsEl = document.getElementById('smart-gen-results');
        if (!resultsEl || appState.gen3Replies.length === 0) return;
        
        let html = '';
        appState.gen3Replies.forEach((reply, i) => {
            const safeText = utils.escapeHtml(reply);
            const displayText = safeText.length > 90 ? safeText.substring(0, 90) + '...' : safeText;
            
            html += `
                <div class="smart-toolbar-result-item">
                    <span class="smart-toolbar-result-num">${i + 1}</span>
                    <span class="smart-toolbar-result-text">${displayText}</span>
                    <div class="smart-toolbar-result-actions">
                        <button class="smart-toolbar-btn-small smart-use-reply-btn" data-index="${i}" type="button">发</button>
                        <button class="smart-toolbar-btn-small smart-copy-reply-btn" data-index="${i}" type="button">复</button>
                    </div>
                </div>
            `;
        });
        resultsEl.innerHTML = html;
    },
    
    renderWorldbookEntry(entry) {
        const previewEl = document.getElementById('smart-wb-preview');
        if (!previewEl) return;
        
        previewEl.innerHTML = `
            <div class="smart-toolbar-wb-entry">
                <div class="smart-toolbar-wb-name">${utils.escapeHtml(entry.name)}</div>
                <div class="smart-toolbar-wb-keywords">${utils.escapeHtml(entry.keywords.join('、'))}</div>
                <div class="smart-toolbar-wb-content">${utils.escapeHtml(entry.content)}</div>
            </div>
        `;
    },
    
    renderTextContent(type, text) {
        const elMap = {
            'summary': 'smart-sum-content',
            'analysis': 'smart-ana-content',
            'suggestion': 'smart-sug-content'
        };
        const contentEl = document.getElementById(elMap[type]);
        if (!contentEl) return;
        
        let html = '';
        const character = appState.currentCharacter;
        
        if (type === 'analysis' && character) {
            html = `
                <div class="smart-toolbar-analysis-item">
                    <div class="smart-toolbar-analysis-name">${utils.escapeHtml(character.name)}</div>
                    <div class="smart-toolbar-analysis-text">${utils.escapeHtml(text)}</div>
                    <button id="smart-ana-copy-btn" class="smart-toolbar-btn-full" type="button">复制</button>
                </div>
            `;
        } else {
            html = `
                <div class="smart-toolbar-text-item">
                    <div class="smart-toolbar-text-content">${utils.escapeHtml(text)}</div>
                    <div class="smart-toolbar-text-actions">
                        <button id="smart-${type}-use-btn" class="smart-toolbar-btn-half" type="button">发送</button>
                        <button id="smart-${type}-copy-btn" class="smart-toolbar-btn-half" type="button">复制</button>
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
                <div class="smart-toolbar-error">
                    ${utils.escapeHtml(message)}
                </div>
            `;
        }
    },
    
    showLoading(targetId) {
        const el = document.getElementById(targetId);
        if (el) {
            el.innerHTML = `
                <div class="smart-toolbar-loading-inline">
                    <div class="smart-toolbar-spinner-small"></div>
                    <span>生成中...</span>
                </div>
            `;
        }
    },
    
    resetButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('smart-toolbar-btn-loading');
        }
    },
    
    disableButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = true;
            btn.classList.add('smart-toolbar-btn-loading');
        }
    }
};

const features = {
    async generate3Replies() {
        if (appState.isGenerating) {
            utils.logInfo('Already generating, ignoring click');
            return;
        }
        
        const countSelect = document.getElementById('smart-gen-count-select');
        const startBtn = document.getElementById('smart-gen-start-btn');
        const resultsEl = document.getElementById('smart-gen-results');
        
        if (!startBtn || !resultsEl) return;
        
        const genCount = parseInt(countSelect?.value) || 3;
        
        ui.disableButton('smart-gen-start-btn');
        ui.setGenerating(true);
        resultsEl.innerHTML = '';
        ui.showLoading('smart-gen-results');
        
        try {
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'smart-gen-results');
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
                ui.showError('生成失败，请重试', 'smart-gen-results');
                return;
            }
            
            ui.renderGen3Results();
            
        } catch (e) {
            utils.logError('Generate failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'smart-gen-results');
        } finally {
            ui.resetButton('smart-gen-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async generateWorldbookEntry() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('smart-wb-start-btn');
        const saveBtn = document.getElementById('smart-wb-save-btn');
        const previewEl = document.getElementById('smart-wb-preview');
        
        if (!startBtn || !previewEl) return;
        
        ui.disableButton('smart-wb-start-btn');
        ui.disableButton('smart-wb-save-btn');
        ui.setGenerating(true);
        ui.showLoading('smart-wb-preview');
        
        try {
            const context = getContext();
            const character = appState.currentCharacter;
            
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'smart-wb-preview');
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
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'smart-wb-preview');
        } finally {
            ui.resetButton('smart-wb-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async saveToWorldbook() {
        if (appState.worldbookEntries.length === 0) return;
        
        const saveBtn = document.getElementById('smart-wb-save-btn');
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
        
        const startBtn = document.getElementById('smart-sum-start-btn');
        const contentEl = document.getElementById('smart-sum-content');
        
        if (!startBtn || !contentEl) return;
        
        ui.disableButton('smart-sum-start-btn');
        ui.setGenerating(true);
        contentEl.innerHTML = '';
        ui.showLoading('smart-sum-content');
        
        try {
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'smart-sum-content');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(12);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `总结以下对话的关键内容（简洁，120字以内）：\n\n${chatHistory}`;
            appState.summaryText = await api.safeGenerate(prompt, '对话总结（模拟数据）');
            
            ui.renderTextContent('summary', appState.summaryText);
            
        } catch (e) {
            utils.logError('Summary failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'smart-sum-content');
        } finally {
            ui.resetButton('smart-sum-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async generateAnalysis() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('smart-ana-start-btn');
        const contentEl = document.getElementById('smart-ana-content');
        
        if (!startBtn || !contentEl) return;
        
        ui.disableButton('smart-ana-start-btn');
        ui.setGenerating(true);
        contentEl.innerHTML = '';
        ui.showLoading('smart-ana-content');
        
        try {
            const character = appState.currentCharacter || characterManager.getCurrentCharacterData();
            if (!character) {
                ui.showError('无角色信息', 'smart-ana-content');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(6);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `分析角色${character.name}的性格特点：\n\n角色设定：${character.personality || character.description}\n\n近期对话：${chatHistory}\n\n请简洁分析（100字以内）。`;
            appState.analysisText = await api.safeGenerate(prompt, `${character.name}的性格分析（模拟数据）`);
            
            ui.renderTextContent('analysis', appState.analysisText);
            
        } catch (e) {
            utils.logError('Analysis failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'smart-ana-content');
        } finally {
            ui.resetButton('smart-ana-start-btn');
            ui.setGenerating(false);
        }
    },
    
    async generateSuggestion() {
        if (appState.isGenerating) return;
        
        const startBtn = document.getElementById('smart-sug-start-btn');
        const contentEl = document.getElementById('smart-sug-content');
        
        if (!startBtn || !contentEl) return;
        
        ui.disableButton('smart-sug-start-btn');
        ui.setGenerating(true);
        contentEl.innerHTML = '';
        ui.showLoading('smart-sug-content');
        
        try {
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) {
                ui.showError('无聊天记录', 'smart-sug-content');
                return;
            }
            
            const recentMessages = chatManager.getRecentMessages(6);
            const chatHistory = recentMessages.map(m => m.mes).join('\n');
            
            const prompt = `基于以下对话，给出一个情节发展建议（简洁，90字以内）：\n\n${chatHistory}`;
            appState.suggestionText = await api.safeGenerate(prompt, '情节发展建议（模拟数据）');
            
            ui.renderTextContent('suggestion', appState.suggestionText);
            
        } catch (e) {
            utils.logError('Suggestion failed', e);
            ui.showError('生成失败: ' + (e.message || '未知错误'), 'smart-sug-content');
        } finally {
            ui.resetButton('smart-sug-start-btn');
            ui.setGenerating(false);
        }
    }
};

const events = {
    bindSVGEvents() {
        const btnGen3 = document.getElementById('smart-btn-gen3');
        const btnWorldbook = document.getElementById('smart-btn-worldbook');
        const btnSummary = document.getElementById('smart-btn-summary');
        const btnAnalysis = document.getElementById('smart-btn-analysis');
        const btnSuggestion = document.getElementById('smart-btn-suggestion');
        const btnBack = document.getElementById('smart-btn-back');
        const btnSettings = document.getElementById('smart-btn-settings');
        
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
                const genStartBtn = document.getElementById('smart-gen-start-btn');
                const genCountSelect = document.getElementById('smart-gen-count-select');
                
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
                    if (target.classList && target.classList.contains('smart-use-reply-btn')) {
                        const idx = parseInt(target.getAttribute('data-index'));
                        if (!isNaN(idx) && appState.gen3Replies[idx]) {
                            chatManager.sendMessage(appState.gen3Replies[idx]);
                        }
                    }
                    if (target.classList && target.classList.contains('smart-copy-reply-btn')) {
                        const idx = parseInt(target.getAttribute('data-index'));
                        if (!isNaN(idx) && appState.gen3Replies[idx]) {
                            chatManager.copyToClipboard(appState.gen3Replies[idx]);
                        }
                    }
                };
                document.addEventListener('click', clickHandlers.gen3ReplyHandler);
                break;
                
            case 'worldbook':
                const wbStartBtn = document.getElementById('smart-wb-start-btn');
                const wbSaveBtn = document.getElementById('smart-wb-save-btn');
                
                if (wbStartBtn) wbStartBtn.addEventListener('click', () => features.generateWorldbookEntry());
                if (wbSaveBtn) wbSaveBtn.addEventListener('click', () => features.saveToWorldbook());
                break;
                
            case 'summary':
                const sumStartBtn = document.getElementById('smart-sum-start-btn');
                
                if (sumStartBtn) sumStartBtn.addEventListener('click', () => features.generateSummary());
                
                clickHandlers.summaryHandler = (e) => {
                    const target = e.target;
                    if (target.id === 'smart-summary-use-btn' && appState.summaryText) {
                        chatManager.sendMessage(appState.summaryText);
                    }
                    if (target.id === 'smart-summary-copy-btn' && appState.summaryText) {
                        chatManager.copyToClipboard(appState.summaryText);
                    }
                };
                document.addEventListener('click', clickHandlers.summaryHandler);
                break;
                
            case 'analysis':
                const anaStartBtn = document.getElementById('smart-ana-start-btn');
                
                if (anaStartBtn) anaStartBtn.addEventListener('click', () => features.generateAnalysis());
                
                clickHandlers.analysisHandler = (e) => {
                    if (e.target.id === 'smart-ana-copy-btn' && appState.analysisText) {
                        chatManager.copyToClipboard(appState.analysisText);
                    }
                };
                document.addEventListener('click', clickHandlers.analysisHandler);
                break;
                
            case 'suggestion':
                const sugStartBtn = document.getElementById('smart-sug-start-btn');
                
                if (sugStartBtn) sugStartBtn.addEventListener('click', () => features.generateSuggestion());
                
                clickHandlers.suggestionHandler = (e) => {
                    const target = e.target;
                    if (target.id === 'smart-suggestion-use-btn' && appState.suggestionText) {
                        chatManager.sendMessage(appState.suggestionText);
                    }
                    if (target.id === 'smart-suggestion-copy-btn' && appState.suggestionText) {
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
        Object.keys(defaultSettings).forEach(key => {
            if (extension_settings[extensionName][key] === undefined) {
                extension_settings[extensionName][key] = defaultSettings[key];
            }
        });
    },
    
    updateVisibility() {
        const toolbar = document.getElementById('smart-toolbar-container');
        if (toolbar) {
            toolbar.style.display = extension_settings[extensionName]?.enabled ? 'block' : 'none';
        }
    },
    
    async initSettingsUI() {
        try {
            const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
            $('#extensions_settings').append(settingsHtml);
            
            $('#smart_toolbar_enabled').prop('checked', extension_settings[extensionName]?.enabled);
            $('#smart_toolbar_auto_return').prop('checked', extension_settings[extensionName]?.autoReturn);
            $('#smart_toolbar_gen_count').val(extension_settings[extensionName]?.genCount);
            
            $('#smart_toolbar_enabled').on('input', function() {
                const value = Boolean($(this).prop('checked'));
                extension_settings[extensionName].enabled = value;
                saveSettingsDebounced();
                settings.updateVisibility();
            });
            
            $('#smart_toolbar_auto_return').on('input', function() {
                const value = Boolean($(this).prop('checked'));
                extension_settings[extensionName].autoReturn = value;
                saveSettingsDebounced();
            });
            
            $('#smart_toolbar_gen_count').on('change', function() {
                const value = parseInt($(this).val()) || 3;
                extension_settings[extensionName].genCount = value;
                saveSettingsDebounced();
            });
            
        } catch (e) {
            utils.logError('Settings panel load error', e);
        }
    }
};

jQuery(async function() {
    utils.logInfo('Initializing Smart Toolbar extension...');
    
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
    utils.logInfo('Smart Toolbar extension initialized successfully!');
});
