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
    showAnimations: true,
    quickReplyCount: 3,
    maxHistoryLength: 50
};

// ==================== 动画配置 ====================
const ANIMATION_CONFIG = {
    rippleDelay: 5000,
    pulseDuration: 2000,
    hoverTransition: 300
};

// ==================== 状态管理 ====================
let appState = {
    currentCharacter: null,
    isLoading: false,
    uiMode: 'main',
    quickReplies: [],
    summaryText: '',
    analysis: {},
    suggestionText: '',
    polishedText: '',
    continuedText: ''
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
            minute: '2-digit' 
        });
    },
    
    generateId() {
        return Math.random().toString(36).substr(2, 9);
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
        return text.split(/\d+\.|[•\-*]\s*/g)
            .map(s => s.trim())
            .filter(s => s.length > 3)
            .slice(0, count);
    }
};

// ==================== 动画控制器 ====================
const animationController = {
    createDynamicRipple() {
        const container = document.querySelector('.toolbar-ripple-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        for (let i = 0; i < 3; i++) {
            const ripple = document.createElement('div');
            ripple.className = 'toolbar-ripple';
            ripple.style.animationDelay = `${i * 1.8}s`;
            
            const top = 20 + Math.random() * 60;
            const left = 20 + Math.random() * 60;
            ripple.style.top = `${top}%`;
            ripple.style.left = `${left}%`;
            
            container.appendChild(ripple);
        }
    },

    addButtonHoverEffects() {
        const buttons = document.querySelectorAll('.action-card, .primary-btn, .secondary-btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.02) translateY(-2px)';
            });
            
            btn.addEventListener('mouseleave', function() {
                this.style.transform = '';
            });
            
            btn.addEventListener('mousedown', function() {
                this.style.transform = 'scale(0.98)';
            });
            
            btn.addEventListener('mouseup', function() {
                this.style.transform = 'scale(1.02) translateY(-2px)';
            });
        });
    },

    animateViewTransition(fromView, toView) {
        if (fromView) {
            fromView.classList.remove('active');
            fromView.style.opacity = '0';
            fromView.style.transform = 'translateX(-20px)';
        }
        
        if (toView) {
            toView.style.opacity = '0';
            toView.style.transform = 'translateX(20px)';
            toView.classList.add('active');
            
            void toView.offsetWidth;
            
            toView.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            toView.style.opacity = '1';
            toView.style.transform = 'translateX(0)';
        }
    },

    initAppleWatchScrollEffect() {
        const grid = document.querySelector('.action-grid');
        if (!grid) return;
        
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;
        
        const updateActiveButton = () => {
            const buttons = grid.querySelectorAll('.action-mini');
            const gridRect = grid.getBoundingClientRect();
            const centerX = gridRect.left + gridRect.width / 2;
            
            let closestButton = null;
            let closestDistance = Infinity;
            
            buttons.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                const btnCenterX = rect.left + rect.width / 2;
                const distance = Math.abs(centerX - btnCenterX);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestButton = btn;
                }
                
                const opacity = Math.max(0.7, 1 - distance / 200);
                const scale = Math.max(0.9, 1.2 - distance / 400);
                
                btn.style.transform = `scale(${scale})`;
                btn.style.opacity = opacity;
                btn.classList.remove('active');
            });
            
            if (closestButton) {
                closestButton.classList.add('active');
            }
        };
        
        grid.addEventListener('scroll', utils.debounce(updateActiveButton, 10));
        
        grid.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.pageX - grid.offsetLeft;
            scrollLeft = grid.scrollLeft;
            grid.style.cursor = 'grabbing';
        });
        
        grid.addEventListener('mouseleave', () => {
            isDragging = false;
            grid.style.cursor = 'grab';
        });
        
        grid.addEventListener('mouseup', () => {
            isDragging = false;
            grid.style.cursor = 'grab';
        });
        
        grid.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - grid.offsetLeft;
            const walk = (x - startX) * 1.5;
            grid.scrollLeft = scrollLeft - walk;
        });
        
        grid.addEventListener('touchstart', (e) => {
            isDragging = true;
            startX = e.touches[0].pageX - grid.offsetLeft;
            scrollLeft = grid.scrollLeft;
        });
        
        grid.addEventListener('touchend', () => {
            isDragging = false;
        });
        
        grid.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const x = e.touches[0].pageX - grid.offsetLeft;
            const walk = (x - startX) * 1.5;
            grid.scrollLeft = scrollLeft - walk;
        });
        
        setTimeout(updateActiveButton, 100);
    }
};

