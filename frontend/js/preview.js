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
            <div class="preview-video-container" style="display: flex; align-items: center; justify-content: center; height: 100%; background: #000;">
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
