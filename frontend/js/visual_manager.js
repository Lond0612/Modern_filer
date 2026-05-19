/**
 * visual_manager.js
 * 役割: アプリケーションのすべての「視覚演出」を一元管理する
 *       - プリセットテーマの適用
 *       - 詳細カスタムJSONテーマのパースと適用
 *       - すりガラスブラー強度の制御
 *       - OSタイトルバーボタンのカラー同期
 *       - 壁紙色彩抽出とアクセントカラー同調
 */

// ---------------------------------------------------------------------------
// IconThemeManager: SVGアイコンの管理と切り替え
// ---------------------------------------------------------------------------
const IconThemeManager = {
    customIcons: {
        folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="file-icon-svg"><path fill="var(--icon-folder)" d="M64 448l384 0c35.3 0 64-28.7 64-64l0-240c0-35.3-28.7-64-64-64L298.7 80c-6.9 0-13.7-2.2-19.2-6.4L241.1 44.8C230 36.5 216.5 32 202.7 32L64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64z"/></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M176 48L64 48c-8.8 0-16 7.2-16 16l0 384c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-240-88 0c-39.8 0-72-32.2-72-72l0-88zM316.1 160L224 67.9 224 136c0 13.3 10.7 24 24 24l68.1 0zM0 64C0 28.7 28.7 0 64 0L197.5 0c17 0 33.3 6.7 45.3 18.7L365.3 141.3c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64z"/></svg>`,
        exe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M348.8 32C340.7 46.1 336 62.5 336 80l0 16-272 0 0 224 272 0 0 64-272 0c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l284.8 0zM336 432c0 17.5 4.7 33.9 12.8 48L120 480c-13.3 0-24-10.7-24-24s10.7-24 24-24l216 0zM432 32l96 0c26.5 0 48 21.5 48 48l0 352c0 26.5-21.5 48-48 48l-96 0c-26.5 0-48-21.5-48-48l0-352c0-26.5 21.5-48 48-48zm24 64c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0zm56 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>`,
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm128 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm136 72c8.5 0 16.4 4.5 20.7 11.8l80 136c4.4 7.4 4.4 16.6 .1 24.1S352.6 384 344 384l-240 0c-8.9 0-17.2-5-21.3-12.9s-3.5-17.5 1.6-24.8l56-80c4.5-6.4 11.8-10.2 19.7-10.2s15.2 3.8 19.7 10.2l17.2 24.6 46.5-79c4.3-7.3 12.2-11.8 20.7-11.8z"/></svg>`,
        archive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM80 104c0 13.3 10.7 24 24 24l16 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-16 0c-13.3 0-24 10.7-24 24zm0 80c0 13.3 10.7 24 24 24l32 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-32 0c-13.3 0-24 10.7-24 24zm64 56l-32 0c-17.7 0-32 14.3-32 32l0 48c0 26.5 21.5 48 48 48s48-21.5 48-48l0-48c0-17.7-14.3-32-32-32zm-16 64a16 16 0 1 1 0 32 16 16 0 1 1 0-32z"/></svg>`,
        media: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM80 288l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-24 35 35c3.2 3.2 7.5 5 12 5 9.4 0 17-7.6 17-17l0-94.1c0-9.4-7.6-17-17-17-4.5 0-8.8 1.8-12 5l-35 35 0-24c0-17.7-14.3-32-32-32l-96 0c-17.7 0-32 14.3-32 32z"/></svg>`,
        audio: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0z"/></svg>`,
        doc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zm56 256c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0z"/></svg>`,
        html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M0 32L34.9 427.8 191.5 480 349.1 427.8 384 32 0 32z"/></svg>`,
        css: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M376.3 32L0 32 0 408.3c0 19 7.6 37.2 21 50.7s31.7 21 50.7 21l304.6 0c19 0 37.2-7.6 50.7-21s21-31.7 21-50.7l0-304.6c0-19-7.6-37.2-21-50.7s-31.7-21-50.7-21z"/></svg>`,
        js: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M0 32l0 448 448 0 0-448-448 0z"/></svg>`,
        c: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M329.1 142.9c-62.5-62.5-155.8-62.5-218.3 0s-62.5 163.8 0 226.3 155.8 62.5 218.3 0c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3c-87.5 87.5-221.3 87.5-308.8 0s-87.5-229.3 0-316.8 221.3-87.5 308.8 0c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0z"/></svg>`,
        h: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M320 288l0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-384c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-256 0 0-160c0-17.7-14.3-32-32-32S0 46.3 0 64L0 448c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 256 0z"/></svg>`,
        desktop: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 32C28.7 32 0 60.7 0 96L0 352c0 35.3 28.7 64 64 64l144 0-16 48-72 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l272 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-72 0-16-48 144 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L64 32zM96 96l320 0c17.7 0 32 14.3 32 32l0 160c0 17.7-14.3 32-32 32L96 320c-17.7 0-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32z"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M256 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 210.7-41.4-41.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c12.5 12.5 32.8 12.5 45.3 0l96-96c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 242.7 256 32zM64 320c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-46.9 0-56.6 56.6c-31.2 31.2-81.9 31.2-113.1 0L110.9 320 64 320zm304 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>`
    },

    _defaultIcons: null,

    getIcon(name, isDir) {
        if (isDir) {
            // 特殊フォルダはフォルダ名で専用アイコンに切り替える
            const lower = name.toLowerCase();
            if (['desktop', 'デスクトップ'].includes(lower)) return this.customIcons.desktop;
            if (['downloads', 'download', 'ダウンロード'].includes(lower)) return this.customIcons.download;
            return this.customIcons.folder;
        }
        const ext = name.split('.').pop().toLowerCase();
        if (['html', 'htm'].includes(ext)) return this.customIcons.html;
        if (ext === 'css') return this.customIcons.css;
        if (['js', 'mjs', 'cjs'].includes(ext)) return this.customIcons.js;
        if (ext === 'c') return this.customIcons.c;
        if (['h', 'hpp'].includes(ext)) return this.customIcons.h;
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return this.customIcons.image;
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return this.customIcons.archive;
        if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext)) return this.customIcons.media;
        if (['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext)) return this.customIcons.audio;
        if (['exe', 'bat', 'cmd', 'ps1', 'sh', 'msi', 'dll'].includes(ext)) return this.customIcons.exe;
        if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'md', 'rtf'].includes(ext)) return this.customIcons.doc;
        return this.customIcons.file;
    },

    saveDefaults() {
        if (!this._defaultIcons) this._defaultIcons = { ...this.customIcons };
    },
    resetIcons() {
        if (this._defaultIcons) this.customIcons = { ...this._defaultIcons };
    },
    overrideIcons(icons) {
        this.saveDefaults();
        if (icons) Object.assign(this.customIcons, icons);
    }
};

