const SettingsManager = {
    // 設定マネージャーを初期化する
    async init() {
        this.cacheDOM();
        this.bindEvents();
        this.formatShortcutKeys();
        await this.loadSettings();
    },

    // DOM要素をキャッシュする
    cacheDOM() {
        this.screen = document.getElementById('settings-screen');
        this.openBtn = document.getElementById('btn-settings');
        this.closeBtn = document.getElementById('btn-close-settings');
        this.tabBtns = document.querySelectorAll('.settings-tab-btn');
        this.tabContents = document.querySelectorAll('.settings-tab-content');
        
        this.windowPreviewToggle = document.getElementById('toggle-window-preview');
        this.nativePropertiesToggle = document.getElementById('toggle-native-properties');

        this.themeOptions = document.querySelectorAll('.theme-option');
        this.highContrastToggle = document.getElementById('toggle-high-contrast');
        
        this.fontSizeSlider = document.getElementById('font-size-slider');
        this.fontSizeValue = document.getElementById('font-size-value');

        this.zoomSlider = document.getElementById('zoom-slider');
        this.zoomValue = document.getElementById('zoom-value');
        this.appContainer = document.querySelector('.app-container');

        this.userThemesContainer = document.getElementById('user-themes-container');
        this.openThemesFolderBtn = document.getElementById('btn-open-themes-folder');
        this.refreshThemesBtn = document.getElementById('btn-refresh-themes');

        this.newExtLabelInput = document.getElementById('new-ext-label');
        this.newExtValueInput = document.getElementById('new-ext-value');
        this.addExtBtn = document.getElementById('btn-add-extension');
        this.extListContainer = document.getElementById('custom-extension-list');

        this.globalWallpaperMode = document.getElementById('global-wallpaper-mode');
        this.btnSelectGlobalWallpaper = document.getElementById('btn-select-global-wallpaper');
        this.btnClearGlobalWallpaper = document.getElementById('btn-clear-global-wallpaper');
        this.globalWallpaperFit = document.getElementById('global-wallpaper-fit');
        this.wallpaperHistoryList = document.getElementById('wallpaper-history-list');
        this.wallpaperOpacitySlider = document.getElementById('wallpaper-opacity-slider');
        this.wallpaperOpacityValue = document.getElementById('wallpaper-opacity-value');
        this.wallpaperDropzone = document.getElementById('wallpaper-dropzone');

        this.resetFontSizeBtn = document.getElementById('reset-font-size');
        this.resetZoomBtn = document.getElementById('reset-zoom');
        this.resetWallpaperOpacityBtn = document.getElementById('reset-wallpaper-opacity');

        this.shortcutSearchInput = document.getElementById('shortcut-search-input');
        this.shortcutTable = document.querySelector('.shortcut-list');
    },

    // スライダーの進捗表示（背景色）を更新する
    updateSliderProgress(slider) {
        if (!slider) return;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value) || 0;
        const percent = ((val - min) / (max - min)) * 100;
        slider.style.setProperty('--slider-progress', percent + '%');
    },

    // ショートカットキーの表示スタイルを整形する
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

    // 設定画面のイベントリスナーを登録する
    bindEvents() {
        if (this.openBtn) {
            this.openBtn.onclick = () => {
                const activeTab = document.querySelector('.settings-tab-btn.active');
                const tabId = activeTab ? activeTab.dataset.tab : 'contents';
                this.switchTab(tabId);
                this.screen.style.display = 'flex';
            };
        }

        this.tabBtns.forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });

        if (this.closeBtn) {
            this.closeBtn.onclick = () => {
                this.screen.style.display = 'none';
                window.api.invoke('CLOSE_WALLPAPER_SELECT_WINDOW');
            };
        }

        if (this.screen) {
            this.screen.onclick = (e) => {
                if (e.target === this.screen) {
                    this.screen.style.display = 'none';
                    window.api.invoke('CLOSE_WALLPAPER_SELECT_WINDOW');
                }
            };
        }

        this.themeOptions.forEach(opt => {
            opt.onclick = () => {
                const theme = opt.dataset.theme;
                this.applyThemePreset(theme);
            };
        });

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

        if (this.highContrastToggle) {
            this.highContrastToggle.onchange = () => {
                const enabled = this.highContrastToggle.checked;
                localStorage.setItem('settings-high-contrast', enabled);
                this.applyHighContrast(enabled);
            };
        }

        if (this.windowPreviewToggle) {
            this.windowPreviewToggle.onchange = () => {
                const enabled = this.windowPreviewToggle.checked;
                localStorage.setItem('settings-window-preview', enabled);
            };
        }

        if (this.nativePropertiesToggle) {
            this.nativePropertiesToggle.onchange = () => {
                const enabled = this.nativePropertiesToggle.checked;
                localStorage.setItem('settings-native-properties', enabled);
            };
        }

        if (this.openThemesFolderBtn) {
            this.openThemesFolderBtn.onclick = () => {
                window.api.invoke('OPEN_THEMES_FOLDER');
            };
        }

        if (this.refreshThemesBtn) {
            this.refreshThemesBtn.onclick = () => {
                this.loadUserThemes();
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

        if (this.addExtBtn) {
            this.addExtBtn.onclick = () => this.addExtension();
        }

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

                const existingNoResults = tableBody.querySelector('.no-results-row');
                if (existingNoResults) {
                    existingNoResults.remove();
                }

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

        this.bindWallpaperEvents();
    },

    // 新規作成用のカスタム拡張子を追加する
    addExtension() {
        const label = this.newExtLabelInput.value.trim();
        let ext = this.newExtValueInput.value.trim();

        if (!label || !ext) return;

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

    // カスタム拡張子を削除する
    removeExtension(id) {
        const list = this.getCustomExtensions();
        const filtered = list.filter(item => item.id !== id);
        this.saveCustomExtensions(filtered);
        this.renderCustomizationTab();
        this.notifyChange();
    },

    // カスタム拡張子のドラッグ開始イベントを処理する
    handleExtDragStart(e, id) {
        e.dataTransfer.setData('text/plain', id);
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },

    // カスタム拡張子のドラッグオーバーイベントを処理する
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

    // カスタム拡張子のドラッグリーブイベントを処理する
    handleExtDragLeave(e) {
        const item = e.target.closest('.extension-item');
        if (item) {
            item.classList.remove('drag-over-top', 'drag-over-bottom');
        }
    },

    // カスタム拡張子のドロップイベントを処理する
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

    // 保存されているカスタム拡張子リストを取得する
    getCustomExtensions() {
        const data = localStorage.getItem('settings-custom-new-files');
        return data ? JSON.parse(data) : [
            { id: 'default-text', label: 'テキストファイル', extension: '.txt' }
        ];
    },

    // カスタム拡張子リストを保存する
    saveCustomExtensions(list) {
        localStorage.setItem('settings-custom-new-files', JSON.stringify(list));
    },

    // カスタマイズタブのコンテンツを描画する
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

    // カスタム拡張子の変更を通知・同期する
    notifyChange() {
        localStorage.setItem('settings-custom-new-files-updated', Date.now());
        
        if (typeof window.updateNewFileMenus === 'function') {
            window.updateNewFileMenus();
        } else if (typeof updateNewFileMenus === 'function') {
            updateNewFileMenus();
        }
    },

    // 設定画面の表示タブを切り替える
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

    // プリセットテーマを適用する
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
        localStorage.removeItem('custom-theme-data');
        
        if (typeof applyTheme === 'function') {
            applyTheme(theme);
        }
        
        if (typeof renderHomeContent === 'function' && isHomeActive) {
            renderHomeContent();
        } else if (typeof currentPath !== 'undefined' && currentPath) {
            window.api.sendCommand(`LIST|${currentPath}`);
        }
    },

    // テーマ設定の選択表示を更新する
    updateThemeActive(theme) {
        this.themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
        document.querySelectorAll('.user-theme-option').forEach(opt => {
            opt.classList.toggle('active', 'custom-' + opt.dataset.themeId === theme);
        });
        localStorage.setItem('app-theme', theme);
    },

    // ユーザー作成テーマ一覧を読み込む
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

    // ユーザー作成テーマを適用する
    applyCustomTheme(themeObj) {
        this.themeOptions.forEach(opt => opt.classList.remove('active'));
        document.querySelectorAll('.user-theme-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.themeId === themeObj.id);
        });

        if (typeof applyTheme === 'function') {
            applyTheme(null, themeObj);
        }
    },

    // 設定情報をロードし、画面や表示倍率、壁紙等を初期適用する
    async loadSettings() {
        const isDark = localStorage.getItem('isDarkMode') !== 'false';
        if (!isDark) document.body.classList.add('light-mode');

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

        const fontSize = localStorage.getItem('settings-font-size') || '13';
        if (this.fontSizeSlider) {
            this.fontSizeSlider.value = fontSize;
            this.fontSizeValue.textContent = fontSize + 'px';
            document.documentElement.style.setProperty('--main-font-size', fontSize + 'px');
            this.updateSliderProgress(this.fontSizeSlider);
        }

        const zoom = localStorage.getItem('settings-zoom') || '100';
        if (this.zoomSlider) {
            this.zoomSlider.value = zoom;
            this.zoomValue.textContent = zoom + '%';
            this.applyZoom(zoom);
            this.updateSliderProgress(this.zoomSlider);
        }

        const highContrastEnabled = localStorage.getItem('settings-high-contrast') === 'true';
        if (this.highContrastToggle) {
            this.highContrastToggle.checked = highContrastEnabled;
            this.applyHighContrast(highContrastEnabled);
        }

        const windowPreviewEnabled = localStorage.getItem('settings-window-preview') === 'true';
        if (this.windowPreviewToggle) {
            this.windowPreviewToggle.checked = windowPreviewEnabled;
        }

        const nativePropertiesEnabled = localStorage.getItem('settings-native-properties') === 'true';
        if (this.nativePropertiesToggle) {
            this.nativePropertiesToggle.checked = nativePropertiesEnabled;
        }

        this.loadUserThemes();
        this.renderCustomizationTab();
        await this.loadWallpapers();
    },

    // ハイコントラストモードの適用を切り替える
    applyHighContrast(enabled) {
        document.body.classList.toggle('high-contrast', enabled);
    },

    // アプリケーション全体のズーム倍率を適用・調整する
    applyZoom(zoomPercent) {
        const factor = zoomPercent / 100;
        if (this.appContainer) {
            this.appContainer.style.zoom = factor;
            this.appContainer.style.height = (100 / factor) + 'vh';
            this.appContainer.style.width = (100 / factor) + 'vw';

            const tabBar = document.getElementById('tab-bar');
            if (tabBar) {
                const adjustedHeight = Math.max(40, 40 / factor);
                tabBar.style.height = adjustedHeight + 'px';

                const adjustedPaddingRight = Math.max(140, 140 / factor);
                tabBar.style.paddingRight = adjustedPaddingRight + 'px';
            }
        }
    },

    // 壁紙情報（履歴）をロードして適用・サムネイル描画を行う
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

        let history = [];
        try {
            history = await window.api.invoke('GET_WALLPAPERS');
        } catch (e) {
            console.error('Failed to get wallpapers history:', e.message);
        }

        if (!activeId && history.length > 0) {
            activeId = history[0].id;
            localStorage.setItem('settings-active-wallpaper-id', activeId);
        }

        if (this.wallpaperHistoryList) {
            this.wallpaperHistoryList.innerHTML = '';
            
            for (let i = 0; i < 5; i++) {
                const card = document.createElement('div');
                card.className = 'wallpaper-option';
                
                const preview = document.createElement('div');
                preview.className = 'wallpaper-preview';
                
                if (history[i]) {
                    const img = document.createElement('img');
                    img.src = history[i].dataUrl;
                    img.alt = `Wallpaper ${i + 1}`;
                    preview.appendChild(img);
                    
                    const item = history[i];
                    card.dataset.wallpaperId = item.id;
                    if (globalActive && item.id === activeId) {
                        card.classList.add('active');
                    }
                    
                    card.onclick = (e) => {
                        const targetId = e.currentTarget.dataset.wallpaperId;
                        localStorage.setItem('settings-global-wallpaper-active', 'true');
                        localStorage.setItem('settings-active-wallpaper-id', targetId);
                        SettingsManager.loadWallpapers();
                    };
                } else {
                    card.classList.add('empty-slot');
                    preview.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
                }
                
                card.appendChild(preview);
                this.wallpaperHistoryList.appendChild(card);
            }
        }

        const activeItem = history.find(item => item.id === activeId);
        if (globalActive && activeItem) {
            document.body.setAttribute('data-wallpaper-active', 'true');
            document.documentElement.style.setProperty('--global-wallpaper-url', `url("${activeItem.dataUrl}")`);
            document.documentElement.style.setProperty('--global-wallpaper-fit', globalFit);
            document.documentElement.style.setProperty('--global-glass-opacity', `${globalOpacity}%`);
            const settingsOpacity = Math.min(95, parseInt(globalOpacity) + 10);
            document.documentElement.style.setProperty('--global-glass-opacity-settings', `${settingsOpacity}%`);

            if (typeof extractColorFromWallpaper === 'function') {
                extractColorFromWallpaper(activeItem.dataUrl);
            }
        } else {
            document.body.removeAttribute('data-wallpaper-active');
            document.documentElement.style.removeProperty('--global-wallpaper-url');
            document.documentElement.style.removeProperty('--global-wallpaper-fit');
            document.documentElement.style.removeProperty('--global-glass-opacity');
            document.documentElement.style.removeProperty('--global-glass-opacity-settings');

            if (typeof applyTheme === 'function') {
                const currentTheme = localStorage.getItem('app-theme') || 'default';
                const customData = localStorage.getItem('custom-theme-data');
                applyTheme(currentTheme, customData ? JSON.parse(customData) : null);
            }
        }
    },

    // 壁紙関連の設定項目イベントを登録する
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
                    await window.api.invoke('CLEAR_WALLPAPER');
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

        window.addEventListener('dragover', (e) => {
            e.preventDefault();
        }, false);
        window.addEventListener('drop', (e) => {
            e.preventDefault();
        }, false);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    SettingsManager.init();
});
