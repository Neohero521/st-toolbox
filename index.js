import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';

// ==================== 常量配置 ====================
const EXTENSION_NAME = 'st-smart-toolbar';
const EXTENSION_FOLDER = `scripts/extensions/third-party/${EXTENSION_NAME}`;

const DEFAULT_SETTINGS = {
    enabled: true,
    genCount: 3,
    autoReturn: true,
    theme: 'neon-purple',
    quickReplyCount: 3,
    maxHistoryLength: 50
};

const THEMES = {
    'neon-purple': {
        primary: '#a855f7',
        secondary: '#ec4899',
        bg: 'linear-gradient(135deg, #1a0f2e 0%, #2d1b44 50%, #3d1f5c 100%)'
    },
    'cyber-blue': {
        primary: '#00f3ff',
        secondary: '#7b2cbf',
        bg: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1f2428 100%)'
    }
};

// ==================== 状态管理 ====================
let appState = {
    currentTab: null,
    currentCharacter: null,
    quickReplies: [],
    worldbookEntries: [],
    summaries: [],
    analysis: {},
    suggestions: [],
    isLoading: false,
    isGenerating: false,
    generationProgress: 0,
    uiMode: 'main'
};

const clickHandlers = {
    quickReplyHandler: null,
    summaryHandler: null,
    analysisHandler: null,
    suggestionHandler: null
};

// ==================== 工具函数 ====================
const utils = {
    logInfo(msg, data = null) {
        const prefix = `[${EXTENSION_NAME}]`;
        data ? console.log(prefix, msg, data) : console.log(prefix, msg);
    },
    
    logError(msg, err = null) {
        const prefix = `[${EXTENSION_NAME}]`;
        err ? console.error(prefix, msg, err) : console.error(prefix, msg);
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    truncate(text, maxLen = 100) {
        return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
    },
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    debounce(fn, wait) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    },
    
    getTimestamp() {
        return new Date().toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    }
};

// ==================== API层 ====================
const api = {
    async callSillyTavernApi(prompt) {
        if (window.parent?.TavernHelper?.generate) {
            try {
                const params = {
                    user_input: prompt,
                    should_stream: false,
                    disable_extras: true,
                    stop_everything: true
                };
                const resp = await window.parent.TavernHelper.generate(params);
                return resp?.trim();
            } catch (e) {
                utils.logError('API调用失败', e);
            }
        }
        throw new Error('API不可用');
    },
    
    async generateWithFallback(prompt, fallbackFn) {
        try {
            const result = await this.callSillyTavernApi(prompt);
            if (result?.trim()) return result;
            throw new Error('返回结果为空');
        } catch (e) {
            utils.logError('使用降级方案', e);
            return typeof fallbackFn === 'function' ? fallbackFn() : fallbackFn;
        }
    },
    
    parseMultiReply(text, count) {
        if (!text) return [];
        return text.split(/\d+\.|[•\-\n]/g)
            .map(s => s.trim())
            .filter(s => s.length > 3)
            .slice(0, count);
    }
};

// ==================== 角色和聊天管理 ====================
const chatManager = {
    getCharacter() {
        try {
            const ctx = getContext();
            let char = null;
            
            if (ctx.characterId && ctx.characters) {
                char = ctx.characters[ctx.characterId];
            } else if (ctx.character) {
                char = ctx.character;
            } else if (ctx.selectedCharacter) {
                char = ctx.selectedCharacter;
            }
            
            if (!char?.name) return null;
            
            const charData = char.data || char;
            return {
                id: ctx.characterId,
                name: char.name,
                desc: charData.description || '',
                personality: charData.personality || '',
                scenario: charData.scenario || '',
                firstMes: charData.first_mes || '',
                mesExample: charData.mes_example || '',
                worldInfo: charData.world_info || ''
            };
        } catch (e) {
            utils.logError('获取角色失败', e);
            return null;
        }
    },
    
    getRecentMessages(limit = 20) {
        try {
            const ctx = getContext();
            return (ctx?.chat || []).slice(-limit).map(m => ({
                name: m.name,
                content: m.mes,
                isUser: m.is_user
            }));
        } catch (e) {
            return [];
        }
    },
    
    sendMessage(text) {
        if (!text) return;
        
        const inputArea = document.querySelector('#send_textarea, #prompt_textarea');
        if (inputArea) {
            inputArea.value = text;
            inputArea.focus();
            
            const sendBtn = document.querySelector('#send_but');
            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
            } else {
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                });
                inputArea.dispatchEvent(enterEvent);
            }
            
            if (extension_settings[EXTENSION_NAME]?.autoReturn) {
                setTimeout(() => ui.showMainView(), 300);
            }
        }
    },
    
    copyToClipboard(text) {
        if (!text) return;
        navigator.clipboard.writeText(text)
            .then(() => {
                if (window.toastr) window.toastr.success('已复制');
            })
            .catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                if (window.toastr) window.toastr.success('已复制');
            });
    }
};

