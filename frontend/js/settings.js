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
        
        // Theme
        this.themeOptions = document.querySelectorAll('.theme-option');
        
        // Contents
        this.fontSizeSlider = document.getElementById('font-size-slider');
        this.fontSizeValue = document.getElementById('font-size-value');
        this.customFontInput = document.getElementById('custom-font-input');
        this.zoomSlider = document.getElementById('zoom-slider');
        this.zoomValue = document.getElementById('zoom-value');
    },

    bindEvents() {
        // Open
        if (this.openBtn) {
            this.openBtn.onclick = () => {
                this.switchTab('theme'); // 常に最初のタブを開く
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
                // Using CSS zoom for simplicity across the whole app
                document.body.style.zoom = zoom / 100;
                localStorage.setItem('settings-zoom', zoom);
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
        document.body.classList.remove('theme-ocean', 'theme-forest', 'light-mode');
        this.themeOptions.forEach(opt => opt.classList.remove('active'));
        
        const selectedOpt = Array.from(this.themeOptions).find(opt => opt.dataset.theme === theme);
        if (selectedOpt) selectedOpt.classList.add('active');

        if (theme === 'snow') {
            document.body.classList.add('light-mode');
            localStorage.setItem('isDarkMode', 'false');
        } else {
            if (theme !== 'default') document.body.classList.add(`theme-${theme}`);
            localStorage.setItem('isDarkMode', 'true');
        }
        localStorage.setItem('app-theme', theme);
        
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
        localStorage.setItem('app-theme', theme);
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
            document.body.style.zoom = zoom / 100;
        }
    }
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    SettingsManager.init();
});