// ---------------------------------------------------------------------------
// VisualManager: テーマ・エフェクト・タイトルバーの一元管理
// ---------------------------------------------------------------------------
const VisualManager = {

    /**
     * OSタイトルバーのカラーを自動計算して同期する
     * 壁紙モードが有効な場合は壁紙色抽出処理へバイパスする
     */
    syncOSTitlebar() {
        try {
            const globalWallpaperActive = localStorage.getItem('settings-global-wallpaper-active') === 'true';
            if (globalWallpaperActive) {
                if (window.api && typeof window.api.invoke === 'function') {
                    window.api.invoke('GET_WALLPAPERS').then(history => {
                        const activeId = localStorage.getItem('settings-active-wallpaper-id') || '';
                        const activeItem = history.find(item => item.id === activeId) || history[0];
                        if (activeItem) VisualManager.extractColorFromWallpaper(activeItem.dataUrl);
                    }).catch(err => console.error('Failed to get wallpaper for sync:', err));
                }
                return;
            }

            const computedStyle = getComputedStyle(document.body);
            let bgColor = (computedStyle.getPropertyValue('--bg-toolbar') ||
                           computedStyle.getPropertyValue('--bg-main') || '#1e1e1e').trim();
            if (bgColor.startsWith('rgba') || bgColor === 'transparent' || !bgColor)
                bgColor = (computedStyle.getPropertyValue('--bg-main') || '#1e1e1e').trim();

            let r = 30, g = 30, b = 30;
            const clean = bgColor.replace(/\s+/g, '').toLowerCase();
            if (clean.startsWith('#')) {
                const hex = clean.substring(1);
                if (hex.length === 3) {
                    r = parseInt(hex[0] + hex[0], 16);
                    g = parseInt(hex[1] + hex[1], 16);
                    b = parseInt(hex[2] + hex[2], 16);
                } else if (hex.length === 6) {
                    r = parseInt(hex.substring(0, 2), 16);
                    g = parseInt(hex.substring(2, 4), 16);
                    b = parseInt(hex.substring(4, 6), 16);
                }
            } else if (clean.startsWith('rgb')) {
                const m = clean.match(/\d+/g);
                if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
            }

            const brightness = Math.sqrt(r * r * 0.299 + g * g * 0.587 + b * b * 0.114);
            const symbolColor = brightness > 130 ? '#333333' : '#ffffff';
            if (window.api && typeof window.api.send === 'function')
                window.api.send('UPDATE_TITLE_BAR_OVERLAY', { color: bgColor, symbolColor });
        } catch (err) {
            console.error('Failed to sync title bar overlay:', err);
        }
    },

    /**
     * 壁紙画像の上部10%から平均色を抽出してタイトルバーとアクセントカラーに適用する
     * @param {string} url - 壁紙画像のURL
     */
    extractColorFromWallpaper(url) {
        if (!url) return;
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 10; canvas.height = 10;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, img.width, img.height * 0.1, 0, 0, 10, 10);
                const imgData = ctx.getImageData(0, 0, 10, 10).data;
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                for (let i = 0; i < imgData.length; i += 4) {
                    if (imgData[i + 3] > 50) { rSum += imgData[i]; gSum += imgData[i+1]; bSum += imgData[i+2]; count++; }
                }
                if (count === 0) return;
                const r = Math.round(rSum / count), g = Math.round(gSum / count), b = Math.round(bSum / count);
                const brightness = Math.sqrt(r * r * 0.299 + g * g * 0.587 + b * b * 0.114);
                const symbolColor = brightness > 130 ? '#333333' : '#ffffff';
                const hexColor = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                if (window.api && typeof window.api.send === 'function')
                    window.api.send('UPDATE_TITLE_BAR_OVERLAY', { color: hexColor, symbolColor });
                document.documentElement.style.setProperty('--accent-color', hexColor);
            } catch (e) {
                console.error('Failed to extract color from wallpaper:', e);
            }
        };
        img.onerror = (e) => console.error('Failed to load wallpaper image:', e);
    },

    /**
     * プリセットテーマまたは詳細カスタムJSONテーマを適用する
     * 
     * カスタムJSONテーマのスキーマ:
     * {
     *   "id": "my-theme",
     *   "name": "マイテーマ",
     *   "colors":   { "--bg-main": "...", "--accent-color": "...", ... },
     *   "effects":  { "--blur-main": "12px", "--box-shadow-premium": "...", ... },
     *   "fonts":    { "--font-family": "'Outfit', sans-serif" },
     *   "titleBar": { "color": "#1e1e1e", "symbolColor": "#ffffff" },
     *   "icons":    { "folder": "<svg>...</svg>" }
     * }
     * 
     * @param {string} themeName - プリセット名 ('default'|'deepblue'|'khaki'|'sakura'|'amber'|'sky'|'midnight')
     * @param {Object|null} customThemeObj - カスタムテーマJSONオブジェクト
     */
    applyTheme(themeName, customThemeObj = null) {
        // 既存テーマクラスとインラインスタイルをリセット
        document.body.classList.remove(
            'theme-deepblue', 'theme-khaki', 'theme-sakura',
            'theme-amber', 'theme-sky', 'theme-midnight', 'light-mode'
        );
        const oldStyle = document.getElementById('custom-theme-styles');
        if (oldStyle) oldStyle.remove();
        IconThemeManager.resetIcons();

        if (customThemeObj) {
            // ── カスタムJSONテーマの適用 ──────────────────────────────────
            const style = document.createElement('style');
            style.id = 'custom-theme-styles';
            let css = 'body { ';

            // colors / effects / fonts をすべてCSS変数としてbodyに注入
            for (const section of ['colors', 'effects', 'fonts']) {
                if (customThemeObj[section]) {
                    for (const [key, value] of Object.entries(customThemeObj[section]))
                        css += `${key}: ${value} !important; `;
                }
            }
            css += '}';
            style.textContent = css;
            document.head.appendChild(style);

            // OSタイトルバーの強制指定（指定がない場合は自動解析にフォールバック）
            if (customThemeObj.titleBar) {
                const { color, symbolColor } = customThemeObj.titleBar;
                if (window.api && typeof window.api.send === 'function')
                    window.api.send('UPDATE_TITLE_BAR_OVERLAY', { color, symbolColor });
            } else {
                setTimeout(() => this.syncOSTitlebar(), 50);
            }

            // アイコンの上書き
            if (customThemeObj.icons) IconThemeManager.overrideIcons(customThemeObj.icons);

            localStorage.setItem('app-theme', 'custom-' + customThemeObj.id);
            localStorage.setItem('custom-theme-data', JSON.stringify(customThemeObj));
        } else {
            // ── プリセットテーマの適用 ────────────────────────────────────
            const lightThemes = ['snow', 'sakura', 'amber', 'sky'];
            if (lightThemes.includes(themeName)) {
                document.body.classList.add('light-mode');
                if (themeName !== 'snow') document.body.classList.add(`theme-${themeName}`);
                localStorage.setItem('isDarkMode', 'false');
            } else {
                if (themeName !== 'default') document.body.classList.add(`theme-${themeName}`);
                localStorage.setItem('isDarkMode', 'true');
            }
            localStorage.setItem('app-theme', themeName);
            localStorage.removeItem('custom-theme-data');
            setTimeout(() => this.syncOSTitlebar(), 50);
        }

        // 画面の再描画
        if (typeof renderHomeContent === 'function' && typeof isHomeActive !== 'undefined' && isHomeActive)
            renderHomeContent();
        else if (typeof currentPath !== 'undefined' && currentPath)
            window.api.sendCommand(`LIST|${currentPath}`);
    }
};

// ---------------------------------------------------------------------------
// 後方互換性のためのグローバルエイリアス
// （renderer.js / settings.js が直接呼び出している関数名を維持する）
// ---------------------------------------------------------------------------
function applyTheme(themeName, customThemeObj = null) {
    VisualManager.applyTheme(themeName, customThemeObj);
}

function extractColorFromWallpaper(url) {
    VisualManager.extractColorFromWallpaper(url);
}