// ==================== 聊天管理 ====================
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
                firstMes: charData.first_mes || ''
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
            }
            
            if (extension_settings[EXTENSION_NAME]?.autoReturn) {
                setTimeout(() => ui.showMainView(), 300);
            }
        }
    },
    
    copyToClipboard(text) {
        if (!text) return;
        navigator.clipboard.writeText(text)
            .then(() => window.toastr?.success('已复制'))
            .catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                window.toastr?.success('已复制');
            });
    }
};

// ==================== UI组件 ====================
const ui = {
    createToolbar() {
        return `
            <div id="smart-toolbar-container">
                <!-- 动态背景层 -->
                <div class="toolbar-bg-layer"></div>
                <div class="toolbar-glow-layer"></div>
                <div class="toolbar-gradient-border"></div>
                
                <!-- 水波纹效果 -->
                <div class="toolbar-ripple-container">
                    <div class="toolbar-ripple"></div>
                    <div class="toolbar-ripple"></div>
                    <div class="toolbar-ripple"></div>
                </div>
                
                <!-- 主视图 -->
                <div id="toolbar-main" class="toolbar-view active">
                    <div class="toolbar-header">
                        <div class="brand-section">
                            <div class="brand-icon-wrapper">
                                <span class="brand-icon">&#9679;</span>
                                <div class="brand-pulse"></div>
                            </div>
                            <div class="brand-text-section">
                                <span class="brand-title">智慧触控屏</span>
                                <span class="brand-subtitle">Smart Toolbar</span>
                            </div>
                        </div>
                        
                        <div class="header-controls">
                            <div id="toolbar-status" class="status-indicator-container">
                                <div class="status-ring">
                                    <div class="status-dot"></div>
                                </div>
                                <span class="status-text">就绪</span>
                            </div>
                            <button id="toolbar-settings" class="settings-btn" title="设置">
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                    <path fill="currentColor" d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.39-1.08-.7-1.66-.94l-.38-2.65c-.03-.24-.24-.42-.48-.42h-4c-.24 0-.45.18-.48.42l-.38 2.65c-.58.24-1.14.55-1.66.94l-2.49-1c-.22-.08-.49 0-.61.22l-2 3.46c-.12.22-.07.49.12.64l2.11 1.65c-.04.32-.07.64-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.39 1.08.7 1.66.94l.38 2.65c.03.24.24.42.48.42h4c.24 0 .45-.18.48-.42l.38-2.65c.58-.24 1.14-.55 1.66-.94l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-7.43 2.52c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="toolbar-content">
                        <div class="main-action-row">
                            <button class="action-card main-action" data-action="quick-reply">
                                <div class="action-icon-wrapper">
                                    <span class="action-icon">&#9654;</span>
                                    <div class="icon-glow"></div>
                                </div>
                                <div class="action-info">
                                    <span class="action-title">快速回复</span>
                                    <span class="action-desc">生成多条可选回复</span>
                                </div>
                                <div class="action-arrow">&#8594;</div>
                            </button>
                        </div>
                        
                        <div class="action-grid">
                            <button class="action-mini" data-action="polish">
                                <span class="mini-icon">&#10022;</span>
                                <span class="mini-label">润色</span>
                            </button>
                            <button class="action-mini" data-action="continue">
                                <span class="mini-icon">&#9998;</span>
                                <span class="mini-label">续写</span>
                            </button>
                            <button class="action-mini" data-action="worldbook">
                                <span class="mini-icon">&#128218;</span>
                                <span class="mini-label">世界书</span>
                            </button>
                            <button class="action-mini" data-action="summary">
                                <span class="mini-icon">&#9776;</span>
                                <span class="mini-label">总结</span>
                            </button>
                            <button class="action-mini" data-action="analysis">
                                <span class="mini-icon">&#9673;</span>
                                <span class="mini-label">分析</span>
                            </button>
                            <button class="action-mini" data-action="suggestion">
                                <span class="mini-icon">&#9888;</span>
                                <span class="mini-label">建议</span>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- 功能视图 -->
                <div id="toolbar-function" class="toolbar-view">
                    <div class="function-header">
                        <button id="function-back" class="back-btn">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                        </button>
                        <span id="function-title" class="function-title">功能</span>
                        <div id="function-loader" class="function-loader" style="display:none;"></div>
                    </div>
                    <div id="function-content" class="function-content"></div>
                </div>
            </div>
        `;
    },
    
    showMainView() {
        appState.uiMode = 'main';
        document.getElementById('toolbar-main').classList.add('active');
        document.getElementById('toolbar-function').classList.remove('active');
    },
    
    showFunctionView(title) {
        appState.uiMode = 'function';
        document.getElementById('toolbar-main').classList.remove('active');
        document.getElementById('toolbar-function').classList.add('active');
        document.getElementById('function-title').textContent = title;
    },
    
    updateStatus(loaded, charName = '') {
        const statusEl = document.getElementById('toolbar-status');
        if (!statusEl) return;
        
        const dot = statusEl.querySelector('.status-dot');
        const ring = statusEl.querySelector('.status-ring');
        const text = statusEl.querySelector('.status-text');
        
        if (loaded && charName) {
            statusEl.classList.add('active');
            dot.classList.add('active');
            ring.classList.add('active');
            text.textContent = charName;
        } else {
            statusEl.classList.remove('active');
            dot.classList.remove('active');
            ring.classList.remove('active');
            text.textContent = '就绪';
        }
    },
    
    setLoading(loading) {
        const loader = document.getElementById('function-loader');
        if (loader) {
            loader.style.display = loading ? 'flex' : 'none';
        }
        appState.isLoading = loading;
    },
    
    // 功能页面渲染
    renderQuickReply() {
        const count = extension_settings[EXTENSION_NAME]?.genCount || 3;
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#9654;</span>
                    <span class="panel-title">快速回复</span>
                </div>
                <div class="panel-body">
                    <div class="control-row">
                        <select id="reply-count" class="styled-select">
                            <option value="2" ${count === 2 ? 'selected' : ''}>2条</option>
                            <option value="3" ${count === 3 ? 'selected' : ''}>3条</option>
                            <option value="5" ${count === 5 ? 'selected' : ''}>5条</option>
                        </select>
                        <button id="gen-reply-btn" class="primary-btn">
                            <span class="btn-text">生成回复</span>
                            <span class="btn-spinner" style="display:none;"></span>
                        </button>
                    </div>
                    <div id="reply-results" class="results-list"></div>
                </div>
            </div>
        `;
    },
    
    renderReplyResults(replies) {
        const container = document.getElementById('reply-results');
        if (!container) return;
        
        let html = replies.map((reply, idx) => `
            <div class="result-item" data-index="${idx}">
                <div class="result-number">${idx + 1}</div>
                <div class="result-content">${utils.escapeHtml(utils.truncate(reply, 150))}</div>
                <div class="result-actions">
                    <button class="result-btn send" data-index="${idx}">发送</button>
                    <button class="result-btn copy" data-index="${idx}">复制</button>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = html || '<div class="empty-state">点击生成按钮获取回复</div>';
    },
    
    renderPolish() {
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#10022;</span>
                    <span class="panel-title">对话润色</span>
                </div>
                <div class="panel-body">
                    <div class="control-row">
                        <select id="polish-style" class="styled-select">
                            <option value="formal">正式</option>
                            <option value="casual" selected>轻松</option>
                            <option value="literary">文艺</option>
                            <option value="humorous">幽默</option>
                        </select>
                        <button id="polish-btn" class="primary-btn">
                            <span class="btn-text">润色</span>
                            <span class="btn-spinner" style="display:none;"></span>
                        </button>
                    </div>
                    <div id="polish-result" class="result-card-container"></div>
                </div>
            </div>
        `;
    },
    
    renderPolishResult(text) {
        const container = document.getElementById('polish-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="result-card">
                <div class="card-header">
                    <span class="card-icon">&#10022;</span>
                    <span class="card-title">润色结果</span>
                </div>
                <div class="card-content">${utils.escapeHtml(text)}</div>
                <div class="card-actions">
                    <button id="use-polish">使用</button>
                    <button id="copy-polish">复制</button>
                </div>
            </div>
        `;
    },
    
    renderContinue() {
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#9998;</span>
                    <span class="panel-title">续写故事</span>
                </div>
                <div class="panel-body">
                    <div class="control-row">
                        <select id="continue-length" class="styled-select">
                            <option value="short">简短</option>
                            <option value="medium" selected>中等</option>
                            <option value="long">详细</option>
                        </select>
                        <button id="continue-btn" class="primary-btn">
                            <span class="btn-text">续写</span>
                            <span class="btn-spinner" style="display:none;"></span>
                        </button>
                    </div>
                    <div id="continue-result" class="result-card-container"></div>
                </div>
            </div>
        `;
    },
    
    renderContinueResult(text) {
        const container = document.getElementById('continue-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="result-card">
                <div class="card-header">
                    <span class="card-icon">&#9998;</span>
                    <span class="card-title">续写内容</span>
                </div>
                <div class="card-content">${utils.escapeHtml(text)}</div>
                <div class="card-actions">
                    <button id="use-continue">使用</button>
                    <button id="copy-continue">复制</button>
                </div>
            </div>
        `;
    },
    
    renderWorldbook() {
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#128218;</span>
                    <span class="panel-title">世界书管理</span>
                </div>
                <div class="panel-body">
                    <div class="control-row">
                        <button id="gen-worldbook" class="primary-btn">
                            <span class="btn-text">生成条目</span>
                            <span class="btn-spinner" style="display:none;"></span>
                        </button>
                        <button id="save-worldbook" class="secondary-btn" disabled>保存</button>
                    </div>
                    <div id="worldbook-result" class="result-card-container"></div>
                </div>
            </div>
        `;
    },
    
    renderWorldbookEntry(entry) {
        const container = document.getElementById('worldbook-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="worldbook-card">
                <div class="card-header">
                    <span class="card-icon">&#128218;</span>
                    <span class="card-title">${utils.escapeHtml(entry.name)}</span>
                    <span class="card-badge">自动生成</span>
                </div>
                <div class="card-keywords">&#128278; ${utils.escapeHtml(entry.keywords.join(' · '))}</div>
                <div class="card-content">${utils.escapeHtml(entry.content)}</div>
                <div class="card-actions">
                    <button id="save-worldbook-entry">保存到世界书</button>
                    <button id="copy-worldbook">复制</button>
                </div>
            </div>
        `;
    },
    
    renderSummary() {
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#9776;</span>
                    <span class="panel-title">对话总结</span>
                </div>
                <div class="panel-body">
                    <button id="summary-btn" class="primary-btn full-width">
                        <span class="btn-text">生成总结</span>
                        <span class="btn-spinner" style="display:none;"></span>
                    </button>
                    <div id="summary-result" class="result-card-container"></div>
                </div>
            </div>
        `;
    },
    
    renderSummaryResult(text) {
        const container = document.getElementById('summary-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="result-card">
                <div class="card-header">
                    <span class="card-icon">&#9776;</span>
                    <span class="card-title">对话总结</span>
                    <span class="card-time">${utils.getTimestamp()}</span>
                </div>
                <div class="card-content">${utils.escapeHtml(text)}</div>
                <div class="card-actions">
                    <button id="use-summary">使用</button>
                    <button id="copy-summary">复制</button>
                </div>
            </div>
        `;
    },
    
    renderAnalysis() {
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#9673;</span>
                    <span class="panel-title">角色分析</span>
                </div>
                <div class="panel-body">
                    <button id="analysis-btn" class="primary-btn full-width">
                        <span class="btn-text">分析角色</span>
                        <span class="btn-spinner" style="display:none;"></span>
                    </button>
                    <div id="analysis-result" class="result-card-container"></div>
                </div>
            </div>
        `;
    },
    
    renderAnalysisResult(char, text) {
        const container = document.getElementById('analysis-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="result-card">
                <div class="card-header">
                    <span class="card-icon">&#9673;</span>
                    <span class="card-title">${utils.escapeHtml(char.name)}</span>
                    <span class="card-badge">AI分析</span>
                </div>
                <div class="card-content">${utils.escapeHtml(text)}</div>
                <div class="card-actions">
                    <button id="copy-analysis">复制分析</button>
                </div>
            </div>
        `;
    },
    
    renderSuggestion() {
        return `
            <div class="panel-container">
                <div class="panel-header">
                    <span class="panel-icon">&#9888;</span>
                    <span class="panel-title">剧情建议</span>
                </div>
                <div class="panel-body">
                    <button id="suggestion-btn" class="primary-btn full-width">
                        <span class="btn-text">获取建议</span>
                        <span class="btn-spinner" style="display:none;"></span>
                    </button>
                    <div id="suggestion-result" class="result-card-container"></div>
                </div>
            </div>
        `;
    },
    
    renderSuggestionResult(text) {
        const container = document.getElementById('suggestion-result');
        if (!container) return;
        
        container.innerHTML = `
            <div class="result-card">
                <div class="card-header">
                    <span class="card-icon">&#9888;</span>
                    <span class="card-title">剧情建议</span>
                </div>
                <div class="card-content">${utils.escapeHtml(text)}</div>
                <div class="card-actions">
                    <button id="use-suggestion">使用</button>
                    <button id="copy-suggestion">复制</button>
                </div>
            </div>
        `;
    },
    
    renderError(msg) {
        return `<div class="error-message">&#9888; ${utils.escapeHtml(msg)}</div>`;
    }
};

