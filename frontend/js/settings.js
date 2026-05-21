const SettingsManager = {
    async init() {
        this.cacheDOM();
        this.bindEvents();
        this.formatShortcutKeys();
        await this.loadSettings();
    },

    cacheDOM() {
        this.screen = document.getElementById('settings-screen');
        this.openBtn = document.getElementById('btn-settings');
        this.closeBtn = document.getElementById('btn-close-settings');
        this.tabBtns = document.querySelectorAll('.settings-tab-btn');
        this.tabContents = document.querySelectorAll('.settings-tab-content');
        
        // General
        this.windowPreviewToggle = document.getElementById('toggle-window-preview');
        this.nativePropertiesToggle = document.getElementById('toggle-native-properties');
        this.vimModeToggle = document.getElementById('toggle-vim-mode');
        this.defaultShellSelect = document.getElementById('settings-default-shell');

        // Theme
        this.themeOptions = document.querySelectorAll('.theme-option');
        this.highContrastToggle = document.getElementById('toggle-high-contrast');
        
        // Contents
        this.fontSizeSlider = document.getElementById('font-size-slider');
        this.fontSizeValue = document.getElementById('font-size-value');

        this.zoomSlider = document.getElementById('zoom-slider');
        this.zoomValue = document.getElementById('zoom-value');
        this.appContainer = document.querySelector('.app-container');

        // User Themes
        this.userThemesContainer = document.getElementById('user-themes-container');
        this.openThemesFolderBtn = document.getElementById('btn-open-themes-folder');
        this.refreshThemesBtn = document.getElementById('btn-refresh-themes');

        // Customization
        this.newExtLabelInput = document.getElementById('new-ext-label');
        this.newExtValueInput = document.getElementById('new-ext-value');
        this.addExtBtn = document.getElementById('btn-add-extension');
        this.extListContainer = document.getElementById('custom-extension-list');

        // Wallpaper
        this.globalWallpaperMode = document.getElementById('global-wallpaper-mode');
        this.btnSelectGlobalWallpaper = document.getElementById('btn-select-global-wallpaper');
        this.btnClearGlobalWallpaper = document.getElementById('btn-clear-global-wallpaper');
        this.globalWallpaperFit = document.getElementById('global-wallpaper-fit');
        this.wallpaperHistoryList = document.getElementById('wallpaper-history-list');
        this.wallpaperOpacitySlider = document.getElementById('wallpaper-opacity-slider');
        this.wallpaperOpacityValue = document.getElementById('wallpaper-opacity-value');
        this.wallpaperDropzone = document.getElementById('wallpaper-dropzone');

        // Resets
        this.resetFontSizeBtn = document.getElementById('reset-font-size');
        this.resetZoomBtn = document.getElementById('reset-zoom');
        this.resetWallpaperOpacityBtn = document.getElementById('reset-wallpaper-opacity');

        // Shortcuts Search
        this.shortcutSearchInput = document.getElementById('shortcut-search-input');
        this.shortcutTable = document.querySelector('.shortcut-list');
    },

    updateSliderProgress(slider) {
        if (!slider) return;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        slider.style.setProperty('--slider-progress', percent + '%');
    },

    formatShortcutKeys() {
        document.querySelectorAll('.shortcut-key').forEach(el => {
            const rawText = el.textContent;
            if (!rawText || el.querySelector('kbd')) return;
            
            const groupParts = rawText.split(',').map(g => g.trim());
            const groupFormatted = groupParts.map(group => {
                const parts = group.split('+').map(part => part.trim());
                return parts.map(part => `<kbd class="kbd-key">${part}</kbd>`).join('<span class="kbd-join">+</span>');
            }).join('<span class="kbd-join"> , </span>');
            
            el.innerHTML = groupFormatted;
            el.style.background = 'transparent';
            el.style.border = 'none';
            el.style.boxShadow = 'none';
            el.style.padding = '0';
        });
    },

    bindEvents() {
        // Open
        if (this.openBtn) {
            this.openBtn.onclick = () => {
                const activeTab = document.querySelector('.settings-tab-btn.active');
                const tabId = activeTab ? activeTab.dataset.tab : 'contents';
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
                window.api.invoke('CLOSE_WALLPAPER_SELECT_WINDOW');
            };
        }

        // Close on overlay click
        if (this.screen) {
            this.screen.onclick = (e) => {
                if (e.target === this.screen) {
                    this.screen.style.display = 'none';
                    window.api.invoke('CLOSE_WALLPAPER_SELECT_WINDOW');
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
            const setFontSize = (size) => {
                this.fontSizeSlider.value = size;
                this.fontSizeValue.textContent = size + 'px';
                document.documentElement.style.setProperty('--main-font-size', size + 'px');
                localStorage.setItem('settings-font-size', size);
                this.updateSliderProgress(this.fontSizeSlider);
            };
            this.fontSizeSlider.oninput = () => {
                setFontSize(this.fontSizeSlider.value);
            };
            this.fontSizeSlider.ondblclick = () => setFontSize(13);
            if (this.resetFontSizeBtn) {
                this.resetFontSizeBtn.onclick = () => setFontSize(13);
            }
        }



        // Zoom
        if (this.zoomSlider) {
            const setZoom = (zoom) => {
                this.zoomSlider.value = zoom;
                this.zoomValue.textContent = zoom + '%';
                this.applyZoom(zoom);
                localStorage.setItem('settings-zoom', zoom);
                this.updateSliderProgress(this.zoomSlider);
            };
            this.zoomSlider.oninput = () => {
                setZoom(this.zoomSlider.value);
            };
            this.zoomSlider.ondblclick = () => setZoom(100);
            if (this.resetZoomBtn) {
                this.resetZoomBtn.onclick = () => setZoom(100);
            }
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

        // Native Properties
        if (this.nativePropertiesToggle) {
            this.nativePropertiesToggle.onchange = () => {
                const enabled = this.nativePropertiesToggle.checked;
                localStorage.setItem('settings-native-properties', enabled);
            };
        }

        // Vim Mode toggle
        if (this.vimModeToggle) {
            this.vimModeToggle.onchange = () => {
                const enabled = this.vimModeToggle.checked;
                localStorage.setItem('settings-vim-mode', enabled);
                const badge = document.getElementById('vim-mode-badge');
                if (badge) badge.style.display = enabled ? 'inline-block' : 'none';
            };
        }

        // Default Shell Select
        if (this.defaultShellSelect) {
            this.defaultShellSelect.onchange = () => {
                const shellVal = this.defaultShellSelect.value;
                localStorage.setItem('settings-default-shell', shellVal);
                if (window.api && typeof window.api.sendCommand === 'function') {
                    window.api.sendCommand(`SET_SHELL|${shellVal}`);
                }
            };
        }

        // Open Themes Folder
        if (this.openThemesFolderBtn) {
            this.openThemesFolderBtn.onclick = () => {
                window.api.invoke('OPEN_THEMES_FOLDER');
            };
        }

        // Refresh Themes
        if (this.refreshThemesBtn) {
            this.refreshThemesBtn.onclick = () => {
                this.loadUserThemes();
                // ボタンを回転させるアニメーション
                const svg = this.refreshThemesBtn.querySelector('svg');
                if (svg) {
                    svg.style.transition = 'transform 0.5s ease';
                    svg.style.transform = 'rotate(360deg)';
                    setTimeout(() => {
                        svg.style.transition = 'none';
                        svg.style.transform = 'rotate(0deg)';
                    }, 500);
                }
            };
        }

        // Add Extension
        if (this.addExtBtn) {
            this.addExtBtn.onclick = () => this.addExtension();
        }

        // ウィンドウ間の設定リアルタイム同期
        let storageTimeout;
        window.addEventListener('storage', (e) => {
            const syncKeys = [
                'app-theme', 'isDarkMode', 'custom-theme-data',
                'settings-font-size',
                'settings-zoom', 'settings-high-contrast',
                'settings-window-preview', 'settings-native-properties',
                'settings-custom-new-files', 'settings-global-wallpaper-active',
                'settings-global-wallpaper-fit', 'settings-active-wallpaper-id',
                'settings-global-wallpaper-opacity'
            ];
            if (e.key && syncKeys.includes(e.key)) {
                clearTimeout(storageTimeout);
                storageTimeout = setTimeout(() => {
                    SettingsManager.loadSettings();
                }, 100);
            } else if (e.key === 'quickAccessItems' && typeof refreshQuickAccessUI === 'function') {
                clearTimeout(storageTimeout);
                storageTimeout = setTimeout(() => {
                    refreshQuickAccessUI();
                }, 100);
            }
        });

        // Shortcuts Search Filter
        if (this.shortcutSearchInput && this.shortcutTable) {
            const tableBody = this.shortcutTable.querySelector('tbody');
            this.shortcutSearchInput.oninput = () => {
                const query = this.shortcutSearchInput.value.toLowerCase().trim();
                const rows = tableBody.querySelectorAll('tr:not(.no-results-row)');
                let visibleCount = 0;
                
                rows.forEach(row => {
                    const actionCell = row.cells[0]?.textContent.toLowerCase() || '';
                    const keyCell = row.cells[1]?.textContent.toLowerCase() || '';
                    if (actionCell.includes(query) || keyCell.includes(query)) {
                        row.style.display = '';
                        visibleCount++;
                    } else {
                        row.style.display = 'none';
                    }
                });

                // Remove existing "No results" row if present
                const existingNoResults = tableBody.querySelector('.no-results-row');
                if (existingNoResults) {
                    existingNoResults.remove();
                }

                // If no visible rows, add a beautiful premium placeholder row
                if (visibleCount === 0) {
                    const noResultsRow = document.createElement('tr');
                    noResultsRow.className = 'no-results-row';
                    noResultsRow.innerHTML = `
                        <td colspan="2" style="text-align: center; padding: 30px; color: var(--text-muted); font-style: italic;">
                            一致するショートカットが見つかりません
                        </td>
                    `;
                    tableBody.appendChild(noResultsRow);
                }
            };
        }

        // Wallpaper events
        this.bindWallpaperEvents();
    },

    addExtension() {
        const label = this.newExtLabelInput.value.trim();
        let ext = this.newExtValueInput.value.trim();

        if (!label || !ext) return;

        // 拡張子のドットを補完
        if (!ext.startsWith('.')) ext = '.' + ext;

        const newExt = {
            id: Date.now().toString(),
            label: label,
            extension: ext
        };

        const list = this.getCustomExtensions();
        list.push(newExt);
        this.saveCustomExtensions(list);

        this.newExtLabelInput.value = '';
        this.newExtValueInput.value = '';
        this.renderCustomizationTab();
        this.notifyChange();
    },

    removeExtension(id) {
        const list = this.getCustomExtensions();
        const filtered = list.filter(item => item.id !== id);
        this.saveCustomExtensions(filtered);
        this.renderCustomizationTab();
        this.notifyChange();
    },

    handleExtDragStart(e, id) {
        e.dataTransfer.setData('text/plain', id);
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },

    handleExtDragOver(e) {
        e.preventDefault();
        const item = e.target.closest('.extension-item');
        if (!item || item.classList.contains('dragging')) return;

        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        item.classList.remove('drag-over-top', 'drag-over-bottom');
        if (e.clientY < midpoint) {
            item.classList.add('drag-over-top');
        } else {
            item.classList.add('drag-over-bottom');
        }
    },

    handleExtDragLeave(e) {
        const item = e.target.closest('.extension-item');
        if (item) {
            item.classList.remove('drag-over-top', 'drag-over-bottom');
        }
    },

    handleExtDrop(e, targetId) {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        const item = e.target.closest('.extension-item');
        if (!item || draggedId === targetId) {
            document.querySelectorAll('.extension-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging'));
            return;
        }

        const isAfter = item.classList.contains('drag-over-bottom');
        const list = this.getCustomExtensions();
        
        const draggedIndex = list.findIndex(i => i.id === draggedId);
        const targetIndex = list.findIndex(i => i.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;

        const [draggedItem] = list.splice(draggedIndex, 1);
        const newIndex = list.findIndex(i => i.id === targetId);
        list.splice(isAfter ? newIndex + 1 : newIndex, 0, draggedItem);

        this.saveCustomExtensions(list);
        this.renderCustomizationTab();
        this.notifyChange();
    },

    getCustomExtensions() {
        const data = localStorage.getItem('settings-custom-new-files');
        return data ? JSON.parse(data) : [
            { id: 'default-text', label: 'テキストファイル', extension: '.txt' }
        ];
    },

    saveCustomExtensions(list) {
        localStorage.setItem('settings-custom-new-files', JSON.stringify(list));
    },

    renderCustomizationTab() {
        if (!this.extListContainer) return;

        const list = this.getCustomExtensions();
        this.extListContainer.innerHTML = '';

        list.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'extension-item';
            div.draggable = true;
            div.dataset.id = item.id;

            div.innerHTML = `
                <div class="drag-handle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                </div>
                <span class="extension-label">${item.label}</span>
                <span class="extension-value">${item.extension}</span>
                <button class="btn-delete-ext" title="削除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            
            // D&D Events
            div.ondragstart = (e) => this.handleExtDragStart(e, item.id);
            div.ondragover = (e) => this.handleExtDragOver(e);
            div.ondragleave = (e) => this.handleExtDragLeave(e);
            div.ondrop = (e) => this.handleExtDrop(e, item.id);
            div.ondragend = () => {
                document.querySelectorAll('.extension-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging'));
            };

            const btnDelete = div.querySelector('.btn-delete-ext');
            btnDelete.onclick = () => this.removeExtension(item.id);
            
            this.extListContainer.appendChild(div);
        });
    },

    notifyChange() {
        // storageイベントを発火させるために値を更新（別ウィンドウ用）
        localStorage.setItem('settings-custom-new-files-updated', Date.now());
        
        // 同一ウィンドウ内のメニューを即座に更新
        if (typeof window.updateNewFileMenus === 'function') {
            window.updateNewFileMenus();
        } else if (typeof updateNewFileMenus === 'function') {
            updateNewFileMenus();
        }
    },

    switchTab(tabId) {
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });

        if (tabId === 'customization') {
            this.renderCustomizationTab();
        }
    },

    applyThemePreset(theme) {
        document.body.classList.remove('theme-deepblue', 'theme-khaki', 'theme-sakura', 'theme-amber', 'theme-sky', 'theme-midnight', 'light-mode');
        this.themeOptions.forEach(opt => opt.classList.remove('active'));
        document.querySelectorAll('.user-theme-option').forEach(opt => opt.classList.remove('active'));
        
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
            
            // プレビュー表示の簡素化（斜め分割）
            const bg = theme.colors ? (theme.colors['--bg-main'] || '#1e1e1e') : '#1e1e1e';
            const accent = theme.colors ? (theme.colors['--accent-color'] || '#007acc') : '#007acc';
            
            opt.innerHTML = `
                <div class="theme-preview" style="background: linear-gradient(135deg, ${bg} 50%, ${accent} 50%); border:1px solid var(--border-main);">
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

    async loadSettings() {
        // Dark Mode state
        const isDark = localStorage.getItem('isDarkMode') !== 'false';
        if (!isDark) document.body.classList.add('light-mode');

        // Theme Preset
        const theme = localStorage.getItem('app-theme') || (isDark ? 'default' : 'snow');
        
        if (theme.startsWith('custom-')) {
            const customData = localStorage.getItem('custom-theme-data');
            if (customData) {
                try {
                    const themeObj = JSON.parse(customData);
                    if (typeof applyTheme === 'function') {
                        applyTheme(null, themeObj);
                    }
                } catch (e) {
                    console.error('Failed to load custom theme data:', e);
                    this.applyThemePreset('default');
                }
            } else {
                this.applyThemePreset('default');
            }
        } else {
            this.applyThemePreset(theme);
        }

        // Font Size
        const fontSize = localStorage.getItem('settings-font-size') || '13';
        if (this.fontSizeSlider) {
            this.fontSizeSlider.value = fontSize;
            this.fontSizeValue.textContent = fontSize + 'px';
            document.documentElement.style.setProperty('--main-font-size', fontSize + 'px');
            this.updateSliderProgress(this.fontSizeSlider);
        }



        // Zoom
        const zoom = localStorage.getItem('settings-zoom') || '100';
        if (this.zoomSlider) {
            this.zoomSlider.value = zoom;
            this.zoomValue.textContent = zoom + '%';
            this.applyZoom(zoom);
            this.updateSliderProgress(this.zoomSlider);
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

        // Native Properties
        const nativePropertiesEnabled = localStorage.getItem('settings-native-properties') === 'true';
        if (this.nativePropertiesToggle) {
            this.nativePropertiesToggle.checked = nativePropertiesEnabled;
        }

        // Vim Mode load
        const vimModeEnabled = localStorage.getItem('settings-vim-mode') === 'true';
        if (this.vimModeToggle) {
            this.vimModeToggle.checked = vimModeEnabled;
        }
        const badge = document.getElementById('vim-mode-badge');
        if (badge) badge.style.display = vimModeEnabled ? 'inline-block' : 'none';

        // Default Shell load
        const defaultShell = localStorage.getItem('settings-default-shell') || 'CMD';
        if (this.defaultShellSelect) {
            this.defaultShellSelect.value = defaultShell;
        }
        if (window.api && typeof window.api.sendCommand === 'function') {
            window.api.sendCommand(`SET_SHELL|${defaultShell}`);
        }

        // User Themes
        this.loadUserThemes();
        
        // Customization
        this.renderCustomizationTab();

        // Wallpapers
        await this.loadWallpapers();
    },

    applyHighContrast(enabled) {
        document.body.classList.toggle('high-contrast', enabled);
    },

    applyZoom(zoomPercent) {
        const factor = zoomPercent / 100;
        if (this.appContainer) {
            this.appContainer.style.zoom = factor;
            this.appContainer.style.height = (100 / factor) + 'vh';
            this.appContainer.style.width = (100 / factor) + 'vw';

            // 表示倍率（Zoom）の変更時に、ネイティブのウィンドウ操作ボタン（最小化・最大化・閉じる）が
            // 下のツールバーに重なったりタブと被ったりするのを防ぐため、タブバーの高さと右余白を動的に補正します。
            const tabBar = document.getElementById('tab-bar');
            if (tabBar) {
                // 画面上でのタブバーの物理的な高さを常に40px以上に保つ
                const adjustedHeight = Math.max(40, 40 / factor);
                tabBar.style.height = adjustedHeight + 'px';

                // 右側の余白もズームに応じて動的に調整（物理的な余白を常に140px以上に保つ）
                const adjustedPaddingRight = Math.max(140, 140 / factor);
                tabBar.style.paddingRight = adjustedPaddingRight + 'px';
            }
        }
    },

    async loadWallpapers() {
        const globalActive = localStorage.getItem('settings-global-wallpaper-active') === 'true';
        const globalFit = localStorage.getItem('settings-global-wallpaper-fit') || 'cover';
        const globalOpacity = localStorage.getItem('settings-global-wallpaper-opacity') || '65';
        let activeId = localStorage.getItem('settings-active-wallpaper-id') || '';

        if (this.globalWallpaperMode) {
            this.globalWallpaperMode.value = globalActive ? 'image' : 'none';
        }
        if (this.globalWallpaperFit) {
            this.globalWallpaperFit.value = globalFit;
        }
        if (this.wallpaperOpacitySlider) {
            this.wallpaperOpacitySlider.value = globalOpacity;
            if (this.wallpaperOpacityValue) {
                this.wallpaperOpacityValue.textContent = globalOpacity + '%';
            }
            this.updateSliderProgress(this.wallpaperOpacitySlider);
        }

        // Fetch the 5 wallpapers history list via IPC
        let history = [];
        try {
            history = await window.api.invoke('GET_WALLPAPERS');
        } catch (e) {
            console.error('Failed to get wallpapers history:', e.message);
        }

        // If no activeId is selected but we have history, default to the first (newest) item
        if (!activeId && history.length > 0) {
            activeId = history[0].id;
            localStorage.setItem('settings-active-wallpaper-id', activeId);
        }

        // Dynamically draw the 5 thumbnail cards in wallpaperHistoryList
        if (this.wallpaperHistoryList) {
            this.wallpaperHistoryList.innerHTML = '';
            
            // Draw up to 5 slots
            for (let i = 0; i < 5; i++) {
                const card = document.createElement('div');
                card.className = 'wallpaper-option';
                
                const preview = document.createElement('div');
                preview.className = 'wallpaper-preview';
                
                if (history[i]) {
                    // This slot has a wallpaper
                    const img = document.createElement('img');
                    img.src = history[i].dataUrl;
                    img.alt = `Wallpaper ${i + 1}`;
                    preview.appendChild(img);
                    
                    const item = history[i];
                    card.dataset.wallpaperId = item.id;
                    if (globalActive && item.id === activeId) {
                        card.classList.add('active');
                    }
                    
                    // Click to select this wallpaper
                    card.onclick = (e) => {
                        const targetId = e.currentTarget.dataset.wallpaperId;
                        localStorage.setItem('settings-global-wallpaper-active', 'true');
                        localStorage.setItem('settings-active-wallpaper-id', targetId);
                        SettingsManager.loadWallpapers();
                    };
                } else {
                    // Empty slot
                    card.classList.add('empty-slot');
                    // Add dashed/dotted placeholder with picture SVG icon
                    preview.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
                }
                
                card.appendChild(preview);
                this.wallpaperHistoryList.appendChild(card);
            }
        }

        // Apply background styling to document.body
        const activeItem = history.find(item => item.id === activeId);
        if (globalActive && activeItem) {
            document.body.setAttribute('data-wallpaper-active', 'true');
            document.documentElement.style.setProperty('--global-wallpaper-url', `url("${activeItem.dataUrl}")`);
            document.documentElement.style.setProperty('--global-wallpaper-fit', globalFit);
            document.documentElement.style.setProperty('--global-glass-opacity', `${globalOpacity}%`);
            // Calc proportional settings glass opacity (+10%, max 95%)
            const settingsOpacity = Math.min(95, parseInt(globalOpacity) + 10);
            document.documentElement.style.setProperty('--global-glass-opacity-settings', `${settingsOpacity}%`);

            // 壁紙の画像から色を自動で抽出し、操作バーおよびアプリのテーマカラーをシームレスに同期
            if (typeof extractColorFromWallpaper === 'function') {
                extractColorFromWallpaper(activeItem.dataUrl);
            }
        } else {
            document.body.removeAttribute('data-wallpaper-active');
            document.documentElement.style.removeProperty('--global-wallpaper-url');
            document.documentElement.style.removeProperty('--global-wallpaper-fit');
            document.documentElement.style.removeProperty('--global-glass-opacity');
            document.documentElement.style.removeProperty('--global-glass-opacity-settings');

            // 壁紙が無効になった場合は、現在のテーマ背景を解析して通常通り同期
            if (typeof applyTheme === 'function') {
                const currentTheme = localStorage.getItem('app-theme') || 'default';
                const customData = localStorage.getItem('custom-theme-data');
                applyTheme(currentTheme, customData ? JSON.parse(customData) : null);
            }
        }
    },

    bindWallpaperEvents() {
        if (this.globalWallpaperMode) {
            this.globalWallpaperMode.onchange = () => {
                const isImage = this.globalWallpaperMode.value === 'image';
                localStorage.setItem('settings-global-wallpaper-active', isImage);
                SettingsManager.loadWallpapers();
            };
        }

        if (this.globalWallpaperFit) {
            this.globalWallpaperFit.onchange = () => {
                const fit = this.globalWallpaperFit.value;
                localStorage.setItem('settings-global-wallpaper-fit', fit);
                SettingsManager.loadWallpapers();
            };
        }

        if (this.btnSelectGlobalWallpaper) {
            this.btnSelectGlobalWallpaper.onclick = async () => {
                try {
                    await window.api.invoke('OPEN_WALLPAPER_SELECT_WINDOW');
                } catch (e) {
                    console.error('Failed to open wallpaper select window:', e);
                }
            };
        }

        if (this.btnClearGlobalWallpaper) {
            this.btnClearGlobalWallpaper.onclick = async () => {
                try {
                    const history = await window.api.invoke('CLEAR_WALLPAPER');
                    localStorage.setItem('settings-global-wallpaper-active', 'false');
                    localStorage.removeItem('settings-active-wallpaper-id');
                    await SettingsManager.loadWallpapers();
                } catch (e) {
                    console.error('Failed to clear wallpapers history:', e);
                }
            };
        }

        if (this.wallpaperOpacitySlider) {
            const setOpacity = (opacity) => {
                this.wallpaperOpacitySlider.value = opacity;
                if (this.wallpaperOpacityValue) {
                    this.wallpaperOpacityValue.textContent = opacity + '%';
                }
                localStorage.setItem('settings-global-wallpaper-opacity', opacity);
                this.updateSliderProgress(this.wallpaperOpacitySlider);
                SettingsManager.loadWallpapers();
            };
            this.wallpaperOpacitySlider.oninput = () => {
                setOpacity(this.wallpaperOpacitySlider.value);
            };
            this.wallpaperOpacitySlider.ondblclick = () => setOpacity(65);
            if (this.resetWallpaperOpacityBtn) {
                this.resetWallpaperOpacityBtn.onclick = () => setOpacity(65);
            }
        }

        // グローバルなデフォルトのD&D動作を防止（ナビゲーション防止等）
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
        }, false);
        window.addEventListener('drop', (e) => {
            e.preventDefault();
        }, false);


    }
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    SettingsManager.init();
});
