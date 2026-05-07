const PreviewManager = {
    isOpen: false,
    currentFile: null,

    init() {
        this.cacheDOM();
        this.bindEvents();
    },

    cacheDOM() {
        this.pane = document.getElementById('preview-pane');
        this.resizer = document.getElementById('resizer-preview');
        this.content = document.getElementById('preview-content');
        this.filename = document.getElementById('preview-filename');
        this.closeBtn = document.getElementById('btn-close-preview');
        this.toggleBtn = document.getElementById('btn-preview-toggle');
    },

    bindEvents() {
        if (this.closeBtn) {
            this.closeBtn.onclick = () => this.hide();
        }
        if (this.toggleBtn) {
            this.toggleBtn.onclick = () => this.toggle();
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
            if (!isWindowMode) this.renderPlaceholder();
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
            return;
        }
        
        this.filename.textContent = file.name;
        this.renderLoading();

        try {
            const ext = file.name.split('.').pop().toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext);
            const isText = ['txt', 'js', 'json', 'c', 'cpp', 'h', 'hpp', 'py', 'md', 'html', 'css', 'sql', 'sh', 'bat', 'ps1'].includes(ext);

            if (isImage) {
                this.renderImage(file.srcPath);
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
        this.content.innerHTML = '<div class="preview-placeholder"><p>読み込み中...</p></div>';
    },

    renderError(msg) {
        this.content.innerHTML = `<div class="preview-placeholder"><p style="color: var(--text-terminal-error)">エラー: ${msg}</p></div>`;
    },

    renderImage(path) {
        // ElectronのネイティブパスをURLに変換する必要がある場合がある
        // ここでは一旦単純なパス指定（バックエンドで適切に処理される前提）
        const imgUrl = `file:///${path.replace(/\\/g, '/')}`;
        this.content.innerHTML = `
            <div class="preview-image-container">
                <img src="${imgUrl}" alt="Preview" />
            </div>
        `;
    },

    async renderText(path) {
        // メインプロセス経由でテキストを取得
        // window.api.readFileContent などが必要
        const content = await window.api.invoke('READ_FILE_TEXT', path);
        this.content.innerHTML = `
            <div class="preview-text-container">${this.escapeHtml(content)}</div>
        `;
    },

    renderGenericInfo(file) {
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