// ==================== 功能实现 ====================
const features = {
    async generateQuickReplies() {
        const btn = document.getElementById('gen-reply-btn');
        const spinner = btn?.querySelector('.btn-spinner');
        const label = btn?.querySelector('.btn-text');
        const container = document.getElementById('reply-results');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';
        if (label) label.textContent = '生成中...';
        
        try {
            const char = chatManager.getCharacter();
            const messages = chatManager.getRecentMessages(6);
            const count = parseInt(document.getElementById('reply-count')?.value) || 3;
            
            const history = messages.map(m => `${m.name}: ${m.content}`).join('\n');
            const prompt = `作为${char?.name || 'AI'}，根据以下对话生成${count}条不同风格的回复选项：\n${history}`;
            
            const fallback = () => {
                const replies = [];
                for (let i = 1; i <= count; i++) {
                    replies.push(`这是第${i}条回复选项，根据上下文生成的合适回应...`);
                }
                return replies.join('\n');
            };
            
            const result = await api.generateWithFallback(prompt, fallback);
            appState.quickReplies = api.parseMultiReply(result, count);
            
            if (appState.quickReplies.length === 0) {
                appState.quickReplies = result.split('\n').filter(s => s.trim()).slice(0, count);
            }
            
            ui.renderReplyResults(appState.quickReplies);
            
        } catch (e) {
            utils.logError('生成回复失败', e);
            if (container) container.innerHTML = ui.renderError('生成失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            if (spinner) spinner.style.display = 'none';
            if (label) label.textContent = '生成回复';
        }
    },
    
    async generatePolish() {
        const btn = document.getElementById('polish-btn');
        const container = document.getElementById('polish-result');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.querySelector('.btn-text').textContent = '润色中...';
        
        try {
            const messages = chatManager.getRecentMessages(3);
            if (messages.length === 0) {
                if (container) container.innerHTML = ui.renderError('无对话记录');
                return;
            }
            
            const lastMessage = messages[messages.length - 1].content;
            const style = document.getElementById('polish-style')?.value || 'casual';
            
            const styleMap = {
                formal: '正式、礼貌的语气',
                casual: '轻松、自然的语气',
                literary: '文艺、优美的风格',
                humorous: '幽默、有趣的风格'
            };
            
            const prompt = `将以下文本润色为${styleMap[style]}：\n${lastMessage}`;
            const result = await api.generateWithFallback(prompt, () => `润色后的内容：${lastMessage}`);
            
            appState.polishedText = result;
            ui.renderPolishResult(result);
            
        } catch (e) {
            utils.logError('润色失败', e);
            if (container) container.innerHTML = ui.renderError('润色失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = '润色';
        }
    },
    
    async generateContinue() {
        const btn = document.getElementById('continue-btn');
        const container = document.getElementById('continue-result');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.querySelector('.btn-text').textContent = '续写中...';
        
        try {
            const char = chatManager.getCharacter();
            const messages = chatManager.getRecentMessages(5);
            
            const chatText = messages.map(m => m.content).join('\n');
            const length = document.getElementById('continue-length')?.value || 'medium';
            
            const lengthMap = { short: '约50字', medium: '约100字', long: '约150字' };
            const prompt = `作为${char?.name || 'AI'}，续写以下故事${lengthMap[length]}：\n${chatText}`;
            
            const result = await api.generateWithFallback(prompt, () => '续写内容...');
            appState.continuedText = result;
            ui.renderContinueResult(result);
            
        } catch (e) {
            utils.logError('续写失败', e);
            if (container) container.innerHTML = ui.renderError('续写失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = '续写';
        }
    },
    
    async generateWorldbook() {
        const btn = document.getElementById('gen-worldbook');
        const saveBtn = document.getElementById('save-worldbook');
        const container = document.getElementById('worldbook-result');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.querySelector('.btn-text').textContent = '分析中...';
        
        try {
            const char = chatManager.getCharacter();
            const messages = chatManager.getRecentMessages(20);
            
            const names = new Set([char?.name || '角色']);
            messages.forEach(m => {
                const matches = m.content.match(/[A-Z][a-zA-Z]+|[\u4e00-\u9fa5]{2,}/g);
                if (matches) matches.forEach(name => name.length > 1 && names.add(name));
            });
            
            const chatText = messages.map(m => m.content).join('\n').substring(0, 800);
            const prompt = `根据对话生成世界书条目：\n${chatText}`;
            
            const result = await api.generateWithFallback(prompt, () => `角色简介：${char?.name || '未知'}`);
            
            const entry = {
                name: `${char?.name || '角色'}世界书`,
                keywords: Array.from(names).slice(0, 6),
                content: result
            };
            
            ui.renderWorldbookEntry(entry);
            if (saveBtn) saveBtn.disabled = false;
            
        } catch (e) {
            utils.logError('生成世界书失败', e);
            if (container) container.innerHTML = ui.renderError('生成失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = '生成条目';
        }
    },
    
    saveWorldbookEntry() {
        const container = document.getElementById('worldbook-result');
        const entry = container?.querySelector('.worldbook-card');
        
        if (!entry) return;
        
        const name = entry.querySelector('.card-title')?.textContent || '';
        const content = entry.querySelector('.card-content')?.textContent || '';
        const keywords = entry.querySelector('.card-keywords')?.textContent || '';
        
        try {
            if (window.createWorldEntry) {
                window.createWorldEntry({ name, content, keywords: keywords.split(' · ') });
                window.toastr?.success('已保存');
            } else {
                chatManager.copyToClipboard(JSON.stringify({ name, content, keywords }, null, 2));
            }
        } catch (e) {
            utils.logError('保存失败', e);
            window.toastr?.error('保存失败');
        }
    },
    
    async generateSummary() {
        const btn = document.getElementById('summary-btn');
        const container = document.getElementById('summary-result');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.querySelector('.btn-text').textContent = '总结中...';
        
        try {
            const messages = chatManager.getRecentMessages(15);
            const chatText = messages.map(m => m.content).join('\n');
            const prompt = `总结以下对话，简洁明了（100字以内）：\n${chatText}`;
            
            const result = await api.generateWithFallback(prompt, () => '对话总结...');
            appState.summaryText = result;
            ui.renderSummaryResult(result);
            
        } catch (e) {
            utils.logError('总结失败', e);
            if (container) container.innerHTML = ui.renderError('总结失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = '生成总结';
        }
    },
    
    async generateAnalysis() {
        const btn = document.getElementById('analysis-btn');
        const container = document.getElementById('analysis-result');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.querySelector('.btn-text').textContent = '分析中...';
        
        try {
            const char = chatManager.getCharacter();
            if (!char) {
                if (container) container.innerHTML = ui.renderError('未加载角色');
                return;
            }
            
            const messages = chatManager.getRecentMessages(8);
            const chatText = messages.map(m => m.content).join('\n');
            const prompt = `分析${char.name}的性格特点：\n设定：${char.personality}\n对话：${chatText}`;
            
            const result = await api.generateWithFallback(prompt, () => `${char.name}的性格分析...`);
            ui.renderAnalysisResult(char, result);
            
        } catch (e) {
            utils.logError('分析失败', e);
            if (container) container.innerHTML = ui.renderError('分析失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = '分析角色';
        }
    },
    
    async generateSuggestion() {
        const btn = document.getElementById('suggestion-btn');
        const container = document.getElementById('suggestion-result');
        
        if (appState.isLoading) return;
        appState.isLoading = true;
        
        if (btn) btn.disabled = true;
        btn.querySelector('.btn-spinner').style.display = 'inline-block';
        btn.querySelector('.btn-text').textContent = '思考中...';
        
        try {
            const messages = chatManager.getRecentMessages(8);
            const chatText = messages.map(m => m.content).join('\n');
            const prompt = `基于对话给出剧情发展建议（80字以内）：\n${chatText}`;
            
            const result = await api.generateWithFallback(prompt, () => '剧情建议...');
            appState.suggestionText = result;
            ui.renderSuggestionResult(result);
            
        } catch (e) {
            utils.logError('建议失败', e);
            if (container) container.innerHTML = ui.renderError('生成建议失败');
        } finally {
            appState.isLoading = false;
            if (btn) btn.disabled = false;
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = '获取建议';
        }
    }
};

// ==================== 事件绑定 ====================
const events = {
    bindMainButtons() {
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleAction(action);
            });
        });
        
        document.getElementById('toolbar-settings')?.addEventListener('click', () => {
            window.toastr?.info('设置功能开发中...');
        });
        
        document.getElementById('function-back')?.addEventListener('click', () => {
            ui.showMainView();
        });
    },
    
    handleAction(action) {
        const contentEl = document.getElementById('function-content');
        ui.showFunctionView(this.getActionTitle(action));
        
        switch (action) {
            case 'quick-reply':
                contentEl.innerHTML = ui.renderQuickReply();
                this.bindQuickReplyEvents();
                break;
            case 'polish':
                contentEl.innerHTML = ui.renderPolish();
                this.bindPolishEvents();
                break;
            case 'continue':
                contentEl.innerHTML = ui.renderContinue();
                this.bindContinueEvents();
                break;
            case 'worldbook':
                contentEl.innerHTML = ui.renderWorldbook();
                this.bindWorldbookEvents();
                break;
            case 'summary':
                contentEl.innerHTML = ui.renderSummary();
                this.bindSummaryEvents();
                break;
            case 'analysis':
                contentEl.innerHTML = ui.renderAnalysis();
                this.bindAnalysisEvents();
                break;
            case 'suggestion':
                contentEl.innerHTML = ui.renderSuggestion();
                this.bindSuggestionEvents();
                break;
        }
    },
    
    getActionTitle(action) {
        const titles = {
            'quick-reply': '快速回复',
            'polish': '对话润色',
            'continue': '续写故事',
            'worldbook': '世界书',
            'summary': '对话总结',
            'analysis': '角色分析',
            'suggestion': '剧情建议'
        };
        return titles[action] || action;
    },
    
    bindQuickReplyEvents() {
        document.getElementById('gen-reply-btn')?.addEventListener('click', () => {
            features.generateQuickReplies();
        });
        
        document.getElementById('reply-count')?.addEventListener('change', (e) => {
            extension_settings[EXTENSION_NAME].genCount = parseInt(e.target.value);
            saveSettingsDebounced();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.classList.contains('send')) {
                const idx = parseInt(e.target.dataset.index);
                if (!isNaN(idx) && appState.quickReplies[idx]) {
                    chatManager.sendMessage(appState.quickReplies[idx]);
                }
            }
            if (e.target.classList.contains('copy')) {
                const idx = parseInt(e.target.dataset.index);
                if (!isNaN(idx) && appState.quickReplies[idx]) {
                    chatManager.copyToClipboard(appState.quickReplies[idx]);
                }
            }
        });
    },
    
    bindPolishEvents() {
        document.getElementById('polish-btn')?.addEventListener('click', () => {
            features.generatePolish();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'use-polish') chatManager.sendMessage(appState.polishedText);
            if (e.target.id === 'copy-polish') chatManager.copyToClipboard(appState.polishedText);
        });
    },
    
    bindContinueEvents() {
        document.getElementById('continue-btn')?.addEventListener('click', () => {
            features.generateContinue();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'use-continue') chatManager.sendMessage(appState.continuedText);
            if (e.target.id === 'copy-continue') chatManager.copyToClipboard(appState.continuedText);
        });
    },
    
    bindWorldbookEvents() {
        document.getElementById('gen-worldbook')?.addEventListener('click', () => {
            features.generateWorldbook();
        });
        
        document.getElementById('save-worldbook')?.addEventListener('click', () => {
            features.saveWorldbookEntry();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'save-worldbook-entry') features.saveWorldbookEntry();
            if (e.target.id === 'copy-worldbook') {
                const content = document.querySelector('.worldbook-card .card-content')?.textContent;
                chatManager.copyToClipboard(content);
            }
        });
    },
    
    bindSummaryEvents() {
        document.getElementById('summary-btn')?.addEventListener('click', () => {
            features.generateSummary();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'use-summary') chatManager.sendMessage(appState.summaryText);
            if (e.target.id === 'copy-summary') chatManager.copyToClipboard(appState.summaryText);
        });
    },
    
    bindAnalysisEvents() {
        document.getElementById('analysis-btn')?.addEventListener('click', () => {
            features.generateAnalysis();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'copy-analysis') {
                const content = document.querySelector('.result-card .card-content')?.textContent;
                chatManager.copyToClipboard(content);
            }
        });
    },
    
    bindSuggestionEvents() {
        document.getElementById('suggestion-btn')?.addEventListener('click', () => {
            features.generateSuggestion();
        });
        
        document.addEventListener('click', function handler(e) {
            if (e.target.id === 'use-suggestion') chatManager.sendMessage(appState.suggestionText);
            if (e.target.id === 'copy-suggestion') chatManager.copyToClipboard(appState.suggestionText);
        });
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
            utils.logError('加载设置失败', e);
        }
    }
};

