const SettingsManager = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadSettings();
    },

    cacheDOM() {
        this.screen = document.getElementById('settings-screen');
        this.openBtn = document.getElementById('btn-settings');
        this.closeBtn = document.getElementById('btn-close-settings');
        this.tabBtns = document.querySelectorAll('.settings-tab-btn');
        this.tabContents = document.querySelectorAll('.settings-tab-content');
        
        // General
        this.windowPreviewToggle = document.getElementById('toggle-window-preview');

        // Theme
        this.themeOptions = document.querySelectorAll('.theme-option');
        this.highContrastToggle = document.getElementById('toggle-high-contrast');
        
        // Contents
        this.fontSizeSlider = document.getElementById('font-size-slider');
        this.fontSizeValue = document.getElementById('font-size-value');
        this.customFontInput = document.getElementById('custom-font-input');
        this.zoomSlider = document.getElementById('zoom-slider');
        this.zoomValue = document.getElementById('zoom-value');
        this.appContainer = document.querySelector('.app-container');

        // User Themes
        this.userThemesContainer = document.getElementById('user-themes-container');
        this.openThemesFolderBtn = document.getElementById('btn-open-themes-folder');
    },

    bindEvents() {
        // Open
        if (this.openBtn) {
            this.openBtn.onclick = () => {
                const activeTab = document.querySelector('.settings-tab-btn.active');
                const tabId = activeTab ? activeTab.dataset.tab : 'general';
                this.switchTab(tabId);
                this.screen.style.display = 'flex';
            };
        }

        // Tab switching
        this.tabBtns.forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });

        // Close
        if (this.closeBtn) {
            this.closeBtn.onclick = () => {
                this.screen.style.display = 'none';
            };
        }

        // Close on overlay click
        if (this.screen) {
            this.screen.onclick = (e) => {
                if (e.target === this.screen) {
                    this.screen.style.display = 'none';
                }
            };
        }

        // Theme Presets
        this.themeOptions.forEach(opt => {
            opt.onclick = () => {
                const theme = opt.dataset.theme;
                this.applyThemePreset(theme);
            };
        });

        // Font Size
        if (this.fontSizeSlider) {
            this.fontSizeSlider.oninput = () => {
                const size = this.fontSizeSlider.value;
                this.fontSizeValue.textContent = size + 'px';
                document.documentElement.style.setProperty('--main-font-size', size + 'px');
                localStorage.setItem('settings-font-size', size);
            };
        }

        // Custom Font
        if (this.customFontInput) {
            this.customFontInput.onchange = () => {
                const font = this.customFontInput.value.trim();
                document.documentElement.style.setProperty('--main-font-family', font || 'inherit');
                localStorage.setItem('settings-custom-font', font);
            };
        }

        // Zoom
        if (this.zoomSlider) {
            this.zoomSlider.oninput = () => {
                const zoom = this.zoomSlider.value;
                this.zoomValue.textContent = zoom + '%';
                this.applyZoom(zoom);
                localStorage.setItem('settings-zoom', zoom);
            };
        }

        // High Contrast
        if (this.highContrastToggle) {
            this.highContrastToggle.onchange = () => {
                const enabled = this.highContrastToggle.checked;
                localStorage.setItem('settings-high-contrast', enabled);
                this.applyHighContrast(enabled);
            };
        }

        // Window Preview
        if (this.windowPreviewToggle) {
            this.windowPreviewToggle.onchange = () => {
                const enabled = this.windowPreviewToggle.checked;
                localStorage.setItem('settings-window-preview', enabled);
            };
        }

        // Open Themes Folder
        if (this.openThemesFolderBtn) {
            this.openThemesFolderBtn.onclick = () => {
                window.api.sendCommand('OPEN_THEMES_FOLDER');
            };
        }
    },

    switchTab(tabId) {
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });
    },

    applyThemePreset(theme) {
        document.body.classList.remove('theme-deepblue', 'theme-khaki', 'theme-sakura', 'theme-amber', 'theme-sky', 'theme-midnight', 'light-mode');
        this.themeOptions.forEach(opt => opt.classList.remove('active'));
        
        const selectedOpt = Array.from(this.themeOptions).find(opt => opt.dataset.theme === theme);
        if (selectedOpt) selectedOpt.classList.add('active');

        const lightThemes = ['snow', 'sakura', 'amber', 'sky'];
        
        if (lightThemes.includes(theme)) {
            document.body.classList.add('light-mode');
            if (theme !== 'snow') document.body.classList.add(`theme-${theme}`);
            localStorage.setItem('isDarkMode', 'false');
        } else {
            if (theme !== 'default') document.body.classList.add(`theme-${theme}`);
            localStorage.setItem('isDarkMode', 'true');
        }
        localStorage.setItem('app-theme', theme);
        localStorage.removeItem('custom-theme-data'); // プリセット時はカスタムデータを消す
        
        // アイコンのリセットが必要な場合は applyTheme (js/theme.js) を呼ぶのが確実
        if (typeof applyTheme === 'function') {
            applyTheme(theme);
        }
        
        // Re-render
        if (typeof renderHomeContent === 'function' && isHomeActive) {
            renderHomeContent();
        } else if (typeof currentPath !== 'undefined' && currentPath) {
            window.api.sendCommand(`LIST|${currentPath}`);
        }
    },

    updateThemeActive(theme) {
        this.themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
        // ユーザーテーマの選択状態も更新
        document.querySelectorAll('.user-theme-option').forEach(opt => {
            opt.classList.toggle('active', 'custom-' + opt.dataset.themeId === theme);
        });
        localStorage.setItem('app-theme', theme);
    },

    async loadUserThemes() {
        if (!this.userThemesContainer) return;
        
        const themes = await window.api.invoke('GET_USER_THEMES');
        this.userThemesContainer.innerHTML = '';
        
        if (!themes || themes.length === 0) {
            this.userThemesContainer.innerHTML = '<p style="font-size:11px; color:var(--text-muted);">テーマが見つかりません</p>';
            return;
        }

        const currentTheme = localStorage.getItem('app-theme');

        themes.forEach(theme => {
            const opt = document.createElement('div');
            opt.className = 'theme-option user-theme-option';
            if (currentTheme === 'custom-' + theme.id) opt.classList.add('active');
            opt.dataset.themeId = theme.id;
            opt.title = theme.name || theme.id;
            
            // プレビュー色
            const bg = theme.colors ? (theme.colors['--bg-main'] || '#1e1e1e') : '#1e1e1e';
            const accent = theme.colors ? (theme.colors['--accent-color'] || '#007acc') : '#007acc';
            
            opt.innerHTML = `
                <div class="theme-preview" style="background:${bg}; border:1px solid ${accent}; display:flex; align-items:center; justify-content:center;">
                    <div style="width:12px; height:12px; border-radius:50%; background:${accent};"></div>
                </div>
            `;
            
            opt.onclick = () => {
                this.applyCustomTheme(theme);
            };
            
            this.userThemesContainer.appendChild(opt);
        });
    },

    applyCustomTheme(themeObj) {
        // 既存の選択解除
        this.themeOptions.forEach(opt => opt.classList.remove('active'));
        document.querySelectorAll('.user-theme-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.themeId === themeObj.id);
        });

        if (typeof applyTheme === 'function') {
            applyTheme(null, themeObj);
        }
    },

    loadSettings() {
        // Dark Mode state
        const isDark = localStorage.getItem('isDarkMode') !== 'false';
        if (!isDark) document.body.classList.add('light-mode');

        // Theme Preset
        const theme = localStorage.getItem('app-theme') || (isDark ? 'default' : 'snow');
        this.applyThemePreset(theme);

        // Font Size
        const fontSize = localStorage.getItem('settings-font-size') || '13';
        if (this.fontSizeSlider) {
            this.fontSizeSlider.value = fontSize;
            this.fontSizeValue.textContent = fontSize + 'px';
            document.documentElement.style.setProperty('--main-font-size', fontSize + 'px');
        }

        // Custom Font
        const customFont = localStorage.getItem('settings-custom-font') || '';
        if (this.customFontInput) {
            this.customFontInput.value = customFont;
            if (customFont) document.documentElement.style.setProperty('--main-font-family', customFont);
        }

        // Zoom
        const zoom = localStorage.getItem('settings-zoom') || '100';
        if (this.zoomSlider) {
            this.zoomSlider.value = zoom;
            this.zoomValue.textContent = zoom + '%';
            this.applyZoom(zoom);
        }

        // High Contrast
        const highContrastEnabled = localStorage.getItem('settings-high-contrast') === 'true';
        if (this.highContrastToggle) {
            this.highContrastToggle.checked = highContrastEnabled;
            this.applyHighContrast(highContrastEnabled);
        }

        // Window Preview
        const windowPreviewEnabled = localStorage.getItem('settings-window-preview') === 'true';
        if (this.windowPreviewToggle) {
            this.windowPreviewToggle.checked = windowPreviewEnabled;
        }

        // User Themes
        this.loadUserThemes();

        // 初期状態でカスタムテーマが選ばれている場合
        const customData = localStorage.getItem('custom-theme-data');
        if (theme.startsWith('custom-') && customData) {
            try {
                const themeObj = JSON.parse(customData);
                if (typeof applyTheme === 'function') {
                    applyTheme(null, themeObj);
                }
            } catch (e) {
                console.error('Failed to load custom theme data:', e);
            }
        }
    },

    applyHighContrast(enabled) {
        document.body.classList.toggle('high-contrast', enabled);
    },

    applyZoom(zoomPercent) {
        const factor = zoomPercent / 100;
        if (this.appContainer) {
            // zoomプロパティを使用すると座標系自体が拡大されるため、
            // コンテナのサイズを(100/factor)%に調整することでビューポート内に収める
            this.appContainer.style.zoom = factor;
            this.appContainer.style.height = (100 / factor) + 'vh';
            this.appContainer.style.width = (100 / factor) + 'vw';
        }
    }
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    SettingsManager.init();
});