// ==================== UI组件 ====================
const ui = {
    createToolbar() {
        return `
            <div id="smart-toolbar-container">
                <div class="smart-toolbar-glow"></div>
                <div class="smart-toolbar-bg"></div>
                <div class="smart-toolbar-border"></div>
                
                <!-- 主视图 -->
                <div id="smart-toolbar-main" class="smart-toolbar-view active">
                    <div class="smart-toolbar-header">
                        <span class="toolbar-label">🎯 智慧触控屏</span>
                        <span id="smart-toolbar-status" class="smart-toolbar-status">
                            <span class="status-dot"></span>
                            <span class="status-text">就绪</span>
                        </span>
                    </div>
                    <div class="smart-toolbar-buttons">
                        <button class="main-btn" data-action="quick-reply" title="快速回复">
                            <span class="btn-icon">💬</span>
                            <span class="btn-text">快速回复</span>
                        </button>
                        <button class="main-btn" data-action="worldbook" title="世界书管理">
                            <span class="btn-icon">📚</span>
                            <span class="btn-text">世界书</span>
                        </button>
                        <button class="main-btn" data-action="summary" title="对话总结">
                            <span class="btn-icon">📊</span>
                            <span class="btn-text">总结</span>
                        </button>
                        <button class="main-btn" data-action="analysis" title="角色分析">
                            <span class="btn-icon">🔍</span>
                            <span class="btn-text">分析</span>
                        </button>
                        <button class="main-btn" data-action="suggestion" title="剧情建议">
                            <span class="btn-icon">💡</span>
                            <span class="btn-text">建议</span>
                        </button>
                        <button id="toolbar-settings-btn" class="settings-btn" title="设置">⚙️</button>
                    </div>
                </div>
                
                <!-- 功能视图容器 -->
                <div id="smart-toolbar-function" class="smart-toolbar-view">
                    <div class="function-header">
                        <button id="toolbar-back-btn" class="back-btn">←</button>
                        <span id="toolbar-function-title" class="function-title">功能</span>
                        <div class="toolbar-loading" style="display:none;"></div>
                    </div>
                    <div id="smart-toolbar-content" class="smart-toolbar-content"></div>
                </div>
            </div>
        `;
    },
    
    showMainView() {
        appState.uiMode = 'main';
        document.getElementById('smart-toolbar-main').classList.add('active');
        document.getElementById('smart-toolbar-function').classList.remove('active');
        this.cleanupEventListeners();
    },
    
    showFunctionView(title) {
        appState.uiMode = 'function';
        document.getElementById('smart-toolbar-main').classList.remove('active');
        document.getElementById('smart-toolbar-function').classList.add('active');
        document.getElementById('toolbar-function-title').textContent = title;
    },
    
    updateStatus(loaded, charName = '') {
        const statusEl = document.getElementById('smart-toolbar-status');
        if (!statusEl) return;
        
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');
        
        if (loaded && charName) {
            dot.className = 'status-dot status-loaded';
            text.textContent = charName;
        } else {
            dot.className = 'status-dot';
            text.textContent = '就绪';
        }
    },
    
    setLoading(loading) {
        const loader = document.querySelector('.toolbar-loading');
        if (loader) {
            loader.style.display = loading ? 'block' : 'none';
        }
        appState.isLoading = loading;
    },
    
    cleanupEventListeners() {
        Object.keys(clickHandlers).forEach(key => {
            if (clickHandlers[key]) {
                document.removeEventListener('click', clickHandlers[key]);
                clickHandlers[key] = null;
            }
        });
    },
    
    renderQuickReplyContent() {
        const count = extension_settings[EXTENSION_NAME]?.genCount || 3;
        return `
            <div class="quick-reply-container">
                <div class="control-bar">
                    <select id="quick-reply-count" class="select-input">
                        <option value="2" ${count === 2 ? 'selected' : ''}>2条</option>
                        <option value="3" ${count === 3 ? 'selected' : ''}>3条</option>
                        <option value="5" ${count === 5 ? 'selected' : ''}>5条</option>
                    </select>
                    <button id="generate-quick-replies" class="action-btn primary">
                        <span class="btn-spinner" style="display:none;"></span>
                        <span class="btn-label">✨ 生成回复</span>
                    </button>
                </div>
                <div id="quick-reply-results" class="results-container"></div>
            </div>
        `;
    },
    
    renderQuickReplyResults(replies) {
        const container = document.getElementById('quick-reply-results');
        if (!container) return;
        
        let html = '';
        replies.forEach((reply, idx) => {
            html += `
                <div class="result-card">
                    <div class="card-number">#${idx + 1}</div>
                    <div class="card-content">${utils.escapeHtml(utils.truncate(reply, 120))}</div>
                    <div class="card-actions">
                        <button class="mini-btn send-btn" data-index="${idx}">发送</button>
                        <button class="mini-btn copy-btn" data-index="${idx}">复制</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    },
    
    renderWorldbookContent() {
        return `
            <div class="worldbook-container">
                <div class="control-bar">
                    <button id="generate-worldbook" class="action-btn primary">
                        <span class="btn-spinner" style="display:none;"></span>
                        <span class="btn-label">📝 生成条目</span>
                    </button>
                    <button id="save-worldbook" class="action-btn secondary" disabled>💾 保存</button>
                </div>
                <div id="worldbook-results" class="results-container"></div>
            </div>
        `;
    },
    
    renderWorldbookEntry(entry) {
        const container = document.getElementById('worldbook-results');
        if (!container) return;
        
        container.innerHTML = `
            <div class="worldbook-card">
                <div class="wb-header">
                    <span class="wb-title">${utils.escapeHtml(entry.name)}</span>
                    <span class="wb-badge">自动生成</span>
                </div>
                <div class="wb-keywords">🏷️ ${utils.escapeHtml(entry.keywords.join(' · '))}</div>
                <div class="wb-content">${utils.escapeHtml(entry.content)}</div>
            </div>
        `;
    },
    
    renderSummaryContent() {
        return `
            <div class="summary-container">
                <div class="control-bar">
                    <button id="generate-summary" class="action-btn primary">
                        <span class="btn-spinner" style="display:none;"></span>
                        <span class="btn-label">📊 生成总结</span>
                    </button>
                </div>
                <div id="summary-result" class="results-container"></div>
            </div>
        `;
    },
    
    renderSummaryResult(text) {
        const container = document.getElementById('summary-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-header">
                    <span class="summary-icon">📊</span>
                    <span class="summary-label">对话总结</span>
                    <span class="summary-time">${utils.getTimestamp()}</span>
                </div>
                <div class="summary-text">${utils.escapeHtml(text)}</div>
                <div class="summary-actions">
                    <button id="use-summary" class="mini-btn">使用</button>
                    <button id="copy-summary" class="mini-btn">复制</button>
                </div>
            </div>
        `;
    },
    
    renderAnalysisContent() {
        return `
            <div class="analysis-container">
                <div class="control-bar">
                    <button id="generate-analysis" class="action-btn primary">
                        <span class="btn-spinner" style="display:none;"></span>
                        <span class="btn-label">🔍 分析角色</span>
                    </button>
                </div>
                <div id="analysis-result" class="results-container"></div>
            </div>
        `;
    },
    
    renderAnalysisResult(char, analysisText) {
        const container = document.getElementById('analysis-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="analysis-card">
                <div class="analysis-header">
                    <div class="analysis-name">${utils.escapeHtml(char.name)}</div>
                    <div class="analysis-badge">AI分析</div>
                </div>
                <div class="analysis-content">${utils.escapeHtml(analysisText)}</div>
                <div class="analysis-actions">
                    <button id="copy-analysis" class="mini-btn">复制分析</button>
                </div>
            </div>
        `;
    },
    
    renderSuggestionContent() {
        return `
            <div class="suggestion-container">
                <div class="control-bar">
                    <button id="generate-suggestion" class="action-btn primary">
                        <span class="btn-spinner" style="display:none;"></span>
                        <span class="btn-label">💡 剧情建议</span>
                    </button>
                </div>
                <div id="suggestion-result" class="results-container"></div>
            </div>
        `;
    },
    
    renderSuggestionResult(text) {
        const container = document.getElementById('suggestion-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="suggestion-card">
                <div class="suggestion-header">
                    <span class="suggestion-icon">💡</span>
                    <span class="suggestion-label">剧情建议</span>
                </div>
                <div class="suggestion-text">${utils.escapeHtml(text)}</div>
                <div class="suggestion-actions">
                    <button id="use-suggestion" class="mini-btn">使用</button>
                    <button id="copy-suggestion" class="mini-btn">复制</button>
                </div>
            </div>
        `;
    },
    
    renderError(msg) {
        return `
            <div class="error-box">
                <span class="error-icon">⚠️</span>
                <span class="error-text">${utils.escapeHtml(msg)}</span>
            </div>
        `;
    }
};

// ==================== 功能实现 ====================
const features = {
    async generateQuickReplies() {
        if (appState.isGenerating) return;
        
        const btn = document.getElementById('generate-quick-replies');
        const spinner = btn?.querySelector('.btn-spinner');
        const label = btn?.querySelector('.btn-label');
        const container = document.getElementById('quick-reply-results');
        
        appState.isGenerating = true;
        if (btn) btn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';
        if (label) label.textContent = '生成中...';
        
        try {
            const char = chatManager.getCharacter();
            const messages = chatManager.getRecentMessages(6);
            const count = parseInt(document.getElementById('quick-reply-count')?.value) || 3;
            
            const history = messages.map(m => `${m.name}: ${m.content}`).join('\n');
            const prompt = `作为${char?.name || 'AI'}，根据以下对话生成${count}条不同风格的回复选项，每行一条：\n${history}`;
            
            const fallback = () => {
                const replies = [];
                for (let i = 1; i <= count; i++) {
                    replies.push(`回复选项${i}：这里是模拟生成的回复内容...`);
                }
                return replies.join('\n');
            };
            
            const result = await api.generateWithFallback(prompt, fallback);
            appState.quickReplies = api.parseMultiReply(result, count);
            
            if (appState.quickReplies.length === 0) {
                for (let i = 1; i <= count; i++) {
                    appState.quickReplies.push(`回复选项${i}：${result.substring((i - 1) * 50, i * 50) || '...'}`);
                }
            }
            
            ui.renderQuickReplyResults(appState.quickReplies);
            
        } catch (e) {
            utils.logError('生成回复失败', e);
            if (container) container.innerHTML = ui.renderError('生成回复失败，请重试');
        } finally {
            appState.isGenerating = false;
            if (btn) btn.disabled = false;
            if (spinner) spinner.style.display = 'none';
            if (label) label.textContent = '✨ 生成回复';
        }
    },
    
    async generateWorldbookEntry() {
        if (appState.isGenerating) return;
        
        const btn = document.getElementById('generate-worldbook');
        const saveBtn = document.getElementById('save-worldbook');
        const container = document.getElementById('worldbook-results');
        
        appState.isGenerating = true;
        if (btn) btn.disabled = true;
        if (btn) btn.querySelector('.btn-spinner').style.display = 'inline-block';
        if (btn) btn.querySelector('.btn-label').textContent = '分析中...';
        
        try {
            const char = chatManager.getCharacter();
            const messages = chatManager.getRecentMessages(20);
            const names = new Set([char?.name || '主角']);
            
            messages.forEach(m => {
                const matches = m.content.match(/[A-Z][a-zA-Z]+|[一二三四五六七八九十百千万]+[号位人个]/g);
                if (matches) matches.forEach(name => name.length > 1 && names.add(name));
            });
            
            const nameList = Array.from(names).slice(0, 8);
            const chatText = messages.map(m => m.content).join('\n').substring(0, 800);
            
            const prompt = `根据对话生成一个世界书条目，包含角色简介：\n${chatText}`;
            const fallback = () => `出场人物：${nameList.join('、')}\n最近对话中出现的主要角色`;
            
            const content = await api.generateWithFallback(prompt, fallback);
            
            appState.worldbookEntries = [{
                name: `${char?.name || '角色'}世界书`,
                keywords: nameList,
                content
            }];
            
            ui.renderWorldbookEntry(appState.worldbookEntries[0]);
            if (saveBtn) saveBtn.disabled = false;
            
        } catch (e) {
            utils.logError('生成世界书失败', e);
            if (container) container.innerHTML = ui.renderError('生成条目失败');
        } finally {
            appState.isGenerating = false;
            if (btn) btn.disabled = false;
            if (btn) btn.querySelector('.btn-spinner').style.display = 'none';
            if (btn) btn.querySelector('.btn-label').textContent = '📝 生成条目';
        }
    },
    
    async saveWorldbookEntry() {
        if (appState.worldbookEntries.length === 0) return;
        
        try {
            if (window.createWorldEntry) {
                appState.worldbookEntries.forEach(entry => {
                    window.createWorldEntry({
                        name: entry.name,
                        content: entry.content,
                        keywords: entry.keywords
                    });
                });
                if (window.toastr) window.toastr.success('已保存到世界书！');
            } else {
                chatManager.copyToClipboard(JSON.stringify(appState.worldbookEntries, null, 2));
            }
        } catch (e) {
            utils.logError('保存失败', e);
            if (window.toastr) window.toastr.error('保存失败');
        }
    },
    
    async generateSummary() {
        if (appState.isGenerating) return;
        
        const btn = document.getElementById('generate-summary');
        const container = document.getElementById('summary-result');
        
        appState.isGenerating = true;
        if (btn) btn.disabled = true;
        if (btn) btn.querySelector('.btn-spinner').style.display = 'inline-block';
        if (btn) btn.querySelector('.btn-label').textContent = '总结中...';
        
        try {
            const messages = chatManager.getRecentMessages(15);
            const chatText = messages.map(m => m.content).join('\n');
            
            const prompt = `总结以下对话的关键内容，简洁明了：\n${chatText}`;
            const fallback = () => '这是当前对话的简要总结...';
            
            const summary = await api.generateWithFallback(prompt, fallback);
            appState.summaryText = summary;
            ui.renderSummaryResult(summary);
            
        } catch (e) {
            utils.logError('生成总结失败', e);
            if (container) container.innerHTML = ui.renderError('生成总结失败');
        } finally {
            appState.isGenerating = false;
            if (btn) btn.disabled = false;
            if (btn) btn.querySelector('.btn-spinner').style.display = 'none';
            if (btn) btn.querySelector('.btn-label').textContent = '📊 生成总结';
        }
    },
    
    async generateAnalysis() {
        if (appState.isGenerating) return;
        
        const btn = document.getElementById('generate-analysis');
        const container = document.getElementById('analysis-result');
        
        appState.isGenerating = true;
        if (btn) btn.disabled = true;
        if (btn) btn.querySelector('.btn-spinner').style.display = 'inline-block';
        if (btn) btn.querySelector('.btn-label').textContent = '分析中...';
        
        try {
            const char = chatManager.getCharacter();
            if (!char) {
                if (container) container.innerHTML = ui.renderError('未加载角色');
                return;
            }
            
            const messages = chatManager.getRecentMessages(8);
            const chatText = messages.map(m => m.content).join('\n');
            
            const prompt = `分析${char.name}的性格特点：\n设定：${char.personality || char.desc}\n对话：${chatText}\n简洁分析`;
            const fallback = () => `${char.name}的性格分析结果...`;
            
            const analysis = await api.generateWithFallback(prompt, fallback);
            appState.analysis = { char, text: analysis };
            ui.renderAnalysisResult(char, analysis);
            
        } catch (e) {
            utils.logError('分析失败', e);
            if (container) container.innerHTML = ui.renderError('分析失败');
        } finally {
            appState.isGenerating = false;
            if (btn) btn.disabled = false;
            if (btn) btn.querySelector('.btn-spinner').style.display = 'none';
            if (btn) btn.querySelector('.btn-label').textContent = '🔍 分析角色';
        }
    },
    
    async generateSuggestion() {
        if (appState.isGenerating) return;
        
        const btn = document.getElementById('generate-suggestion');
        const container = document.getElementById('suggestion-result');
        
        appState.isGenerating = true;
        if (btn) btn.disabled = true;
        if (btn) btn.querySelector('.btn-spinner').style.display = 'inline-block';
        if (btn) btn.querySelector('.btn-label').textContent = '思考中...';
        
        try {
            const messages = chatManager.getRecentMessages(8);
            const chatText = messages.map(m => m.content).join('\n');
            
            const prompt = `基于对话给出剧情发展建议：\n${chatText}`;
            const fallback = () => '推动剧情发展的建议...';
            
            const suggestion = await api.generateWithFallback(prompt, fallback);
            appState.suggestionText = suggestion;
            ui.renderSuggestionResult(suggestion);
            
        } catch (e) {
            utils.logError('建议生成失败', e);
            if (container) container.innerHTML = ui.renderError('生成建议失败');
        } finally {
            appState.isGenerating = false;
            if (btn) btn.disabled = false;
            if (btn) btn.querySelector('.btn-spinner').style.display = 'none';
            if (btn) btn.querySelector('.btn-label').textContent = '💡 剧情建议';
        }
    }
};

// ==================== 事件绑定 ====================
const events = {
    bindMainButtons() {
        document.querySelectorAll('.main-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleMainAction(action);
            });
        });
        
        document.getElementById('toolbar-settings-btn')?.addEventListener('click', () => {
            if (typeof toastr !== 'undefined') {
                toastr.info('设置功能开发中...');
            }
        });
        
        document.getElementById('toolbar-back-btn')?.addEventListener('click', () => {
            ui.showMainView();
        });
    },
    
    handleMainAction(action) {
        ui.cleanupEventListeners();
        const contentEl = document.getElementById('smart-toolbar-content');
        
        switch (action) {
            case 'quick-reply':
                ui.showFunctionView('💬 快速回复');
                contentEl.innerHTML = ui.renderQuickReplyContent();
                this.bindQuickReplyEvents();
                break;
            case 'worldbook':
                ui.showFunctionView('📚 世界书管理');
                contentEl.innerHTML = ui.renderWorldbookContent();
                this.bindWorldbookEvents();
                break;
            case 'summary':
                ui.showFunctionView('📊 对话总结');
                contentEl.innerHTML = ui.renderSummaryContent();
                this.bindSummaryEvents();
                break;
            case 'analysis':
                ui.showFunctionView('🔍 角色分析');
                contentEl.innerHTML = ui.renderAnalysisContent();
                this.bindAnalysisEvents();
                break;
            case 'suggestion':
                ui.showFunctionView('💡 剧情建议');
                contentEl.innerHTML = ui.renderSuggestionContent();
                this.bindSuggestionEvents();
                break;
        }
    },
    
    bindQuickReplyEvents() {
        document.getElementById('generate-quick-replies')?.addEventListener('click', () => {
            features.generateQuickReplies();
        });
        
        document.getElementById('quick-reply-count')?.addEventListener('change', (e) => {
            extension_settings[EXTENSION_NAME].genCount = parseInt(e.target.value);
            saveSettingsDebounced();
        });
        
        clickHandlers.quickReplyHandler = (e) => {
            if (e.target.classList.contains('send-btn')) {
                const idx = parseInt(e.target.dataset.index);
                if (!isNaN(idx) && appState.quickReplies[idx]) {
                    chatManager.sendMessage(appState.quickReplies[idx]);
                }
            }
            if (e.target.classList.contains('copy-btn')) {
                const idx = parseInt(e.target.dataset.index);
                if (!isNaN(idx) && appState.quickReplies[idx]) {
                    chatManager.copyToClipboard(appState.quickReplies[idx]);
                }
            }
        };
        document.addEventListener('click', clickHandlers.quickReplyHandler);
    },
    
    bindWorldbookEvents() {
        document.getElementById('generate-worldbook')?.addEventListener('click', () => {
            features.generateWorldbookEntry();
        });
        
        document.getElementById('save-worldbook')?.addEventListener('click', () => {
            features.saveWorldbookEntry();
        });
    },
    
    bindSummaryEvents() {
        document.getElementById('generate-summary')?.addEventListener('click', () => {
            features.generateSummary();
        });
        
        clickHandlers.summaryHandler = (e) => {
            if (e.target.id === 'use-summary' && appState.summaryText) {
                chatManager.sendMessage(appState.summaryText);
            }
            if (e.target.id === 'copy-summary' && appState.summaryText) {
                chatManager.copyToClipboard(appState.summaryText);
            }
        };
        document.addEventListener('click', clickHandlers.summaryHandler);
    },
    
    bindAnalysisEvents() {
        document.getElementById('generate-analysis')?.addEventListener('click', () => {
            features.generateAnalysis();
        });
        
        clickHandlers.analysisHandler = (e) => {
            if (e.target.id === 'copy-analysis' && appState.analysis?.text) {
                chatManager.copyToClipboard(appState.analysis.text);
            }
        };
        document.addEventListener('click', clickHandlers.analysisHandler);
    },
    
    bindSuggestionEvents() {
        document.getElementById('generate-suggestion')?.addEventListener('click', () => {
            features.generateSuggestion();
        });
        
        clickHandlers.suggestionHandler = (e) => {
            if (e.target.id === 'use-suggestion' && appState.suggestionText) {
                chatManager.sendMessage(appState.suggestionText);
            }
            if (e.target.id === 'copy-suggestion' && appState.suggestionText) {
                chatManager.copyToClipboard(appState.suggestionText);
            }
        };
        document.addEventListener('click', clickHandlers.suggestionHandler);
    },
    
    bindChatEvents() {
        const handlers = () => {
            const char = chatManager.getCharacter();
            if (char) {
                appState.currentCharacter = char;
                ui.updateStatus(true, char.name);
            }
        };
        
        ['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'CHARACTER_CHANGED', 
         'CHARACTER_LOADED', 'CHARACTER_SELECTED', 'GROUP_CHANGED'].forEach(evt => {
            if (event_types[evt]) {
                eventSource.on(event_types[evt], utils.debounce(handlers, 200));
            }
        });
    }
};

