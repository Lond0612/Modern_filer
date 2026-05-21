const PreviewManager = {
    isOpen: false,
    currentFile: null,

    init() {
        this.cacheDOM();
        this.bindEvents();
    },

    resetStyles() {
        if (this.content) {
            this.content.style.padding = '';
            this.content.style.height = '';
            this.content.style.justifyContent = '';
        }
    },

    cacheDOM() {
        this.pane = document.getElementById('preview-pane');
        this.resizer = document.getElementById('resizer-preview');
        this.content = document.getElementById('preview-content');
        this.filename = document.getElementById('preview-filename');
        this.closeBtn = document.getElementById('btn-close-preview');
        this.toggleBtn = document.getElementById('btn-preview-toggle');
        this.openBtn = document.getElementById('btn-open-file');
    },

    bindEvents() {
        if (this.closeBtn) {
            this.closeBtn.onclick = () => this.hide();
        }
        if (this.toggleBtn) {
            this.toggleBtn.onclick = () => this.toggle();
        }
        if (this.openBtn) {
            this.openBtn.onclick = () => {
                if (this.currentFile) {
                    window.api.sendCommand('OPEN|' + this.currentFile);
                    this.hide();
                }
            };
        }

        // ウィンドウが外部で閉じられた際の同期
        window.api.onBackendResponse((obj) => {
            if (obj.type === 'PREVIEW_WINDOW_CLOSED') {
                this.isOpen = false;
                if (this.toggleBtn) this.toggleBtn.classList.remove('active');
            }
        });

        // 動画プレビュー中のキー操作（左右矢印で10秒前戻し・先送り＆アニメーション）
        window.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;
            const videoEl = this.content.querySelector('video');
            if (!videoEl) return;

            const active = document.activeElement;
            const isInput = active && (
                active.tagName === 'INPUT' || 
                active.tagName === 'TEXTAREA' || 
                active.isContentEditable
            );
            if (isInput) return;

            // スキップアニメーション用のCSS定義を注入
            if (!document.getElementById('video-skip-animation-styles')) {
                const style = document.createElement('style');
                style.id = 'video-skip-animation-styles';
                style.textContent = `
                    @keyframes skipFadeScale {
                        0% { opacity: 0; transform: scale(0.6); }
                        20% { opacity: 0.9; transform: scale(1.1); }
                        40% { opacity: 1; transform: scale(1.0); }
                        80% { opacity: 1; transform: scale(1.0); }
                        100% { opacity: 0; transform: scale(0.8); }
                    }
                    .video-skip-overlay {
                        position: absolute;
                        top: 0;
                        bottom: 0;
                        width: 40%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        pointer-events: none;
                        z-index: 10;
                        background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%);
                    }
                    .video-skip-overlay.left {
                        left: 0;
                        border-top-left-radius: 6px;
                        border-bottom-left-radius: 6px;
                    }
                    .video-skip-overlay.right {
                        right: 0;
                        border-top-right-radius: 6px;
                        border-bottom-right-radius: 6px;
                    }
                    .video-skip-circle {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        background: rgba(15, 15, 15, 0.75);
                        backdrop-filter: blur(8px);
                        -webkit-backdrop-filter: blur(8px);
                        border: 1px solid rgba(255, 255, 255, 0.15);
                        color: #ffffff;
                        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                        animation: skipFadeScale 0.75s ease-out forwards;
                    }
                    .video-skip-icon {
                        width: 28px;
                        height: 28px;
                        stroke-width: 2.5;
                        margin-bottom: 4px;
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
                    }
                    .video-skip-text {
                        font-size: 13px;
                        font-weight: 700;
                        font-family: 'Outfit', 'Inter', sans-serif;
                        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
                    }
                `;
                document.head.appendChild(style);
            }

            const showSkipOverlay = (container, direction) => {
                container.querySelectorAll('.video-skip-overlay').forEach(el => el.remove());
                const overlay = document.createElement('div');
                overlay.className = `video-skip-overlay ${direction}`;
                overlay.innerHTML = `
                    <div class="video-skip-circle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="video-skip-icon">
                            ${direction === 'left' 
                                ? '<polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon>'
                                : '<polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon>'
                            }
                        </svg>
                        <span class="video-skip-text">${direction === 'left' ? '-10秒' : '+10秒'}</span>
                    </div>
                `;
                container.appendChild(overlay);
                setTimeout(() => { overlay.remove(); }, 750);
            };

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
                const container = this.content.querySelector('.preview-video-container');
                if (container) showSkipOverlay(container, 'left');
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 10);
                const container = this.content.querySelector('.preview-video-container');
                if (container) showSkipOverlay(container, 'right');
            }
        });
    },

    toggle() {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show();
        }
    },

    show() {
        const isWindowMode = localStorage.getItem('settings-window-preview') === 'true';
        
        if (isWindowMode) {
            this.isOpen = true; // ウィンドウが開いている状態としてマーク
            this.pane.style.display = 'none';
            this.resizer.style.display = 'none';
            if (this.toggleBtn) this.toggleBtn.classList.add('active');
            this.update();
        } else {
            this.isOpen = true;
            this.pane.style.display = 'flex';
            this.resizer.style.display = 'block';
            if (this.toggleBtn) this.toggleBtn.classList.add('active');
            this.update();
        }
    },

    hide() {
        this.isOpen = false;
        this.pane.style.display = 'none';
        this.resizer.style.display = 'none';
        if (this.toggleBtn) this.toggleBtn.classList.remove('active');
        if (this.openBtn) this.openBtn.classList.remove('visible');
        
        // ウィンドウモードならウィンドウを閉じる
        if (localStorage.getItem('settings-window-preview') === 'true') {
            window.api.sendCommand('CLOSE_PREVIEW_WINDOW');
        }
    },

    async update() {
        if (!this.isOpen) return;

        const isWindowMode = localStorage.getItem('settings-window-preview') === 'true';
        const selected = typeof getSelectedItems === 'function' ? getSelectedItems() : [];
        
        if (selected.length === 0) {
            if (!isWindowMode) {
                this.renderPlaceholder();
                if (this.openBtn) this.openBtn.classList.remove('visible');
            }
            return;
        }

        const file = selected[0];
        if (this.currentFile === file.srcPath) return;
        this.currentFile = file.srcPath;

        if (isWindowMode) {
            const theme = localStorage.getItem('app-theme') || 'default';
            const isDark = localStorage.getItem('isDarkMode') !== 'false';
            const highContrast = localStorage.getItem('settings-high-contrast') === 'true';

            window.api.invoke('SHOW_PREVIEW_WINDOW', { 
                file,
                theme,
                isDark,
                highContrast
            });
            if (this.openBtn) this.openBtn.classList.remove('visible');
            return;
        }

        if (this.openBtn) this.openBtn.classList.add('visible');
        
        this.filename.textContent = file.name;
        this.renderLoading();

        try {
            const ext = file.name.split('.').pop().toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext);
            const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext);
            const isPdf = ext === 'pdf';
            const isText = ['txt', 'js', 'json', 'c', 'cpp', 'h', 'hpp', 'py', 'md', 'html', 'css', 'sql', 'sh', 'bat', 'ps1'].includes(ext);

            if (isImage) {
                this.renderImage(file.srcPath);
            } else if (isVideo) {
                this.renderVideo(file.srcPath);
            } else if (isPdf) {
                this.renderPdf(file.srcPath);
            } else if (isText) {
                await this.renderText(file.srcPath);
            } else {
                this.renderGenericInfo(file);
            }
        } catch (err) {
            console.error('Preview error:', err);
            this.renderError(err.message);
        }
    },

    renderPlaceholder() {
        this.resetStyles();
        this.currentFile = null;
        this.filename.textContent = 'File Preview';
        this.content.innerHTML = `
            <div class="preview-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <p>ファイルを選択してプレビューを表示</p>
            </div>
        `;
    },

    renderLoading() {
        this.resetStyles();
        this.content.innerHTML = '<div class="preview-placeholder"><p>読み込み中...</p></div>';
    },

    renderError(msg) {
        this.resetStyles();
        this.content.innerHTML = `<div class="preview-placeholder"><p style="color: var(--text-terminal-error)">エラー: ${msg}</p></div>`;
    },

    renderImage(path) {
        this.resetStyles();
        // ElectronのネイティブパスをURLに変換する必要がある場合がある
        // ここでは一旦単純なパス指定（バックエンドで適切に処理される前提）
        const imgUrl = `file:///${path.replace(/\\/g, '/')}`;
        this.content.innerHTML = `
            <div class="preview-image-container">
                <img src="${imgUrl}" alt="Preview" />
            </div>
        `;
    },
    
    renderVideo(path) {
        this.resetStyles();
        const videoUrl = `file:///${path.replace(/\\/g, '/')}`;
        this.content.innerHTML = `
            <div class="preview-video-container" style="position: relative; display: flex; align-items: center; justify-content: center; height: 100%; background: #000;">
                <video src="${videoUrl}" controls autoplay muted style="max-width: 100%; max-height: 100%;"></video>
            </div>
        `;
    },

    renderPdf(path) {
        this.resetStyles();
        const pdfUrl = `file:///${path.replace(/\\/g, '/')}`;
        this.content.style.padding = '0';
        this.content.style.height = '100%';
        this.content.style.justifyContent = 'stretch';
        this.content.innerHTML = `
            <div class="preview-pdf-container" style="width: 100%; height: 100%; overflow: hidden; border-radius: 6px;">
                <iframe src="${pdfUrl}" style="width: 100%; height: 100%; border: none;"></iframe>
            </div>
        `;
    },

    async renderText(path) {
        this.resetStyles();
        // メインプロセス経由でテキストを取得
        // window.api.readFileContent などが必要
        const content = await window.api.invoke('READ_FILE_TEXT', path);
        this.content.innerHTML = `
            <div class="preview-text-container">${this.escapeHtml(content)}</div>
        `;
    },

    renderGenericInfo(file) {
        this.resetStyles();
        this.content.innerHTML = `
            <div class="preview-info-card">
                <div class="info-row">
                    <span class="info-label">名前</span>
                    <span class="info-value">${file.name}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">場所</span>
                    <span class="info-value">${file.srcPath}</span>
                </div>
                <p style="font-size: 11px; color: var(--text-muted); margin-top: 20px; text-align: center;">
                    このファイル形式のプレビューは現在サポートされていません
                </p>
            </div>
        `;
    },

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    PreviewManager.init();
});
