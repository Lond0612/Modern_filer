/**
 * ShortcutManager
 * アプリケーション全体のショートカットキーを一括管理するクラス
 */
const ShortcutManager = {
    shortcuts: [],
    isEnabled: true,

    init() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
        console.log('ShortcutManager initialized');
        
        // 依存関係（renderer.jsの関数など）が読み込まれるのを待ってから登録
        this.applyDefaultConfiguration();
    },

    register(keyCombo, callback, options = {}) {
        this.shortcuts.push({
            combo: keyCombo,
            callback: callback,
            options: {
                preventDefault: options.preventDefault !== false,
                allowInInputs: options.allowInInputs === true
            }
        });
    },

    handleKeyDown(e) {
        if (!this.isEnabled) return;

        const active = document.activeElement;
        const isInput = active && (
            active.tagName === 'INPUT' || 
            active.tagName === 'TEXTAREA' || 
            active.isContentEditable
        );

        for (const s of this.shortcuts) {
            if (this.isMatch(e, s.combo)) {
                if (isInput && !s.options.allowInInputs) continue;
                if (s.options.preventDefault) e.preventDefault();
                s.callback(e);
                return;
            }
        }
    },

    isMatch(e, combo) {
        const parts = combo.split('+');
        const mainKey = parts.pop().toLowerCase();
        const hasCtrl = parts.some(p => p.toLowerCase() === 'ctrl');
        const hasShift = parts.some(p => p.toLowerCase() === 'shift');
        const hasAlt = parts.some(p => p.toLowerCase() === 'alt');

        const keyMatch = e.key.toLowerCase() === mainKey || 
                         e.code.toLowerCase() === mainKey ||
                         e.code.toLowerCase() === 'digit' + mainKey ||
                         e.code.toLowerCase() === 'key' + mainKey ||
                         (mainKey === 'enter' && e.key === 'Enter') ||
                         (mainKey === 'space' && e.key === ' ');

        return keyMatch && e.ctrlKey === hasCtrl && e.shiftKey === hasShift && e.altKey === hasAlt;
    },

    // ---------------------------------------------------------------------------
    // デフォルトショートカット設定
    // ---------------------------------------------------------------------------
    applyDefaultConfiguration() {
        // ファイル操作
        this.register('F2', () => {
            const selectedRows = document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected');
            if (selectedRows.length > 0 && typeof startRename === 'function') startRename(selectedRows[0]);
        });
        this.register('Ctrl+n', () => {
            const tab = typeof getActiveTab === 'function' ? getActiveTab() : null;
            window.api.invoke('OPEN_NEW_WINDOW', tab ? tab.path : 'HOME');
        });
        this.register('Alt+Enter', () => {
            let targetPath = null;
            if (window.contextTarget) {
                targetPath = window.contextTarget.path;
            } else if (typeof getSelectedItems === 'function') {
                const selected = getSelectedItems();
                if (selected.length > 0) targetPath = selected[0].srcPath;
            }

            if (targetPath) {
                const useNative = localStorage.getItem('settings-native-properties') === 'true';
                if (useNative) window.api.sendCommand(`PROP_NATIVE|${targetPath}`);
                else if (typeof showPropertiesModal === 'function') showPropertiesModal(targetPath);
            }
        });
        this.register('Ctrl+a', () => this.helpers.selectAllItems());
        this.register('Ctrl+c', () => document.getElementById('btn-copy')?.click());
        this.register('Ctrl+x', () => document.getElementById('btn-cut')?.click());
        this.register('Ctrl+v', () => document.getElementById('btn-paste')?.click());
        this.register('Ctrl+d', () => this.helpers.deleteSelectedItems(false));
        this.register('Shift+d', () => this.helpers.deleteSelectedItems(true));
        this.register('Ctrl+Shift+n', () => this.helpers.createNewFolder());

        // ナビゲーション
        this.register('Alt+ArrowUp', () => document.getElementById('btn-up')?.click());
        this.register('Alt+ArrowLeft', () => document.getElementById('btn-back')?.click());
        this.register('Alt+ArrowRight', () => document.getElementById('btn-forward')?.click());
        this.register('Ctrl+Shift+e', () => this.helpers.expandAllTreeFolders());
        
        // 検索
        this.register('Ctrl+e', () => this.helpers.focusSearch());
        this.register('Ctrl+f', () => this.helpers.focusSearch());
        this.register('F3', () => this.helpers.focusSearch());

        // 表示モード (Ctrl + Shift + 1-6)
        const modes = ['extralarge', 'large', 'medium', 'small', 'compact', 'details'];
        modes.forEach((m, i) => {
            this.register(`Ctrl+Shift+${i + 1}`, () => this.helpers.changeViewMode(m));
        });

        // ウィンドウ操作
        this.register('F11', () => window.api.send('TOGGLE_MAXIMIZE'));

        // プレビュー表示の切り替え
        this.register('Space', () => {
            if (typeof PreviewManager !== 'undefined') PreviewManager.toggle();
        });

        // 選択項目の上下移動
        this.register('ArrowDown', (e) => this.helpers.navigateSelection(1, e.shiftKey));
        this.register('ArrowUp', (e) => this.helpers.navigateSelection(-1, e.shiftKey));

        // タブ操作
        this.register('Ctrl+t', () => typeof addTab === 'function' && addTab('HOME'));
        this.register('Ctrl+w', () => typeof closeTab === 'function' && closeTab(window.activeTabId));
        
        this.register('Ctrl+Tab', (e) => {
            if (typeof switchTab !== 'function') return;
            const index = window.tabs.findIndex(t => t.id === window.activeTabId);
            const next = (index + 1) % window.tabs.length;
            switchTab(window.tabs[next].id);
        });
        
        this.register('Ctrl+Shift+Tab', (e) => {
            if (typeof switchTab !== 'function') return;
            const index = window.tabs.findIndex(t => t.id === window.activeTabId);
            const prev = (index - 1 + window.tabs.length) % window.tabs.length;
            switchTab(window.tabs[prev].id);
        });

        this.register('Ctrl+Shift+t', () => typeof restoreRecentlyClosedTab === 'function' && restoreRecentlyClosedTab());

        // タブの数字キー切り替え (Ctrl+1 ~ 9)
        for (let i = 1; i <= 9; i++) {
            this.register(`Ctrl+${i}`, () => {
                if (window.tabs && window.tabs[i - 1] && typeof switchTab === 'function') {
                    switchTab(window.tabs[i - 1].id);
                }
            });
        }
    },

    // ---------------------------------------------------------------------------
    // ヘルパー関数群
    // ---------------------------------------------------------------------------
    helpers: {
        selectAllItems() {
            const items = document.querySelectorAll('#file-list-body tr, .grid-item');
            items.forEach(el => el.classList.add('selected'));
            if (typeof onSelectionChanged === 'function') onSelectionChanged();
        },

        focusSearch() {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        },

        createNewFolder() {
            if (window.isHomeActive) return;
            if (typeof resolveNameConflict !== 'function') return;
            let defaultName = resolveNameConflict('新しいフォルダ');
            // renderer.js内の変数を直接いじるのは難しいため、window経由の操作が必要になる可能性があるが
            // 一旦既存のロジックを模倣
            window.api.sendCommand(`MKDIR|${window.currentPath}${defaultName}`);
        },

        expandAllTreeFolders() {
            document.querySelectorAll('.tree-expander:not(.expanded)').forEach(ex => {
                if (ex.style.visibility !== 'hidden') ex.click();
            });
        },

        deleteSelectedItems(permanent = false) {
            if (typeof getSelectedItems !== 'function') return;
            const selected = getSelectedItems();
            if (selected.length === 0) return;
            
            if (permanent) {
                if (!confirm(`${selected.length} 個の項目を完全に削除しますか？`)) return;
            }
            
            selected.forEach(item => {
                window.api.sendCommand(`DELETE|${item.srcPath}`);
            });
        },

        navigateSelection(direction, isShift = false) {
            const items = Array.from(document.querySelectorAll('#file-list-body tr, .grid-item'));
            if (items.length === 0) return;

            const selected = items.filter(i => i.classList.contains('selected'));
            let currentIndex = direction > 0 ? -1 : items.length;

            if (selected.length > 0) {
                if (direction > 0) currentIndex = items.indexOf(selected[selected.length - 1]);
                else currentIndex = items.indexOf(selected[0]);
            }

            let nextIndex = currentIndex + direction;
            if (nextIndex < 0) nextIndex = 0;
            if (nextIndex >= items.length) nextIndex = items.length - 1;

            if (isShift) {
                if (window.selectionAnchorIndex === -1) window.selectionAnchorIndex = currentIndex === -1 ? 0 : currentIndex;
                items.forEach(el => el.classList.remove('selected'));
                const start = Math.min(window.selectionAnchorIndex, nextIndex);
                const end = Math.max(window.selectionAnchorIndex, nextIndex);
                for (let i = start; i <= end; i++) items[i].classList.add('selected');
            } else {
                items.forEach(el => el.classList.remove('selected'));
                items[nextIndex].classList.add('selected');
                window.selectionAnchorIndex = nextIndex;
            }

            items[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (typeof onSelectionChanged === 'function') onSelectionChanged();
        },

        changeViewMode(mode) {
            const item = document.querySelector(`.view-mode[data-view-mode="${mode}"]`);
            if (item) item.click();
        }
    }
};

// 起動時に初期化
// renderer.js の読み込み完了を待つために load イベントを使用
window.addEventListener('load', () => {
    ShortcutManager.init();
});