// ==================== 设置管理 ====================
const settings = {
    async load() {
        extension_settings[EXTENSION_NAME] = extension_settings[EXTENSION_NAME] || {};
        Object.keys(DEFAULT_SETTINGS).forEach(key => {
            if (extension_settings[EXTENSION_NAME][key] === undefined) {
                extension_settings[EXTENSION_NAME][key] = DEFAULT_SETTINGS[key];
            }
        });
    },
    
    updateVisibility() {
        const container = document.getElementById('smart-toolbar-container');
        if (container) {
            container.style.display = extension_settings[EXTENSION_NAME]?.enabled ? 'block' : 'none';
        }
    },
    
    async initSettingsUI() {
        try {
            const settingsHTML = await fetch(`${EXTENSION_FOLDER}/settings.html`).then(r => r.text());
            document.getElementById('extensions_settings')?.insertAdjacentHTML('beforeend', settingsHTML);
            
            // 绑定设置事件
            const enabledCheckbox = document.getElementById('st-toolbar-enabled');
            if (enabledCheckbox) {
                enabledCheckbox.checked = extension_settings[EXTENSION_NAME].enabled;
                enabledCheckbox.addEventListener('input', function() {
                    extension_settings[EXTENSION_NAME].enabled = this.checked;
                    saveSettingsDebounced();
                    settings.updateVisibility();
                });
            }
        } catch (e) {
            utils.logError('加载设置UI失败', e);
        }
    }
};

// ==================== 初始化 ====================
jQuery(async () => {
    utils.logInfo('智慧触控屏初始化中...');
    
    await settings.load();
    await settings.initSettingsUI();
    
    // 注入工具栏
    const sendForm = document.querySelector('#send_form');
    if (sendForm) {
        sendForm.insertAdjacentHTML('beforebegin', ui.createToolbar());
        
        setTimeout(() => {
            events.bindMainButtons();
            events.bindChatEvents();
            
            // 初始加载角色
            const char = chatManager.getCharacter();
            if (char) {
                appState.currentCharacter = char;
                ui.updateStatus(true, char.name);
            }
            
            utils.logInfo('初始化完成！🚀');
        }, 100);
    } else {
        utils.logError('找不到发送表单');
    }
    
    // 延迟加载尝试
    [500, 1500, 3000].forEach(delay => {
        setTimeout(() => {
            const char = chatManager.getCharacter();
            if (char) {
                appState.currentCharacter = char;
                ui.updateStatus(true, char.name);
            }
        }, delay);
    });
});
