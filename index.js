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
            <div id="toolbox-svg-container" class="${compactClass}" style="width: 100%; height: 133px; position: relative; margin-bottom: 0;">
                <svg id="toolbox-svg" width="100%" height="100%" viewBox="0 0 800 133" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#1a0f2e" stop-opacity="0.98"/>
                            <stop offset="50%" stop-color="#2d1b44" stop-opacity="0.98"/>
                            <stop offset="100%" stop-color="#3d1f5c" stop-opacity="0.98"/>
                        </linearGradient>
                        
                        <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#a855f7" stop-opacity="0.8"/>
                            <stop offset="50%" stop-color="#ec4899" stop-opacity="0.8"/>
                            <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.8"/>
                        </linearGradient>
                        
                        <linearGradient id="btnGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#4c1d95"/>
                            <stop offset="100%" stop-color="#7e22ce"/>
                        </linearGradient>
                        
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        
                        <filter id="shadow">
                            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.4"/>
                        </filter>
                        
                        <filter id="pulse">
                            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="turbulence">
                                <animate attributeName="baseFrequency" dur="4s" values="0.01;0.02;0.01" repeatCount="indefinite"/>
                            </feTurbulence>
                            <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="2" xChannelSelector="R" yChannelSelector="G"/>
                        </filter>
                    </defs>
                    
                    <rect id="bg-rect" x="0" y="0" width="800" height="133" fill="url(#bgGradient)" rx="10" filter="url(#pulse)"/>
                    <rect x="1" y="1" width="798" height="131" fill="none" stroke="url(#borderGradient)" stroke-width="2" rx="9" opacity="0.8" filter="url(#glow)">
                        <animate attributeName="opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite"/>
                    </rect>
                    
                    <g id="main-view">
                        <rect x="0" y="0" width="800" height="26" fill="rgba(0,0,0,0.35)"/>
                        <line x1="0" y1="26" x2="800" y2="26" stroke="rgba(180,130,200,0.4)" stroke-width="1"/>
                        
                        <text x="14" y="18" fill="rgba(148,163,184,0.9)" font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" id="char-status">未加载</text>
                        
                        <g id="btn-gen3" class="svg-btn" transform="translate(12, 34)" style="cursor: pointer;">
                            <rect x="0" y="0" width="76" height="28" rx="5" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.6)" stroke-width="1" filter="url(#shadow)"/>
                            <text x="38" y="18.5" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="0.3px">生成</text>
                        </g>
                        
                        <g id="btn-worldbook" class="svg-btn" transform="translate(96, 34)" style="cursor: pointer;">
                            <rect x="0" y="0" width="76" height="28" rx="5" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.6)" stroke-width="1" filter="url(#shadow)"/>
                            <text x="38" y="18.5" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="0.3px">世界书</text>
                        </g>
                        
                        <g id="btn-summary" class="svg-btn" transform="translate(180, 34)" style="cursor: pointer;">
                            <rect x="0" y="0" width="76" height="28" rx="5" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.6)" stroke-width="1" filter="url(#shadow)"/>
                            <text x="38" y="18.5" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="0.3px">总结</text>
                        </g>
                        
                        <g id="btn-analysis" class="svg-btn" transform="translate(264, 34)" style="cursor: pointer;">
                            <rect x="0" y="0" width="76" height="28" rx="5" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.6)" stroke-width="1" filter="url(#shadow)"/>
                            <text x="38" y="18.5" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="0.3px">分析</text>
                        </g>
                        
                        <g id="btn-suggestion" class="svg-btn" transform="translate(348, 34)" style="cursor: pointer;">
                            <rect x="0" y="0" width="76" height="28" rx="5" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.6)" stroke-width="1" filter="url(#shadow)"/>
                            <text x="38" y="18.5" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="0.3px">建议</text>
                        </g>
                        
                        <g id="btn-settings" class="svg-btn" transform="translate(760, 3)" style="cursor: pointer;">
                            <circle cx="10" cy="10" r="10" fill="rgba(0,0,0,0.25)" stroke="rgba(180,130,200,0.5)" stroke-width="1"/>
                            <text x="10" y="14.5" text-anchor="middle" fill="#a855f7" font-family="system-ui, sans-serif" font-size="14" font-weight="700">⚙</text>
                        </g>
                    </g>
                    
                    <g id="detail-view" style="display: none;">
                        <rect x="0" y="0" width="800" height="26" fill="rgba(0,0,0,0.35)"/>
                        <line x1="0" y1="26" x2="800" y2="26" stroke="rgba(180,130,200,0.4)" stroke-width="1"/>
                        
                        <g id="btn-back" class="svg-btn" transform="translate(8, 3)" style="cursor: pointer;">
                            <rect x="0" y="0" width="44" height="20" rx="4" fill="url(#btnGradient)" stroke="rgba(180,130,200,0.6)" stroke-width="1"/>
                            <text x="22" y="14.5" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700">←</text>
                        </g>
                        
                        <text x="58" y="18.5" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12.5" font-weight="700" id="detail-title">功能</text>
                        
                        <g id="loading-indicator" style="display: none;">
                            <circle cx="770" cy="13" r="6" fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="16 10" stroke-linecap="round" transform="rotate(0 770 13)">
                                <animateTransform attributeName="transform" type="rotate" from="0 770 13" to="360 770 13" dur="0.8s" repeatCount="indefinite"/>
                            </circle>
                        </g>
                    </g>
                </svg>
                <div id="toolbox-html-overlay"></div>
            </div>
        `;
    },
    
    updateStatus() {
        const statusText = document.getElementById('char-status');
        if (statusText) {
            if (appState.currentCharacter) {
                statusText.textContent = `✓ ${appState.currentCharacter.name}`;
                statusText.setAttribute('fill', 'rgba(74, 222, 128, 0.98)');
            } else {
                statusText.textContent = '未加载';
                statusText.setAttribute('fill', 'rgba(148, 163, 184, 0.7)');
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
    },
    
    renderMainView() {
        appState.expandedTab = null;
        appState.currentTab = null;
        
        this.cleanupEventListeners();
        
        const mainView = document.getElementById('main-view');
        const detailView = document.getElementById('detail-view');
        const overlay = document.getElementById('toolbox-html-overlay');
        
        if (mainView) mainView.style.display = 'block';
        if (detailView) detailView.style.display = 'none';
        if (overlay) overlay.innerHTML = '';
    },
    
    renderDetailView(tab) {
        this.cleanupEventListeners();
        
        appState.expandedTab = tab;
        appState.currentTab = tab;
        
        const mainView = document.getElementById('main-view');
        const detailView = document.getElementById('detail-view');
        const overlay = document.getElementById('toolbox-html-overlay');
        
        if (mainView) mainView.style.display = 'none';
        if (detailView) detailView.style.display = 'block';
        
        const titles = {
            'gen3': '生成回复',
            'worldbook': '世界书',
            'summary': '对话总结',
            'analysis': '角色分析',
            'suggestion': '情节建议'
        };
        
        const titleEl = document.getElementById('detail-title');
        if (titleEl) titleEl.textContent = titles[tab] || '功能';
        
        let overlayHTML = '';
        
        switch(tab) {
            case 'gen3':
                overlayHTML = this.renderGen3Content();
                break;
            case 'worldbook':
                overlayHTML = this.renderWorldbookContent();
                break;
            case 'summary':
                overlayHTML = this.renderSummaryContent();
                break;
            case 'analysis':
                overlayHTML = this.renderAnalysisContent();
                break;
            case 'suggestion':
                overlayHTML = this.renderSuggestionContent();
                break;
        }
        
        if (overlay) overlay.innerHTML = overlayHTML;
        
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
            <div style="position: absolute; top: 30px; left: 0; right: 0; bottom: 0; padding: 10px; overflow: hidden; pointer-events: auto;">
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                    <select id="gen-count-select" style="background: rgba(76,29,149,0.9); color: #fff; border: 1px solid rgba(180,130,200,0.6); border-radius: 5px; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                        <option value="1" ${genCount == 1 ? 'selected' : ''}>1条</option>
                        <option value="2" ${genCount == 2 ? 'selected' : ''}>2条</option>
                        <option value="3" ${genCount == 3 ? 'selected' : ''}>3条</option>
                    </select>
                    <button id="gen-start-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.7); border-radius: 5px; padding: 5px 14px; font-size: 11px; font-weight: 600; cursor: pointer; flex: 1;">生成</button>
                </div>
                <div id="gen-results" style="max-height: 70px; overflow-y: auto;"></div>
            </div>
        `;
    },
    
    renderWorldbookContent() {
        return `
            <div style="position: absolute; top: 30px; left: 0; right: 0; bottom: 0; padding: 10px; overflow: hidden; pointer-events: auto;">
                <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <button id="wb-start-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.7); border-radius: 5px; padding: 5px 14px; font-size: 11px; font-weight: 600; cursor: pointer; flex: 1;">生成</button>
                    <button id="wb-save-btn" style="background: rgba(76,29,149,0.7); color: #fff; border: 1px solid rgba(180,130,200,0.5); border-radius: 5px; padding: 5px 14px; font-size: 11px; font-weight: 600; cursor: pointer; flex: 1; opacity: 0.5;" disabled>保存</button>
                </div>
                <div id="wb-preview" style="max-height: 70px; overflow-y: auto;"></div>
            </div>
        `;
    },
    
    renderSummaryContent() {
        return `
            <div style="position: absolute; top: 30px; left: 0; right: 0; bottom: 0; padding: 10px; overflow: hidden; pointer-events: auto;">
                <button id="sum-start-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.7); border-radius: 5px; padding: 5px 14px; font-size: 11px; font-weight: 600; cursor: pointer; margin-bottom: 8px; width: 100%;">生成总结</button>
                <div id="sum-content" style="max-height: 70px; overflow-y: auto;"></div>
            </div>
        `;
    },
    
    renderAnalysisContent() {
        return `
            <div style="position: absolute; top: 30px; left: 0; right: 0; bottom: 0; padding: 10px; overflow: hidden; pointer-events: auto;">
                <button id="ana-start-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.7); border-radius: 5px; padding: 5px 14px; font-size: 11px; font-weight: 600; cursor: pointer; margin-bottom: 8px; width: 100%;">分析角色</button>
                <div id="ana-content" style="max-height: 70px; overflow-y: auto;"></div>
            </div>
        `;
    },
    
    renderSuggestionContent() {
        return `
            <div style="position: absolute; top: 30px; left: 0; right: 0; bottom: 0; padding: 10px; overflow: hidden; pointer-events: auto;">
                <button id="sug-start-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.7); border-radius: 5px; padding: 5px 14px; font-size: 11px; font-weight: 600; cursor: pointer; margin-bottom: 8px; width: 100%;">生成建议</button>
                <div id="sug-content" style="max-height: 70px; overflow-y: auto;"></div>
            </div>
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
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(180,130,200,0.25); border-radius: 5px; padding: 7px; margin-bottom: 6px; display: flex; gap: 8px; align-items: flex-start;">
                    <div style="font-size: 10px; font-weight: 800; color: #a855f7; min-width: 20px; padding-top: 2px;">${i + 1}</div>
                    <div style="flex: 1; font-size: 10.5px; color: rgba(255,255,255,0.9); line-height: 1.4; word-break: break-all;">${displayText}</div>
                    <div style="display: flex; gap: 4px;">
                        <button class="use-reply-btn" data-index="${i}" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.5); border-radius: 4px; padding: 3px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">发</button>
                        <button class="copy-reply-btn" data-index="${i}" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.5); border-radius: 4px; padding: 3px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">复</button>
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
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(180,130,200,0.25); border-radius: 5px; padding: 8px;">
                <div style="font-size: 11.5px; font-weight: 700; color: #a855f7; margin-bottom: 5px;">${utils.escapeHtml(entry.name)}</div>
                <div style="font-size: 10px; color: rgba(200,150,255,0.85); margin-bottom: 5px; line-height: 1.4;">${utils.escapeHtml(entry.keywords.join('、'))}</div>
                <div style="font-size: 10.5px; color: rgba(255,255,255,0.88); line-height: 1.4; word-break: break-all;">${utils.escapeHtml(entry.content)}</div>
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
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(180,130,200,0.25); border-radius: 5px; padding: 8px;">
                    <div style="font-size: 11.5px; font-weight: 700; color: #a855f7; margin-bottom: 6px;">${utils.escapeHtml(character.name)}</div>
                    <div style="font-size: 10.5px; color: rgba(255,255,255,0.88); line-height: 1.45; margin-bottom: 7px; word-break: break-all;">${utils.escapeHtml(text)}</div>
                    <div style="display: flex;">
                        <button id="ana-copy-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.5); border-radius: 4px; padding: 4px 10px; font-size: 10px; font-weight: 600; cursor: pointer; width: 100%;">复制</button>
                    </div>
                </div>
            `;
        } else {
            html = `
                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(180,130,200,0.25); border-radius: 5px; padding: 8px;">
                    <div style="font-size: 10.5px; color: rgba(255,255,255,0.88); line-height: 1.45; margin-bottom: 7px; word-break: break-all;">${utils.escapeHtml(text)}</div>
                    <div style="display: flex; gap: 8px;">
                        <button id="${type}-use-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.5); border-radius: 4px; padding: 4px 10px; font-size: 10px; font-weight: 600; cursor: pointer; flex: 1;">发送</button>
                        <button id="${type}-copy-btn" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: #fff; border: 1px solid rgba(180,130,200,0.5); border-radius: 4px; padding: 4px 10px; font-size: 10px; font-weight: 600; cursor: pointer; flex: 1;">复制</button>
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
                <div style="font-size: 11px; color: rgba(248,113,113,0.95); padding: 8px; background: rgba(248,113,113,0.1); border-radius: 5px; border: 1px solid rgba(248,113,113,0.3); word-break: break-all;">
                    ${utils.escapeHtml(message)}
                </div>
            `;
        }
    },
    
    resetButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    },
    
    disableButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
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
                saveBtn.style.opacity = '1';
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