// ==================== 初始化 ====================
jQuery(async () => {
    utils.logInfo('智慧触控屏初始化...');
    
    await settings.load();
    await settings.initSettingsUI();
    
    const sendForm = document.querySelector('#send_form');
    if (sendForm) {
        // 找到聊天区域，在聊天消息和输入框之间插入工具栏
        const chatArea = document.querySelector('#chat') || document.querySelector('.chat_container') || sendForm.parentNode;
        
        // 创建工具栏容器
        const toolbarWrapper = document.createElement('div');
        toolbarWrapper.id = 'smart-toolbar-wrapper';
        toolbarWrapper.style.cssText = `
            position: relative;
            z-index: 99999;
            width: 100%;
            padding: 10px 0;
            clear: both;
            margin: 0;
        `;
        toolbarWrapper.innerHTML = ui.createToolbar();
        
        // 先尝试找到聊天区域的底部
        let insertTarget = sendForm;
        
        // 查找更合适的插入位置
        if (chatArea && chatArea !== sendForm.parentNode) {
            chatArea.appendChild(toolbarWrapper);
        } else {
            sendForm.parentNode.insertBefore(toolbarWrapper, sendForm);
        }
        
        // 给输入框增加顶部间距，确保不遮挡工具栏
        sendForm.style.marginTop = '100px';
        sendForm.style.paddingTop = '10px';
        
        setTimeout(() => {
            events.bindMainButtons();
            events.bindChatEvents();
            
            animationController.createDynamicRipple();
            animationController.addButtonHoverEffects();
            animationController.initAppleWatchScrollEffect();
            
            // 确保工具栏正确显示
            const toolbar = document.querySelector('#smart-toolbar-container');
            if (toolbar) {
                toolbar.style.position = 'relative';
                toolbar.style.zIndex = '99999';
            }
            
            const char = chatManager.getCharacter();
            if (char) {
                appState.currentCharacter = char;
                ui.updateStatus(true, char.name);
            }
            
            utils.logInfo('初始化完成！');
        }, 100);
    }
});
