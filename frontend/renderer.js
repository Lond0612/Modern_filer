
// タブの状態と情報を管理するクラス
class Tab {
    constructor(id, path = 'HOME', isPinned = false) {
        this.id = id;
        this._path = 'HOME';
        this.path = path;
        this.isPinned = isPinned;
        this.isHomeActive = (path === 'HOME');
        this.historyBack = [];
        this.historyForward = [];
        this.scrollPosition = 0;
    }

    get path() {
        return this._path;
    }

    set path(val) {
        if (val && val !== 'HOME' && !val.endsWith('\\')) {
            this._path = val + '\\';
        } else {
            this._path = val;
        }
    }

    get title() {
        if (this.isHomeActive || this.path === 'HOME') return 'ホーム';
        const trimmed = this.path.endsWith('\\') ? this.path.slice(0, -1) : this.path;
        return trimmed.split('\\').pop() || this.path;
    }
}

let tabs = [];
let activeTabId = null;
let draggedTabId = null;
let tabDragStartX = 0;
let tabDragCurrentX = 0;
let tabDragOffsetX = 0;
let contextTabId = null;
let recentlyClosedTabs = [];
const tabContextMenu = document.getElementById('tab-context-menu');

// ピン留めされたタブの状態を保存する
function saveTabsState() {
    const pinnedTabs = tabs.filter(t => t.isPinned).map(t => ({
        id: t.id,
        path: t.path,
        isPinned: true
    }));
    localStorage.setItem('pinnedTabsState', JSON.stringify(pinnedTabs));
}

// ピン留めされたタブの状態を復元する
function loadTabsState() {
    const saved = localStorage.getItem('pinnedTabsState');
    if (saved) {
        try {
            const pinned = JSON.parse(saved);
            if (Array.isArray(pinned)) {
                tabs = pinned.map(t => new Tab(t.id, t.path, true));
                return true;
            }
        } catch (e) {
            console.error('Failed to load pinned tabs state', e);
        }
    }
    return false;
}

// 現在アクティブなタブオブジェクトを取得する
function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

// 互換性のためのゲッター/セッター（既存コードの修正を最小限にするため内部で activeTab のプロパティを参照するようにする）
// ※ 最終的にはこれらもリファクタリングして getActiveTab().path 等に置き換えるのが望ましい

function getCurrentPath() { return getActiveTab()?.path || ''; }
function setCurrentPath(val) { if (getActiveTab()) getActiveTab().path = val; }
function getIsHomeActive() { return getActiveTab()?.isHomeActive ?? true; }
function setIsHomeActive(val) { if (getActiveTab()) getActiveTab().isHomeActive = val; }
function getHistoryBack() { return getActiveTab()?.historyBack || []; }
function getHistoryForward() { return getActiveTab()?.historyForward || []; }

let contextTarget = null;
let selectionAnchorIndex = -1;

Object.defineProperty(window, 'currentPath', { get: getCurrentPath, set: setCurrentPath, configurable: true });
Object.defineProperty(window, 'isHomeActive', { get: getIsHomeActive, set: setIsHomeActive, configurable: true });
Object.defineProperty(window, 'historyBack', { get: getHistoryBack, configurable: true });
Object.defineProperty(window, 'historyForward', { get: getHistoryForward, configurable: true });

Object.defineProperty(window, 'activeTabId', { get: () => activeTabId, set: (val) => activeTabId = val, configurable: true });
Object.defineProperty(window, 'tabs', { get: () => tabs, set: (val) => tabs = val, configurable: true });
Object.defineProperty(window, 'contextTarget', { get: () => contextTarget, set: (val) => contextTarget = val, configurable: true });
Object.defineProperty(window, 'selectionAnchorIndex', { get: () => selectionAnchorIndex, set: (val) => selectionAnchorIndex = val, configurable: true });

let recentFolders = JSON.parse(localStorage.getItem('recentFolders') || '[]');
let pendingRename = null;

let clipboard = { mode: null, items: [] };

let quickAccessItems = JSON.parse(localStorage.getItem('quickAccessItems') || '[]').map(item => {
    if (item.path && !item.path.endsWith('\\')) item.path += '\\';
    return item;
});

// クイックアクセスの重複や不正なデータを修復する
function repairQuickAccess(paths) {
    if (!paths) return;
    const normalize = p => (p && !p.endsWith('\\')) ? p + '\\' : p;

    let changed = false;
    quickAccessItems.forEach(item => {
        if (item.label === "デスクトップ" && item.path !== normalize(paths.desktop)) { item.path = normalize(paths.desktop); changed = true; }
        if (item.label === "ダウンロード" && item.path !== normalize(paths.downloads)) { item.path = normalize(paths.downloads); changed = true; }
        if (item.label === "ドキュメント" && item.path !== normalize(paths.documents)) { item.path = normalize(paths.documents); changed = true; }
        if (item.label === "ミュージック" && item.path !== normalize(paths.music)) { item.path = normalize(paths.music); changed = true; }
        if (item.label === "ピクチャ" && item.path !== normalize(paths.pictures)) { item.path = normalize(paths.pictures); changed = true; }
        if (item.label === "ビデオ" && item.path !== normalize(paths.videos)) { item.path = normalize(paths.videos); changed = true; }
    });

    if (changed) {
        localStorage.setItem('quickAccessItems', JSON.stringify(quickAccessItems));
    }
}
let cachedSystemPaths = null;
// お気に入り
let favoriteItems = JSON.parse(localStorage.getItem('favoriteItems') || '[]').map(item => {
    if (item.path && !item.path.endsWith('\\')) item.path += '\\';
    return item;
});
let homeDisplayMode = localStorage.getItem('homeDisplayMode') || 'recent';
let isTerminalVisible = localStorage.getItem('isTerminalVisible') !== 'false';

let navigationLockUntil = 0;

// ナビゲーションがロックされているか判定する
function isNavigationLocked() {
    return Date.now() < navigationLockUntil;
}

// 指定時間ナビゲーションをロックする
function setNavigationLock(duration = 300) {
    navigationLockUntil = Date.now() + duration;
}

const addressInput = document.getElementById('address-input');
const btnSidebarHome = document.getElementById('btn-sidebar-home');
const homeView = document.getElementById('home-view');
const explorerView = document.getElementById('explorer-view');
const fileListBody = document.getElementById('file-list-body');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');

// ナビゲーションボタン
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnUp = document.getElementById('btn-up');
const btnRefresh = document.getElementById('btn-refresh');
const btnNew = document.getElementById('btn-new');
const btnCut = document.getElementById('btn-cut');
const btnCopy = document.getElementById('btn-copy');
const btnPaste = document.getElementById('btn-paste');
const btnDelete = document.getElementById('btn-delete');
const btnRename = document.getElementById('btn-rename');
const btnSort = document.getElementById('btn-sort');
const btnView = document.getElementById('btn-view');
const newMenu = document.getElementById('new-menu');
const sortMenu = document.getElementById('sort-menu');
const viewMenu = document.getElementById('view-menu');
const fileTable = document.getElementById('file-table');
const fileGrid = document.getElementById('file-grid');

let currentSortKey = 0;
let currentSortOrder = 0;
let currentViewMode = 'details';
let showHiddenFiles = false;
let showExtensions = true;
// ターミナルの表示状態を適用する
function applyTerminalVisibility() {
    const terminalPane = document.querySelector('.terminal-pane');
    const resizerTerminal = document.getElementById('resizer-terminal');
    const btnTerminalToggle = document.getElementById('btn-terminal-toggle');

    if (!terminalPane || !resizerTerminal || !btnTerminalToggle) return;

    if (isTerminalVisible) {
        terminalPane.style.display = '';
        resizerTerminal.style.display = '';
        btnTerminalToggle.classList.add('active');
    } else {
        terminalPane.style.display = 'none';
        resizerTerminal.style.display = 'none';
        btnTerminalToggle.classList.remove('active');
    }
}

// アプリケーション起動時の初期設定を行う
window.onload = () => {
    initTabs();
    initTabBarDragAndDrop();

    const btnTerminalToggle = document.getElementById('btn-terminal-toggle');
    if (btnTerminalToggle) {
        btnTerminalToggle.onclick = () => {
            isTerminalVisible = !isTerminalVisible;
            localStorage.setItem('isTerminalVisible', isTerminalVisible);
            applyTerminalVisibility();
        };
    }
    applyTerminalVisibility();

    window.addEventListener('beforeunload', () => {
        localStorage.setItem('isTerminalVisible', isTerminalVisible);
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectWallpaper') === 'true') {
        if (typeof window.startWallpaperSelectionMode === 'function') {
            window.startWallpaperSelectionMode();
        }
    }
};

// タブ状態の初期化を行う
function initTabs() {
    loadTabsState();

    const urlParams = new URLSearchParams(window.location.search);
    const initialPath = urlParams.get('path') || 'HOME';
    addTab(initialPath);
}

// タブバー全体に対するドラッグ＆ドロップイベントを設定する（空白部分へのドロップで新規タブ作成）
function initTabBarDragAndDrop() {
    const tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;

    tabBar.addEventListener('dragover', (e) => {
        e.preventDefault();
        // タブ自体の位置でなく、タブバーの空白部分または追加ボタンの上に乗っている場合のみハイライト
        if (e.target === tabBar || e.target.classList.contains('tab-add-btn')) {
            e.dataTransfer.dropEffect = 'move';
            tabBar.classList.add('drag-over');
        } else {
            tabBar.classList.remove('drag-over');
        }
    });

    tabBar.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (e.target === tabBar || e.target.classList.contains('tab-add-btn')) {
            tabBar.classList.add('drag-over');
        }
    });

    tabBar.addEventListener('dragleave', (e) => {
        if (!tabBar.contains(e.relatedTarget)) {
            tabBar.classList.remove('drag-over');
        }
    });

    tabBar.addEventListener('drop', (e) => {
        e.preventDefault();
        tabBar.classList.remove('drag-over');

        const tabItem = e.target.closest('.tab-item');
        if (tabItem) return;

        const srcPaths = getPathsFromDragEvent(e);
        if (srcPaths.length === 0) return;

        let isDir = false;
        let detected = false;
        try {
            const items = e.dataTransfer.items;
            if (items && items.length > 0) {
                const entry = items[0].webkitGetAsEntry();
                if (entry) {
                    isDir = entry.isDirectory;
                    detected = true;
                }
            }
        } catch (err) {
            console.error('webkitGetAsEntry failed:', err);
        }

        const srcPath = srcPaths[0];

        if (!detected) {
            const isLocalItem = srcPath.startsWith(currentPath);
            if (isLocalItem) {
                const localName = srcPath.substring(currentPath.length);
                const row = document.querySelector(`tr[data-name="${CSS.escape(localName)}"], .grid-item[data-name="${CSS.escape(localName)}"]`);
                if (row && row.dataset.type === 'D') {
                    isDir = true;
                    detected = true;
                }
            } else {
                const treeNode = document.querySelector(`.tree-node[data-path="${CSS.escape(srcPath)}"]`);
                if (treeNode) {
                    isDir = true;
                    detected = true;
                }
            }
        }

        setTimeout(async () => {
            try {
                let targetPath = srcPath;
                if (!detected) {
                    try {
                        isDir = await window.api.invoke('IS_DIRECTORY', srcPath);
                    } catch (err) {
                        console.error('Failed to check directory status via IPC:', err);
                    }
                }

                if (!isDir) {
                    const lastSlash = srcPath.lastIndexOf('\\');
                    if (lastSlash !== -1) {
                        targetPath = srcPath.substring(0, lastSlash + 1);
                    }
                }

                addTab(targetPath, true);
            } catch (err) {
                console.error('TabBar drop deferred execution error:', err);
            }
        }, 0);
    });
}

// 新規タブを追加する
function addTab(path = 'HOME', switchImmediately = true) {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const newTab = new Tab(id, path);

    const lastPinnedIndex = tabs.findLastIndex(t => t.isPinned);
    if (lastPinnedIndex !== -1) {
        tabs.splice(lastPinnedIndex + 1, 0, newTab);
    } else {
        tabs.push(newTab);
    }

    if (switchImmediately) {
        switchTab(id);
    } else {
        renderTabs();
    }
    saveTabsState();
}

// 指定したIDのタブに切り替える
function switchTab(id) {
    const prevTab = getActiveTab();
    if (prevTab) {
        prevTab.scrollPosition = explorerView.scrollTop;
    }

    activeTabId = id;
    const tab = getActiveTab();
    if (!tab) return;

    if (tab.isHomeActive || tab.path === 'HOME') {
        showHomeUI();
    } else {
        showExplorerUI(tab.path);
    }

    addressInput.value = tab.path;
    updateNavButtons();
    renderTabs();

    const tabEl = document.querySelector(`.tab-item[data-id="${id}"]`);
    if (tabEl) {
        tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    saveTabsState();

    if (tab.path && tab.path !== 'HOME') {
        window.api.sendCommand(`CD|${tab.path}`);
    }
}

// 指定したIDのタブを閉じる
function closeTab(id, e) {
    if (e) e.stopPropagation();

    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const tabToClose = tabs[index];
    if (tabs.length <= 1) {
        window.close();
        return;
    }

    recentlyClosedTabs.push({ path: tabToClose.path, isPinned: tabToClose.isPinned });
    if (recentlyClosedTabs.length > 20) recentlyClosedTabs.shift();

    const isActive = activeTabId === id;
    tabs.splice(index, 1);

    if (isActive) {
        const nextActiveIndex = Math.min(index, tabs.length - 1);
        switchTab(tabs[nextActiveIndex].id);
    } else {
        renderTabs();
    }
    saveTabsState();
}

// 直前に閉じたタブを復元する
function restoreRecentlyClosedTab() {
    const last = recentlyClosedTabs.pop();
    if (last) {
        addTab(last.path);
    }
}

// 全てのタブを描画する
function renderTabs() {
    const tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;

    const oldRects = new Map();
    tabBar.querySelectorAll('.tab-item').forEach(el => {
        const id = el.dataset.id;
        if (id) oldRects.set(id, el.getBoundingClientRect());
    });

    tabBar.innerHTML = '';
    tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = `tab-item${tab.id === activeTabId ? ' active' : ''}${tab.id === draggedTabId ? ' dragging' : ''}${tab.isPinned ? ' pinned' : ''}`;
        tabEl.draggable = false;
        tabEl.dataset.id = tab.id;

        const iconHtml = IconThemeManager.getIcon(tab.path, true);

        tabEl.innerHTML = `
            <span class="tab-icon">${iconHtml}</span>
            <span class="tab-title">${tab.title}</span>
            <span class="tab-close" onclick="closeTab('${tab.id}', event)">&times;</span>
        `;

        tabEl.onmousedown = (e) => handleTabMouseDown(e, tab.id);

        tabEl.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'link';
            tabEl.classList.add('drag-over');
        };

        tabEl.ondragenter = (e) => {
            e.preventDefault();
            e.stopPropagation();
            tabEl.classList.add('drag-over');
        };

        tabEl.ondragleave = (e) => {
            e.stopPropagation();
            if (!tabEl.contains(e.relatedTarget)) {
                tabEl.classList.remove('drag-over');
            }
        };

        tabEl.ondrop = (e) => {
            try {
                e.preventDefault();
                e.stopPropagation();
                tabEl.classList.remove('drag-over');

                const srcPaths = getPathsFromDragEvent(e);
                if (srcPaths.length === 0) return;

                const srcPath = srcPaths[0];

                let isDir = false;
                let detected = false;
                try {
                    const items = e.dataTransfer.items;
                    if (items && items.length > 0) {
                        const entry = items[0].webkitGetAsEntry();
                        if (entry) {
                            isDir = entry.isDirectory;
                            detected = true;
                        }
                    }
                } catch (err) {
                    console.error('webkitGetAsEntry failed:', err);
                }

                if (!detected) {
                    const isLocalItem = srcPath.startsWith(currentPath);
                    if (isLocalItem) {
                        const localName = srcPath.substring(currentPath.length);
                        const row = document.querySelector(`tr[data-name="${CSS.escape(localName)}"], .grid-item[data-name="${CSS.escape(localName)}"]`);
                        if (row && row.dataset.type === 'D') {
                            isDir = true;
                            detected = true;
                        }
                    } else {
                        const treeNode = document.querySelector(`.tree-node[data-path="${CSS.escape(srcPath)}"]`);
                        if (treeNode) {
                            isDir = true;
                            detected = true;
                        }
                    }
                }

                setTimeout(async () => {
                    try {
                        let targetPath = srcPath;

                        if (!detected) {
                            try {
                                isDir = await window.api.invoke('IS_DIRECTORY', srcPath);
                            } catch (err) {
                                console.error('Failed to check directory status via IPC:', err);
                            }
                        }

                        if (!isDir) {
                            const lastSlash = srcPath.lastIndexOf('\\');
                            if (lastSlash !== -1) {
                                targetPath = srcPath.substring(0, lastSlash + 1);
                            }
                        }

                        if (tab.id === activeTabId) {
                            loadPath(targetPath, true);
                        } else {
                            if (tab.path && tab.path !== targetPath) {
                                tab.historyBack.push(tab.path);
                                tab.historyForward = [];
                            }
                            tab.path = targetPath;
                            tab.isHomeActive = (targetPath === 'HOME');
                            switchTab(tab.id);
                        }
                    } catch (err) {
                        console.error('Tab drop deferred execution error:', err);
                    }
                }, 0);
            } catch (err) {
                console.error('Error in tabEl.ondrop handler:', err);
            }
        };

        tabEl.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            contextTabId = tab.id;

            tabContextMenu.style.display = 'block';
            const menuWidth = tabContextMenu.offsetWidth;
            const menuHeight = tabContextMenu.offsetHeight;
            let x = e.clientX;
            let y = e.clientY;

            x = Math.max(0, x + menuWidth > window.innerWidth ? x - menuWidth : x);
            y = Math.max(0, y + menuHeight > window.innerHeight ? y - menuHeight : y);

            tabContextMenu.style.left = `${x}px`;
            tabContextMenu.style.top = `${y}px`;
        };

        tabBar.appendChild(tabEl);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'tab-add-btn';
    addBtn.innerHTML = '+';
    addBtn.onclick = () => addTab('HOME');
    tabBar.appendChild(addBtn);

    tabBar.onwheel = (e) => {
        e.preventDefault();
        tabBar.scrollLeft += e.deltaY;
    };

    requestAnimationFrame(() => {
        tabBar.querySelectorAll('.tab-item').forEach(el => {
            const id = el.dataset.id;

            if (id === draggedTabId) {
                el.style.transition = 'none';
                el.style.transform = `translateX(${tabDragOffsetX}px)`;
                el.style.zIndex = '100';
                el.classList.add('dragging');
                return;
            }

            const oldRect = oldRects.get(id);
            if (oldRect) {
                const newRect = el.getBoundingClientRect();
                const dx = oldRect.left - newRect.left;

                if (dx !== 0) {
                    el.style.transition = 'none';
                    el.style.transform = `translateX(${dx}px)`;

                    requestAnimationFrame(() => {
                        el.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)';
                        el.style.transform = '';
                    });
                }
            }
        });
    });
}

// タブのマウスダウンイベント（ドラッグ＆ドロップおよび閉じる処理）
function handleTabMouseDown(e, id) {
    if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(id);
        return;
    }
    if (e.button !== 0) return;
    if (e.target.closest('.tab-close')) return;

    e.preventDefault();
    draggedTabId = id;
    tabDragStartX = e.clientX;
    tabDragOffsetX = 0;

    const onMouseMove = (moveEvent) => {
        if (!draggedTabId) return;

        tabDragCurrentX = moveEvent.clientX;
        tabDragOffsetX = tabDragCurrentX - tabDragStartX;

        const tabBar = document.getElementById('tab-bar');
        const tabEl = tabBar.querySelector(`.tab-item[data-id="${draggedTabId}"]`);

        if (tabEl) {
            const tabBarRect = tabBar.getBoundingClientRect();
            const offsetY = moveEvent.clientY - (tabBarRect.top + tabBarRect.height / 2);
            const isDetached = Math.abs(offsetY) > 60;

            tabEl.style.transition = 'none';
            tabEl.style.zIndex = '1000';
            tabEl.classList.add('dragging');

            if (isDetached && tabs.length > 1) {
                tabEl.classList.add('detaching');
                tabEl.style.transform = `translate(${tabDragOffsetX}px, ${offsetY}px) scale(0.85)`;
                return;
            } else {
                tabEl.classList.remove('detaching');
                tabEl.style.transform = `translateX(${tabDragOffsetX}px)`;
            }

            const tabsElements = Array.from(tabBar.querySelectorAll('.tab-item:not(.dragging)'));
            const draggedRect = tabEl.getBoundingClientRect();
            const draggedMid = draggedRect.left + draggedRect.width / 2;

            const srcIndex = tabs.findIndex(t => t.id === draggedTabId);

            for (const otherEl of tabsElements) {
                const otherId = otherEl.dataset.id;
                const otherRect = otherEl.getBoundingClientRect();
                const otherMid = otherRect.left + otherRect.width / 2;
                const otherIndex = tabs.findIndex(t => t.id === otherId);

                if (srcIndex < otherIndex && draggedMid > otherMid) {
                    const item = tabs.splice(srcIndex, 1)[0];
                    tabs.splice(otherIndex, 0, item);
                    tabDragStartX += otherRect.width + 4;
                    tabDragOffsetX = tabDragCurrentX - tabDragStartX;
                    renderTabs();
                    break;
                } else if (srcIndex > otherIndex && draggedMid < otherMid) {
                    const item = tabs.splice(srcIndex, 1)[0];
                    tabs.splice(otherIndex, 0, item);
                    tabDragStartX -= otherRect.width + 4;
                    tabDragOffsetX = tabDragCurrentX - tabDragStartX;
                    renderTabs();
                    break;
                }
            }
        }
    };

    const onMouseUp = (upEvent) => {
        if (draggedTabId) {
            const id = draggedTabId;
            const tabBar = document.getElementById('tab-bar');
            const tabBarRect = tabBar.getBoundingClientRect();
            const offsetY = upEvent.clientY - (tabBarRect.top + tabBarRect.height / 2);
            const totalDragDistance = Math.sqrt(Math.pow(tabDragOffsetX, 2) + Math.pow(offsetY, 2));

            if (Math.abs(offsetY) > 60 && tabs.length > 1) {
                const tab = tabs.find(t => t.id === draggedTabId);
                if (tab) {
                    window.api.invoke('OPEN_NEW_WINDOW', tab.path);
                    closeTab(tab.id);
                    draggedTabId = null;
                    tabDragOffsetX = 0;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    return;
                }
            }

            if (totalDragDistance < 10) {
                switchTab(id);
            }

            draggedTabId = null;
            tabDragOffsetX = 0;
            renderTabs();
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}
// 各種ボタン・メニュー制御
btnNew.onclick = (e) => {
    if (isHomeActive) return;
    e.stopPropagation();
    newMenu.classList.toggle('visible');
    if (sortMenu) sortMenu.classList.remove('visible');
    if (viewMenu) viewMenu.classList.remove('visible');
};

if (btnSort) {
    btnSort.onclick = (e) => {
        e.stopPropagation();
        sortMenu.classList.toggle('visible');
        newMenu.classList.remove('visible');
        if (viewMenu) viewMenu.classList.remove('visible');
    };
}

if (btnView) {
    btnView.onclick = (e) => {
        e.stopPropagation();
        viewMenu.classList.toggle('visible');
        if (viewMenu.classList.contains('visible')) {
            updateViewMenuUI();
        }
        newMenu.classList.remove('visible');
        if (sortMenu) sortMenu.classList.remove('visible');
    };
}

// 新規作成メニューを動的に生成する
window.updateNewFileMenus = function () {
    const data = localStorage.getItem('settings-custom-new-files');
    const customExtensions = data ? JSON.parse(data) : [
        { id: 'default-text', label: 'テキストファイル', extension: '.txt' }
    ];

    const newMenuEl = document.getElementById('new-menu') || (typeof newMenu !== 'undefined' ? newMenu : null);
    if (newMenuEl) {
        newMenuEl.innerHTML = `
            <div class="menu-item" data-type="directory">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>フォルダ</span>
            </div>
            <div class="menu-divider"></div>
        `;

        customExtensions.forEach(item => {
            const menuEl = document.createElement('div');
            menuEl.className = 'menu-item';
            menuEl.dataset.extension = item.extension;
            menuEl.dataset.label = item.label;
            menuEl.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span>${item.label}</span>
            `;
            menuEl.onclick = (e) => {
                e.stopPropagation();
                createNewItem(item.extension, item.label);
                newMenuEl.classList.remove('visible');
            };
            newMenuEl.appendChild(menuEl);
        });

        const dirItem = newMenuEl.querySelector('[data-type="directory"]');
        if (dirItem) {
            dirItem.onclick = (e) => {
                e.stopPropagation();
                createNewItem('directory');
                newMenuEl.classList.remove('visible');
            };
        }
    }

    const ctxNewSubmenu = document.querySelector('#ctx-new-empty .submenu');
    if (ctxNewSubmenu) {
        ctxNewSubmenu.innerHTML = `
            <div class="menu-item" id="ctx-new-dir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>フォルダ</span>
            </div>
            <div class="menu-divider"></div>
        `;

        customExtensions.forEach(item => {
            const menuEl = document.createElement('div');
            menuEl.className = 'menu-item';
            menuEl.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span>${item.label}</span>
            `;
            menuEl.onclick = (e) => {
                e.stopPropagation();
                createNewItem(item.extension, item.label);
                contextMenu.style.display = 'none';
            };
            ctxNewSubmenu.appendChild(menuEl);
        });

        const ctxDirItem = document.getElementById('ctx-new-dir');
        if (ctxDirItem) {
            ctxDirItem.onclick = (e) => {
                e.stopPropagation();
                createNewItem('directory');
                contextMenu.style.display = 'none';
            };
        }
    }
}

// 新規のファイルまたはフォルダを作成する
function createNewItem(typeOrExt, label = '') {
    if (!currentPath) return;

    let defaultName = '';
    let command = '';

    if (typeOrExt === 'directory') {
        defaultName = '新しいフォルダ';
        command = 'MKDIR';
    } else {
        const ext = typeOrExt.startsWith('.') ? typeOrExt : '.' + typeOrExt;
        defaultName = (label || '新規ファイル') + ext;
        command = 'NEW_FILE';
    }

    defaultName = resolveNameConflict(defaultName);
    pendingRename = defaultName;
    window.api.sendCommand(`${command}|${currentPath}${defaultName}`);
}

updateNewFileMenus();

window.addEventListener('storage', (e) => {
    if (e.key === 'settings-custom-new-files' || e.key === 'settings-custom-new-files-updated') {
        updateNewFileMenus();
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.new-btn-wrapper')) {
        newMenu.classList.remove('visible');
    }
    if (!e.target.closest('.sort-btn-wrapper') && sortMenu) {
        sortMenu.classList.remove('visible');
    }
    if (!e.target.closest('.view-btn-wrapper') && viewMenu) {
        viewMenu.classList.remove('visible');
    }
});

btnCut.onclick = () => {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    document.querySelectorAll('#file-list-body tr.cut-item, .grid-item.cut-item').forEach(r => r.classList.remove('cut-item'));
    clipboard = { mode: 'cut', items: selected };
    selected.forEach(item => {
        const row = document.querySelector(`tr[data-name="${CSS.escape(item.name)}"], .grid-item[data-name="${CSS.escape(item.name)}"]`);
        if (row) row.classList.add('cut-item');
    });
    appendTerminal(`Cut: ${selected.map(i => i.name).join(', ')}`, 'command-echo');
    updateClipboardButtons();
};

btnCopy.onclick = () => {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    document.querySelectorAll('#file-list-body tr.cut-item, .grid-item.cut-item').forEach(r => r.classList.remove('cut-item'));
    clipboard = { mode: 'copy', items: selected };
    appendTerminal(`Copy: ${selected.map(i => i.name).join(', ')}`, 'command-echo');
    updateClipboardButtons();
};

btnPaste.onclick = () => {
    if (isHomeActive) return;
    if (!clipboard.mode || clipboard.items.length === 0) return;
    clipboard.items.forEach(item => {
        const dst = currentPath + item.name;
        if (clipboard.mode === 'copy') {
            window.api.sendCommand(`COPY|${item.srcPath}|${dst}`);
        } else {
            window.api.sendCommand(`MOVE|${item.srcPath}|${dst}`);
        }
    });
    if (clipboard.mode === 'cut') {
        clipboard = { mode: null, items: [] };
        updateClipboardButtons();
    }
};

btnDelete.onclick = () => {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    selected.forEach(item => {
        window.api.sendCommand(`DELETE|${item.srcPath}`);
    });
};

btnRename.onclick = () => {
    const selectedRows = document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected');
    if (selectedRows.length === 0) return;
    startRename(selectedRows[0]);
};

// ソート表示メニューのチェックマークUIを更新する
function updateSortMenuUI() {
    document.querySelectorAll('.sort-item .check-icon').forEach(icon => icon.style.opacity = '0');
    document.querySelectorAll(`.sort-item[data-sort-key="${currentSortKey}"] .check-icon`).forEach(icon => icon.style.opacity = '1');

    document.querySelectorAll('.sort-order .check-icon').forEach(icon => icon.style.opacity = '0');
    document.querySelectorAll(`.sort-order[data-sort-order="${currentSortOrder}"] .check-icon`).forEach(icon => icon.style.opacity = '1');
}
updateSortMenuUI();

document.querySelectorAll('.sort-item').forEach(item => {
    item.onclick = (e) => {
        e.stopPropagation();
        currentSortKey = parseInt(item.dataset.sortKey);
        updateSortMenuUI();
        window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`);
        if (currentPath) window.api.sendCommand(`LIST|${currentPath}`);
    };
});

document.querySelectorAll('.sort-order').forEach(item => {
    item.onclick = (e) => {
        e.stopPropagation();
        currentSortOrder = parseInt(item.dataset.sortOrder);
        updateSortMenuUI();
        window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`);
        if (currentPath) window.api.sendCommand(`LIST|${currentPath}`);
    };
});

const viewModeOrder = ['compact', 'details', 'small', 'medium', 'large', 'extralarge'];
let currentIconSize = 40;

// 表示モード（詳細・グリッドなど）を適用する
function applyViewMode(mode, customSize = null) {
    const prevMode = currentViewMode;
    currentViewMode = mode;

    if (customSize) {
        currentIconSize = Math.max(24, Math.min(256, customSize));
    } else {
        if (mode === 'small') currentIconSize = 24;
        else if (mode === 'medium') currentIconSize = 40;
        else if (mode === 'large') currentIconSize = 56;
        else if (mode === 'extralarge') currentIconSize = 80;
    }

    if (currentViewMode === 'compact') {
        document.body.classList.add('compact-mode');
    } else {
        document.body.classList.remove('compact-mode');
    }

    const isIconMode = !['details', 'compact'].includes(currentViewMode);
    const wasIconMode = !['details', 'compact'].includes(prevMode);

    if (!isIconMode) {
        fileTable.style.display = '';
        fileGrid.style.display = 'none';
        fileGrid.classList.remove('grid-custom');
    } else {
        fileTable.style.display = 'none';
        fileGrid.style.display = 'grid';

        if (customSize || !['small', 'medium', 'large', 'extralarge'].includes(mode)) {
            fileGrid.className = 'grid-custom';
            const itemWidth = Math.max(80, currentIconSize * 2.2);
            fileGrid.style.setProperty('--grid-icon-size', `${currentIconSize}px`);
            fileGrid.style.setProperty('--grid-item-width', `${itemWidth}px`);
        } else {
            fileGrid.classList.remove('grid-custom');
            fileGrid.className = `grid-size-${currentViewMode}`;
        }
    }

    updateViewMenuUI();

    if (isIconMode !== wasIconMode || (currentViewMode !== prevMode && !isIconMode)) {
        if (currentPath) window.api.sendCommand(`LIST|${currentPath}`);
    }
}

// コントロールキーを押しながらのホイールスクロールによるズーム制御
window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();

        const isIconMode = !['details', 'compact'].includes(currentViewMode);

        if (e.deltaY < 0) {
            if (currentViewMode === 'compact') {
                applyViewMode('details');
            } else if (currentViewMode === 'details') {
                applyViewMode('small');
            } else if (isIconMode) {
                if (currentIconSize < 256) {
                    applyViewMode('icons-custom', currentIconSize + 8);
                }
            }
        } else {
            if (isIconMode) {
                if (currentIconSize > 24) {
                    applyViewMode('icons-custom', currentIconSize - 8);
                } else {
                    applyViewMode('details');
                }
            } else if (currentViewMode === 'details') {
                applyViewMode('compact');
            }
        }
    }
}, { passive: false });

// 表示設定メニューのチェックマークUIを更新する
function updateViewMenuUI() {
    let activeMode = currentViewMode;
    if (activeMode === 'icons-custom') {
        if (currentIconSize <= 32) activeMode = 'small';
        else if (currentIconSize <= 48) activeMode = 'medium';
        else if (currentIconSize <= 68) activeMode = 'large';
        else activeMode = 'extralarge';
    }

    document.querySelectorAll('.view-mode .check-icon').forEach(icon => icon.style.opacity = '0');
    document.querySelectorAll(`.view-mode[data-view-mode="${activeMode}"] .check-icon`).forEach(icon => {
        icon.style.opacity = '1';
    });

    document.querySelectorAll(`.view-toggle[data-toggle="hidden"] .check-icon`).forEach(icon => {
        icon.style.opacity = showHiddenFiles ? '1' : '0';
    });
    document.querySelectorAll(`.view-toggle[data-toggle="extension"] .check-icon`).forEach(icon => {
        icon.style.opacity = showExtensions ? '1' : '0';
    });
}

document.querySelectorAll('.view-mode').forEach(item => {
    item.onclick = (e) => {
        e.stopPropagation();
        applyViewMode(item.dataset.viewMode);
    };
});

document.querySelectorAll('.view-toggle').forEach(item => {
    item.onclick = (e) => {
        e.stopPropagation();
        const toggle = item.dataset.toggle;
        if (toggle === 'hidden') showHiddenFiles = !showHiddenFiles;
        if (toggle === 'extension') showExtensions = !showExtensions;

        updateViewMenuUI();
        window.api.sendCommand(`LIST|${currentPath}`);
    };
});

// ナビゲーションボタン（戻る・進む・上へ）の有効無効状態を更新する
function updateNavButtons() {
    const tab = getActiveTab();
    if (!tab) return;
    btnBack.disabled = tab.historyBack.length === 0;
    btnForward.disabled = tab.historyForward.length === 0;
    btnUp.disabled = !tab.path || tab.path === 'HOME' || tab.path.split('\\').filter(Boolean).length <= 1;
}

btnBack.onclick = () => {
    if (isNavigationLocked()) return;
    const tab = getActiveTab();
    if (!tab || tab.historyBack.length === 0) return;
    tab.historyForward.push(tab.path);
    const prev = tab.historyBack.pop();
    navigateTo(prev, false);
};

btnForward.onclick = () => {
    if (isNavigationLocked()) return;
    const tab = getActiveTab();
    if (!tab || tab.historyForward.length === 0) return;
    tab.historyBack.push(tab.path);
    const next = tab.historyForward.pop();
    navigateTo(next, false);
};

// マウスの進む・戻るボタンによるナビゲーション
window.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const tab = getActiveTab();
    if (!tab) return;

    if (e.button === 3) {
        e.preventDefault();
        if (isNavigationLocked() || tab.historyBack.length === 0) return;
        tab.historyForward.push(tab.path);
        const prev = tab.historyBack.pop();
        navigateTo(prev, false);
    } else if (e.button === 4) {
        e.preventDefault();
        if (isNavigationLocked() || tab.historyForward.length === 0) return;
        tab.historyBack.push(tab.path);
        const next = tab.historyForward.pop();
        navigateTo(next, false);
    }
});

btnUp.onclick = () => {
    if (isNavigationLocked()) return;
    const path = getCurrentPath();
    if (!path || path === 'HOME') return;
    const trimmed = path.endsWith('\\') ? path.slice(0, -1) : path;
    const parent = trimmed.substring(0, trimmed.lastIndexOf('\\') + 1);
    if (parent && parent !== path) {
        loadPath(parent, true);
    }
};

btnSidebarHome.onclick = () => {
    if (isNavigationLocked()) return;
    showHome(true);
};

// ホーム画面のUI要素を表示する
function showHomeUI() {
    homeView.style.display = 'block';
    explorerView.style.display = 'none';
    btnSidebarHome.classList.add('active');
    addressInput.value = 'HOME';

    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    const homeNode = treeView.querySelector('.tree-node[data-path="HOME"]');
    if (homeNode) homeNode.querySelector('.tree-item').classList.add('active');

    renderHomeContent();

    if (typeof PreviewManager !== 'undefined') {
        PreviewManager.hide();
    }
}

// ホーム画面を表示する（履歴追加を含む）
function showHome(isUserClick = false) {
    const tab = getActiveTab();
    if (!tab) return;

    if (isUserClick && tab.path && tab.path !== 'HOME') {
        tab.historyBack.push(tab.path);
        tab.historyForward = [];
    }
    tab.path = 'HOME';
    tab.isHomeActive = true;
    showHomeUI();
    updateNavButtons();
    renderTabs();
}

// ファイルエクスプローラーのUI要素を表示する
function showExplorerUI(path) {
    homeView.style.display = 'none';
    explorerView.style.display = 'block';
    btnSidebarHome.classList.remove('active');
    if (path) {
        window.api.sendCommand(`LIST|${path}`);
    }
}

// 指定したパスのエクスプローラー画面を表示する
function showExplorer(path) {
    const tab = getActiveTab();
    if (!tab) return;
    tab.isHomeActive = false;
    showExplorerUI(path);
    if (path) loadPath(path, true);
}

// ホーム画面のコンテンツ（クイックアクセス、履歴、お気に入り）を描画する
async function renderHomeContent() {
    const quickAccess = document.getElementById('home-quick-access');
    const recentList = document.getElementById('home-recent-list');
    const favoriteList = document.getElementById('home-favorite-list');
    const greeting = document.getElementById('home-greeting');

    const hour = new Date().getHours();
    if (hour < 12) greeting.textContent = "おはようございます";
    else if (hour < 18) greeting.textContent = "こんにちは";
    else greeting.textContent = "こんばんは";

    const btnRecent = document.getElementById('btn-home-recent');
    const btnFavorite = document.getElementById('btn-home-favorite');
    if (btnRecent && btnFavorite) {
        btnRecent.classList.toggle('active', homeDisplayMode === 'recent');
        btnFavorite.classList.toggle('active', homeDisplayMode === 'favorite');
        recentList.style.display = homeDisplayMode === 'recent' ? 'flex' : 'none';
        favoriteList.style.display = homeDisplayMode === 'favorite' ? 'flex' : 'none';
    }

    quickAccess.innerHTML = '';

    if (quickAccessItems.length === 0 || !cachedSystemPaths) {
        const paths = await window.api.getSystemPaths();
        if (paths) {
            cachedSystemPaths = paths;
            if (quickAccessItems.length === 0) {
                const normalize = p => p.endsWith('\\') ? p : p + '\\';
                quickAccessItems = [
                    { path: normalize(paths.desktop), label: "デスクトップ", icon: 'desktop' },
                    { path: normalize(paths.downloads), label: "ダウンロード", icon: 'download' },
                    { path: normalize(paths.documents), label: "ドキュメント", icon: 'doc' },
                    { path: normalize(paths.music), label: "ミュージック", icon: 'audio' },
                    { path: normalize(paths.pictures), label: "ピクチャ", icon: 'image' },
                    { path: normalize(paths.videos), label: "ビデオ", icon: 'media' }
                ];
                localStorage.setItem('quickAccessItems', JSON.stringify(quickAccessItems));
            } else {
                repairQuickAccess(paths);
            }
        }
    }

    quickAccessItems.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'quick-tile';
        tile.dataset.path = item.path;
        tile.dataset.label = item.label;
        const iconHtml = IconThemeManager.customIcons[item.icon] || IconThemeManager.customIcons.folder;
        tile.innerHTML = `
            <div class="tile-icon">${iconHtml}</div>
            <span>${item.label}</span>
        `;
        tile.onclick = () => showExplorer(item.path);
        tile.onauxclick = (e) => {
            if (e.button === 1) {
                e.preventDefault();
                addTab(item.path, false);
            }
        };
        quickAccess.appendChild(tile);
    });

    recentList.innerHTML = '';
    if (recentFolders.length === 0) {
        recentList.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding: 20px; text-align: center;">履歴はありません</div>';
    } else {
        recentFolders.slice(0, 8).forEach(folder => {
            const item = document.createElement('div');
            item.className = 'recent-item';
            item.dataset.path = folder.path;
            item.dataset.label = folder.name;
            item.innerHTML = `
                <div class="recent-icon">${IconThemeManager.customIcons.folder}</div>
                <div class="recent-info">
                    <span class="recent-name">${folder.name}</span>
                    <span class="recent-path">${folder.path}</span>
                </div>
            `;
            item.onclick = () => showExplorer(folder.path);
            item.onauxclick = (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    addTab(folder.path, false);
                }
            };
            recentList.appendChild(item);
        });
    }

    favoriteList.innerHTML = '';
    if (favoriteItems.length === 0) {
        favoriteList.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding: 20px; text-align: center;">お気に入りは登録されていません</div>';
    } else {
        favoriteItems.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'recent-item';
            item.dataset.path = folder.path;
            item.dataset.label = folder.label;
            const iconHtml = IconThemeManager.customIcons[folder.icon] || IconThemeManager.customIcons.folder;
            item.innerHTML = `
                <div class="recent-icon">${iconHtml}</div>
                <div class="recent-info">
                    <span class="recent-name">${folder.label}</span>
                    <span class="recent-path">${folder.path}</span>
                </div>
            `;
            item.onclick = () => showExplorer(folder.path);
            favoriteList.appendChild(item);
        });
    }
}

// 最近使用したフォルダ履歴にパスを追加する
function addToRecentFolders(path) {
    if (!path || path === 'HOME') return;
    const name = path.split('\\').filter(Boolean).pop() || path;
    recentFolders = recentFolders.filter(f => f.path !== path);
    recentFolders.unshift({ name, path, timestamp: Date.now() });
    recentFolders = recentFolders.slice(0, 20);
    localStorage.setItem('recentFolders', JSON.stringify(recentFolders));
}

btnRefresh.onclick = () => {
    addressInput.value = currentPath;
    if (currentPath === 'HOME') {
        renderHomeContent();
    } else if (currentPath) {
        window.api.sendCommand(`LIST|${currentPath}`);
    }
};

// 指定したパスのフォルダを読み込む
function loadPath(path, isUserClick = false) {
    if (window.isSelectingWallpaperMode) {
        const galleryView = document.getElementById('wallpaper-gallery-view');
        if (path === 'HOME' || path === 'HOME\\') {
            if (galleryView) galleryView.style.display = 'flex';
            if (explorerView) explorerView.style.display = 'none';
            if (homeView) homeView.style.display = 'none';
            return;
        } else {
            if (galleryView) galleryView.style.display = 'none';
            if (explorerView) explorerView.style.display = 'block';
        }
    }

    if (path === 'HOME' || path === 'HOME\\') {
        showHome(isUserClick);
        return;
    }
    const tab = getActiveTab();
    if (!tab) return;

    if (!path.endsWith('\\')) path += '\\';
    if (isUserClick && tab.path && tab.path !== path) {
        tab.historyBack.push(tab.path);
        tab.historyForward = [];
    }
    tab.path = path;
    addressInput.value = tab.path;
    updateNavButtons();
    addToRecentFolders(path);

    if (tab.isHomeActive) {
        tab.isHomeActive = false;
        homeView.style.display = 'none';
        explorerView.style.display = 'block';
        btnSidebarHome.classList.remove('active');
    }

    renderTabs();

    if (isUserClick) {
        setNavigationLock();
        window.api.sendCommand(`CD|${tab.path}`);
    } else {
        window.api.sendCommand(`LIST|${tab.path}`);
    }
}

// 指定したパスへ履歴移動する
function navigateTo(path) {
    if (path === 'HOME' || path === 'HOME\\') {
        showHome(false);
        return;
    }
    const tab = getActiveTab();
    if (!tab) return;

    if (!path.endsWith('\\')) path += '\\';
    tab.path = path;
    addressInput.value = tab.path;
    updateNavButtons();

    if (tab.isHomeActive) {
        tab.isHomeActive = false;
        homeView.style.display = 'none';
        explorerView.style.display = 'block';
        btnSidebarHome.classList.remove('active');
    }

    renderTabs();
    window.api.sendCommand(`CD|${tab.path}`);
}

// バックエンドからの通信レスポンスを受け取り、各処理を振り分ける
window.api.onBackendResponse((obj) => {
    switch (obj.type) {
        case 'READY':
            const initialTab = getActiveTab();
            if (initialTab && initialTab.path !== 'HOME') {
                loadPath(initialTab.path, true);
            } else {
                showHome();
            }
            initTree('HOME');
            renderTabs();
            break;

        case 'START_LIST':
            fileListBody.innerHTML = '';
            fileGrid.innerHTML = '';
            break;

        case 'DATA':
            addFileRow(obj.content);
            break;

        case 'CREATED':
            const createdPath = obj.content;
            const parts = createdPath.split('\\');
            const actualName = parts[parts.length - 1] || parts[parts.length - 2];
            pendingRename = actualName;

            window.api.sendCommand(`LIST|${currentPath}`);
            break;

        case 'RENAMED':
            appendTerminal(`Renamed to: ${obj.content}`, 'command-echo');
            window.api.sendCommand(`LIST|${currentPath}`);
            break;

        case 'SYNC_PATH':
            let newPath = obj.content;
            if (!newPath.endsWith('\\')) newPath += '\\';
            currentPath = newPath;
            addressInput.value = currentPath;
            updateTreeActiveState();
            renderTabs();
            break;

        case 'CMD_OUT':
            appendTerminal(obj.content);
            break;

        case 'DELETED':
            window.api.sendCommand(`LIST|${currentPath}`);
            break;

        case 'COPIED':
            window.api.sendCommand(`LIST|${currentPath}`);
            break;

        case 'MOVED':
            window.api.sendCommand(`LIST|${currentPath}`);
            break;

        case 'DRAG_END':
            document.querySelectorAll('.dragging, .cut-item').forEach(el => {
                el.classList.remove('dragging', 'cut-item');
            });
            document.body.classList.remove('window-dragging-active');
            break;

        case 'REFRESH_LIST':
            window.api.sendCommand(`LIST|${currentPath}`);
            break;

        case 'ERROR_ACCESS_DENIED':
            showPermissionDialog(obj.content);
            break;

        case 'ERROR':
            appendTerminal(`ERROR: ${obj.content}`, 'error');
            pendingRename = null;
            break;

        case 'LOG':
            appendTerminal(obj.content, 'command-echo');
            break;

        case 'PROP_DATA':
            handlePropData(obj.content);
            break;

        case 'START_SEARCH':
            searchResults.innerHTML = '<div class="search-searching">検索中...</div>';
            searchResults.style.display = 'block';
            break;

        case 'SEARCH_RESULT':
            addSearchResult(obj.content);
            break;

        case 'END_SEARCH':
            if (searchResults.querySelector('.search-searching')) {
                searchResults.innerHTML = '<div class="search-searching">見つかりませんでした</div>';
            }
            break;

        case 'START_TREE':
            const node = findTreeNode(obj.content);
            if (node) {
                const childrenContainer = node.querySelector('.tree-children');
                childrenContainer.innerHTML = '';
            }
            break;

        case 'TREE_DATA':
            addTreeItem(obj.content);
            break;

        case 'START_DRIVES':
            break;
        case 'DRIVE_DATA':
            createTreeNode(obj.content, treeView, true);
            break;
        case 'END_DRIVES':
            break;

        case 'END_TREE':
            break;
    }
});

// 現在選択されている項目の一覧をオブジェクトの配列として取得する
function getSelectedItems() {
    const items = [];
    document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(row => {
        const name = row.dataset.name;
        if (name) items.push({ name, srcPath: currentPath + name });
    });
    return items;
}

// クリップボードの状態に合わせて貼り付けボタンの有効状態を更新する
function updateClipboardButtons() {
    btnPaste.disabled = !clipboard.mode || clipboard.items.length === 0;
}

// 拡張子表示設定に基づき、ファイル名から拡張子を取り除いた名前を取得する
function getFileNameWithoutExtension(name) {
    if (showExtensions) return name;
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex > 0) {
        return name.substring(0, lastDotIndex);
    }
    return name;
}

// 指定したファイル名が画像ファイルの拡張子を持つか判定する
function isImageExtension(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext);
}

// 指定したファイル名が動画ファイルの拡張子を持つか判定する
function isVideoExtension(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext);
}

// タイムスタンプ値を読みやすい日付文字列（YYYY/MM/DD HH:MM）に整形する
function formatDate(timestampMs) {
    if (!timestampMs) return '';
    const date = new Date(timestampMs);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
}

// ファイルリスト（テーブルまたはグリッド）に新しいアイテムを追加する
function addFileRow(data) {
    const parts = data.split('|');
    if (parts.length < 5) return;

    const type = parts[0];
    const name = parts[1];
    const size = parts[2];
    const isHidden = parts[3] === '1';
    const timestampMs = parseInt(parts[4], 10);
    const dateStr = formatDate(timestampMs);

    if (!showHiddenFiles && isHidden) return;

    const displayName = type === 'D' ? name : getFileNameWithoutExtension(name);

    let element;

    const isDir = type === 'D';
    const customIcon = IconThemeManager.getIcon(name, isDir);

    if (currentViewMode === 'details' || currentViewMode === 'compact') {
        const tr = document.createElement('tr');
        tr.dataset.name = name;
        tr.dataset.fullname = name;
        tr.dataset.type = type;
        tr.draggable = true;
        tr.innerHTML = `
            <td class="file-name" title="${name}"><span class="cell-content"><span style="margin-right: 6px; display: flex; align-items: center; flex-shrink: 0;">${customIcon}</span><span class="file-name-text">${displayName}</span></span></td>
            <td><span class="cell-content">${dateStr}</span></td>
            <td><span class="cell-content">${isDir ? '' : formatSize(size)}</span></td>
        `;

        tr.ondragstart = handleDragStart;
        tr.ondragend = handleDragEnd;
        if (isDir) {
            tr.ondragover = handleDragOver;
            tr.ondragenter = handleDragOver;
            tr.ondragleave = handleDragLeave;
            tr.ondrop = handleDrop;
        }

        tr.onmousedown = (e) => {
            if (isNavigationLocked()) return;
            if (e.button !== 0) return;
            if (e.ctrlKey) return;

            if (!tr.classList.contains('selected')) {
                document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                onSelectionChanged();
            }
        };

        tr.onclick = (e) => {
            if (isNavigationLocked()) return;
            const items = Array.from(document.querySelectorAll('#file-list-body tr, .grid-item'));
            const index = items.indexOf(tr);

            if (e.shiftKey && selectionAnchorIndex !== -1) {
                items.forEach(el => el.classList.remove('selected'));
                const start = Math.min(selectionAnchorIndex, index);
                const end = Math.max(selectionAnchorIndex, index);
                for (let i = start; i <= end; i++) items[i].classList.add('selected');
            } else if (e.ctrlKey) {
                tr.classList.toggle('selected');
                if (tr.classList.contains('selected')) selectionAnchorIndex = index;
            } else {
                items.forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                selectionAnchorIndex = index;
            }
            onSelectionChanged();
        };

        fileListBody.appendChild(tr);
        element = tr;
    } else {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.dataset.name = name;
        div.dataset.fullname = name;
        div.dataset.type = type;
        div.draggable = true;

        let iconHtml = '';
        const isImg = isImageExtension(name);
        const isVid = isVideoExtension(name);

        if (isImg || isVid) {
            const fileUri = encodeURI(`file:///${currentPath}${name}`.replace(/\\/g, '/')).replace(/#/g, '%23');
            if (isImg) {
                iconHtml = `<img src="${fileUri}" loading="lazy" alt="${name}" onerror="handleThumbError(this, 'image')">`;
            } else {
                iconHtml = `<video src="${fileUri}#t=0.1" preload="metadata" muted class="grid-video-thumb" onerror="handleThumbError(this, 'media')"></video>`;
            }
        } else {
            iconHtml = `<div class="grid-icon-placeholder">${customIcon}</div>`;
        }

        div.innerHTML = `
            <div class="grid-content">
                <div class="grid-icon">${iconHtml}</div>
                <div class="grid-name file-name" title="${name}">${displayName}</div>
            </div>
        `;

        div.ondragstart = handleDragStart;
        div.ondragend = handleDragEnd;
        if (isDir) {
            div.ondragover = handleDragOver;
            div.ondragenter = handleDragOver;
            div.ondragleave = handleDragLeave;
            div.ondrop = handleDrop;
        }

        div.onmousedown = (e) => {
            if (isNavigationLocked()) return;
            if (e.button !== 0) return;
            if (e.ctrlKey) return;

            if (!div.classList.contains('selected')) {
                document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
                div.classList.add('selected');
                onSelectionChanged();
            }
        };

        div.onclick = (e) => {
            if (isNavigationLocked()) return;
            const items = Array.from(document.querySelectorAll('#file-list-body tr, .grid-item'));
            const index = items.indexOf(div);

            if (e.shiftKey && selectionAnchorIndex !== -1) {
                items.forEach(el => el.classList.remove('selected'));
                const start = Math.min(selectionAnchorIndex, index);
                const end = Math.max(selectionAnchorIndex, index);
                for (let i = start; i <= end; i++) items[i].classList.add('selected');
            } else if (e.ctrlKey) {
                div.classList.toggle('selected');
                if (div.classList.contains('selected')) selectionAnchorIndex = index;
            } else {
                items.forEach(r => r.classList.remove('selected'));
                div.classList.add('selected');
                selectionAnchorIndex = index;
            }
            onSelectionChanged();
        };

        fileGrid.appendChild(div);
        element = div;
    }

    element.ondblclick = async () => {
        if (isNavigationLocked()) return;
        if (type === 'D') {
            loadPath(currentPath + name + '\\', true);
        } else {
            if (window.isSelectingWallpaperMode) {
                const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
                if (isImg) {
                    const fullPath = currentPath + name;
                    try {
                        const history = await window.api.invoke('SET_WALLPAPER_BY_PATH', fullPath);
                        if (history && history.length > 0) {
                            localStorage.setItem('settings-global-wallpaper-active', 'true');
                            localStorage.setItem('settings-active-wallpaper-id', history[0].id);
                            if (typeof SettingsManager !== 'undefined' && typeof SettingsManager.loadWallpapers === 'function') {
                                await SettingsManager.loadWallpapers();
                            }
                        }
                    } catch (e) {
                        console.error('Failed to set wallpaper:', e);
                    }
                    if (typeof window.endWallpaperSelectionMode === 'function') {
                        window.endWallpaperSelectionMode(false);
                    }
                } else {
                    alert('壁紙として設定できるのは画像ファイルのみです。');
                }
                return;
            }

            window.api.sendCommand(`OPEN|${currentPath}${name}`);
            if (typeof PreviewManager !== 'undefined' && PreviewManager.isOpen) {
                PreviewManager.hide();
            }
        }
    };

    element.onauxclick = (e) => {
        if (e.button === 1) {
            if (isNavigationLocked()) return;
            if (type === 'D') {
                e.preventDefault();
                addTab(currentPath + name + '\\', false);
            }
        }
    };

    if (pendingRename && name === pendingRename) {
        pendingRename = null;
        setTimeout(() => startRename(element), 100);
    }
}

// 指定した要素に対してインラインリネーム（名前編集入力）を開始する
function startRename(el) {
    const nameCell = el.querySelector('.file-name');
    const oldName = el.dataset.fullname;
    const isDir = el.dataset.type === 'D';

    const currentIcon = IconThemeManager.getIcon(oldName, isDir);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = oldName;

    nameCell.innerHTML = '';
    let container = nameCell;
    if (el.tagName === 'TR') {
        const contentSpan = document.createElement('span');
        contentSpan.className = 'cell-content';
        nameCell.appendChild(contentSpan);
        container = contentSpan;

        const iconSpan = document.createElement('span');
        iconSpan.style.marginRight = '6px';
        iconSpan.innerHTML = currentIcon;
        container.appendChild(iconSpan);
    }

    container.appendChild(input);
    input.focus();

    const adjustInputWidth = () => {
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.font = window.getComputedStyle(input).font;
        span.textContent = input.value || ' ';
        document.body.appendChild(span);
        input.style.width = (span.offsetWidth + 15) + 'px';
        document.body.removeChild(span);
    };

    adjustInputWidth();
    input.addEventListener('input', adjustInputWidth);

    let dotIndex = oldName.lastIndexOf('.');
    if (isDir || dotIndex <= 0) {
        input.select();
    } else {
        input.setSelectionRange(0, dotIndex);
    }

    const finishRename = (cancel = false) => {
        let newName = input.value.trim();

        const restoreView = (nameToUse) => {
            const currentIcon = IconThemeManager.getIcon(nameToUse, isDir);
            const displayName = isDir ? nameToUse : getFileNameWithoutExtension(nameToUse);
            if (el.tagName === 'TR') {
                nameCell.innerHTML = `<span class="cell-content"><span style="margin-right: 6px; display: flex; align-items: center; flex-shrink: 0;">${currentIcon}</span><span class="file-name-text">${displayName}</span></span>`;
            } else {
                nameCell.textContent = displayName;
                const gridIcon = el.querySelector('.grid-icon');
                if (gridIcon) {
                    const isImg = isImageExtension(nameToUse);
                    const isVid = isVideoExtension(nameToUse);
                    if (!isImg && !isVid) {
                        gridIcon.innerHTML = `<div class="grid-icon-placeholder">${currentIcon}</div>`;
                    }
                }
            }
        };

        if (cancel || !newName) {
            restoreView(oldName);
            return;
        }

        if (!isDir && !newName.includes('.') && oldName.startsWith('新規メモ')) {
            newName += '.txt';
        }

        newName = resolveNameConflict(newName, oldName);

        if (newName === oldName) {
            restoreView(oldName);
            return;
        }

        window.api.sendCommand(`RENAME|${currentPath}${oldName}|${currentPath}${newName}`);
        el.dataset.name = newName;
        el.dataset.fullname = newName;
        restoreView(newName);
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishRename(true);
        }
    };

    input.onblur = () => {
        if (input.parentElement) {
            finishRename();
        }
    };
}

// ファイル名衝突を避けるために連番付きのユニークなファイル名を決定する
function resolveNameConflict(name, skipName) {
    const existing = new Set();
    document.querySelectorAll('#file-list-body tr, .grid-item').forEach(row => {
        const n = row.dataset.name;
        if (n && n !== skipName) existing.add(n);
    });

    if (!existing.has(name)) return name;

    const dotIndex = name.lastIndexOf('.');
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : '';

    for (let i = 2; i < 1000; i++) {
        const candidate = `${base} (${i})${ext}`;
        if (!existing.has(candidate)) return candidate;
    }
    return name;
}

// 検索バー
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimer = null;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const kw = searchInput.value.trim();
    if (!kw) {
        searchResults.style.display = 'none';
        return;
    }
    searchTimer = setTimeout(() => {
        window.api.sendCommand(`SEARCH|${kw}`);
    }, 500);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        searchResults.style.display = 'none';
        searchInput.value = '';
    }
    if (e.key === 'Enter') {
        clearTimeout(searchTimer);
        const kw = searchInput.value.trim();
        if (kw) window.api.sendCommand(`SEARCH|${kw}`);
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});

// 検索結果を表示エリアに追加する
function addSearchResult(data) {
    const placeholder = searchResults.querySelector('.search-searching');
    if (placeholder) placeholder.remove();

    const parts = data.split('|');
    if (parts.length < 4) return;
    const type = parts[0];
    const name = parts[1];
    const dirPath = parts[2];
    const isHidden = parts[3] === '1';

    if (!showHiddenFiles && isHidden) return;

    const displayName = type === 'D' ? name : getFileNameWithoutExtension(name);

    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
        <span>${type === 'D' ? '📁' : '📄'}</span>
        <div style="min-width:0;flex:1;">
            <div class="search-result-name">${displayName}</div>
            <div class="search-result-path">${dirPath}</div>
        </div>
    `;

    item.onclick = () => {
        if (type === 'D') {
            loadPath(dirPath + name + '\\', true);
        } else {
            window.api.sendCommand(`OPEN|${dirPath}${name}`);
            if (typeof PreviewManager !== 'undefined' && PreviewManager.isOpen) {
                PreviewManager.hide();
            }
        }
        searchResults.style.display = 'none';
        searchInput.value = '';
    };

    item.onmousedown = (e) => {
        if (e.button === 1) {
            e.preventDefault();
            const targetPath = type === 'D' ? (dirPath + name + '\\') : dirPath;
            if (typeof addTab === 'function') {
                addTab(targetPath);
                searchResults.style.display = 'none';
                searchInput.value = '';
            }
        }
    };

    searchResults.appendChild(item);
}

// ターミナル表示エリアに文字列（ログやコマンド）を追加出力する
function appendTerminal(text, className = '') {
    const div = document.createElement('div');
    if (className) div.className = className;
    div.textContent = text;
    terminalOutput.appendChild(div);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// バイト値を適切な単位（B, KB, MB）の文字列にフォーマットする
function formatSize(bytes) {
    const b = parseInt(bytes);
    if (isNaN(b)) return bytes;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
const MAX_TERMINAL_HISTORY = 50;
let terminalHistory = [];
try {
    terminalHistory = JSON.parse(localStorage.getItem('terminalHistory') || '[]');
} catch (e) {
    terminalHistory = [];
}
let terminalHistoryIndex = terminalHistory.length;
let terminalDraft = '';

terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const cmd = terminalInput.value.trim();
        if (cmd) {
            if (cmd.toLowerCase() === 'exit') {
                window.close();
                return;
            }
            appendTerminal(`> ${cmd}`, 'command-echo');
            window.api.sendCommand(`EXEC|${cmd}`);

            if (terminalHistory.length === 0 || terminalHistory[terminalHistory.length - 1] !== cmd) {
                terminalHistory.push(cmd);
                if (terminalHistory.length > MAX_TERMINAL_HISTORY) {
                    terminalHistory.shift();
                }
                localStorage.setItem('terminalHistory', JSON.stringify(terminalHistory));
            }
            terminalHistoryIndex = terminalHistory.length;
            terminalDraft = '';

            terminalInput.value = '';
        }
    } else if (e.key === 'ArrowUp') {
        if (terminalHistory.length === 0) return;
        e.preventDefault();

        if (terminalHistoryIndex === terminalHistory.length) {
            terminalDraft = terminalInput.value;
        }

        if (terminalHistoryIndex > 0) {
            terminalHistoryIndex--;
            terminalInput.value = terminalHistory[terminalHistoryIndex];
            setTimeout(() => {
                terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
            }, 0);
        }
    } else if (e.key === 'ArrowDown') {
        if (terminalHistory.length === 0) return;

        if (terminalHistoryIndex < terminalHistory.length - 1) {
            e.preventDefault();
            terminalHistoryIndex++;
            terminalInput.value = terminalHistory[terminalHistoryIndex];
            setTimeout(() => {
                terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
            }, 0);
        } else if (terminalHistoryIndex === terminalHistory.length - 1) {
            e.preventDefault();
            terminalHistoryIndex++;
            terminalInput.value = terminalDraft;
            setTimeout(() => {
                terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length);
            }, 0);
        }
    }
});

addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loadPath(addressInput.value.trim(), true);
    }
});

const treeView = document.getElementById('tree-view');
let treeLoadingPath = '';

// サイドバーのフォルダツリービューを初期化する
async function initTree(rootPath) {
    treeView.innerHTML = '';

    if (quickAccessItems.length === 0 || !cachedSystemPaths) {
        const paths = await window.api.getSystemPaths();
        if (paths) {
            cachedSystemPaths = paths;
            if (quickAccessItems.length === 0) {
                const normalize = p => p.endsWith('\\') ? p : p + '\\';
                quickAccessItems = [
                    { path: normalize(paths.desktop), label: "デスクトップ", icon: 'desktop' },
                    { path: normalize(paths.downloads), label: "ダウンロード", icon: 'download' },
                    { path: normalize(paths.documents), label: "ドキュメント", icon: 'doc' },
                    { path: normalize(paths.music), label: "ミュージック", icon: 'audio' },
                    { path: normalize(paths.pictures), label: "ピクチャ", icon: 'image' },
                    { path: normalize(paths.videos), label: "ビデオ", icon: 'media' }
                ];
                localStorage.setItem('quickAccessItems', JSON.stringify(quickAccessItems));
            } else {
                repairQuickAccess(paths);
            }
        }
    }

    quickAccessItems.forEach(item => {
        const iconHtml = IconThemeManager.customIcons[item.icon] || IconThemeManager.customIcons.folder;
        createTreeNode(item.path, treeView, true, iconHtml, item.label, true, true);
    });

    const sep = document.createElement('div');
    sep.className = 'tree-separator';
    treeView.appendChild(sep);

    window.api.sendCommand('GET_DRIVES');
}

// ツリービュー内のフォルダノードを新規作成してイベントを割り当てる
function createTreeNode(fullPath, container, isRoot = false, customIcon = null, labelName = null, hideExpander = false, isQuickAccess = false) {
    const name = labelName || (isRoot ? fullPath : fullPath.split('\\').filter(Boolean).pop());
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.dataset.path = fullPath.endsWith('\\') ? fullPath : fullPath + '\\';
    if (isQuickAccess) node.dataset.isQuickAccess = 'true';

    const item = document.createElement('div');
    item.className = 'tree-item';
    const expander = document.createElement('span');
    expander.className = 'tree-expander';
    expander.innerHTML = '▶';
    if (hideExpander) {
        expander.style.visibility = 'hidden';
        expander.style.pointerEvents = 'none';
    }
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = customIcon || IconThemeManager.customIcons.folder;
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = name;

    item.appendChild(expander);
    item.appendChild(icon);
    item.appendChild(label);
    node.appendChild(item);

    item.draggable = true;
    item.ondragstart = handleDragStart;
    item.ondragend = handleDragEnd;
    item.ondragover = handleDragOver;
    item.ondragenter = handleDragOver;
    item.ondragleave = handleDragLeave;
    item.ondrop = handleDrop;

    const children = document.createElement('div');
    children.className = 'tree-children';
    node.appendChild(children);

    expander.onclick = (e) => {
        e.stopPropagation();
        const isExpanded = children.classList.contains('visible');
        if (isExpanded) {
            children.classList.remove('visible');
            expander.classList.remove('expanded');
        } else {
            children.classList.add('visible');
            expander.classList.add('expanded');
            if (children.innerHTML === '') {
                treeLoadingPath = node.dataset.path;
                window.api.sendCommand(`TREE_LIST|${treeLoadingPath}`);
            }
        }
    };

    item.onclick = (e) => {
        if (isNavigationLocked()) return;
        e.stopPropagation();
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        if (hideExpander) {
            showExplorer(node.dataset.path);
        }
    };

    item.ondblclick = (e) => {
        if (isNavigationLocked()) return;
        e.stopPropagation();
        loadPath(node.dataset.path, true);
    };

    item.onauxclick = (e) => {
        if (e.button === 1) {
            if (isNavigationLocked()) return;
            e.preventDefault();
            e.stopPropagation();
            addTab(node.dataset.path, false);
        }
    };

    container.appendChild(node);
    return node;
}

// ツリーにフォルダ項目を追加する
function addTreeItem(folderName) {
    const parentNode = findTreeNode(treeLoadingPath);
    if (parentNode) {
        const childrenContainer = parentNode.querySelector('.tree-children');
        createTreeNode(treeLoadingPath + folderName, childrenContainer);
    }
}

// パスに対応するツリービュー内のノード要素を取得する
function findTreeNode(path) {
    const p = path.endsWith('\\') ? path : path + '\\';
    const escapedPath = p.replace(/\\/g, '\\\\');

    const node = treeView.querySelector(`.tree-node[data-path="${escapedPath}"]:not([data-is-quick-access="true"])`);
    if (node) return node;

    return treeView.querySelector(`.tree-node[data-path="${escapedPath}"]`);
}

// カレントディレクトリに合わせてサイドバーツリーの選択状態を同期する
function updateTreeActiveState() {
    document.querySelectorAll('.tree-item').forEach(item => {
        const node = item.closest('.tree-node');
        if (node.dataset.path === currentPath) {
            item.classList.add('active');
            let p = node.parentElement.closest('.tree-node');
            while (p) {
                p.querySelector('.tree-children').classList.add('visible');
                p.querySelector('.tree-expander').classList.add('expanded');
                p = p.parentElement.closest('.tree-node');
            }
        } else {
            item.classList.remove('active');
        }
    });
}

// 各ペイン（サイドバー、ターミナル、プレビュー）のリサイズハンドラを設定する
function initResizers() {
    const sidebar = document.querySelector('.sidebar');
    const terminalPane = document.querySelector('.terminal-pane');
    const resizerSidebar = document.getElementById('resizer-sidebar');
    const resizerTerminal = document.getElementById('resizer-terminal');

    function setupResizer(resizer, targetElem, axis, isRightSide = false) {
        if (!resizer || !targetElem) return;
        let isResizing = false;
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = axis === 'h' ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            if (axis === 'h') {
                const targetRect = targetElem.getBoundingClientRect();
                const newWidth = isRightSide ? (targetRect.right - e.clientX) : (e.clientX - targetRect.left);
                if (newWidth > 150 && newWidth < 800) {
                    targetElem.style.width = `${newWidth}px`;
                    targetElem.style.flex = 'none';
                }
            } else {
                const containerRect = document.querySelector('.main-layout').getBoundingClientRect();
                const newHeight = containerRect.bottom - e.clientY;
                if (newHeight > 50 && newHeight < (containerRect.height - 100)) {
                    targetElem.style.height = `${newHeight}px`;
                    targetElem.style.flex = 'none';
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
            }
        });
    }

    const previewPane = document.getElementById('preview-pane');
    const resizerPreview = document.getElementById('resizer-preview');

    setupResizer(resizerSidebar, sidebar, 'h');
    setupResizer(resizerTerminal, terminalPane, 'v');
    setupResizer(resizerPreview, previewPane, 'h', true);
}

// 選択されている項目の状態変化（プレビュー更新など）を処理する
function onSelectionChanged() {
    if (typeof PreviewManager !== 'undefined') {
        PreviewManager.update();
    }
    const selectedCount = document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').length;
    if (selectedCount === 0) {
        document.querySelectorAll('.dragging, .cut-item').forEach(el => {
            el.classList.remove('dragging', 'cut-item');
        });
    }
}

// 選択項目をキーボードで上下移動する
function navigateSelection(direction) {
    const items = Array.from(document.querySelectorAll('#file-list-body tr, .grid-item'));
    if (items.length === 0) return;

    const currentIndex = items.findIndex(item => item.classList.contains('selected'));
    let nextIndex = 0;

    if (currentIndex === -1) {
        nextIndex = direction > 0 ? 0 : items.length - 1;
    } else {
        nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= items.length) nextIndex = items.length - 1;
    }

    if (nextIndex !== currentIndex) {
        items.forEach(item => item.classList.remove('selected'));
        items[nextIndex].classList.add('selected');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
        onSelectionChanged();
    }
}

initResizers();

// リサイズ用カラム調整を初期化する
function initColumnResizers() {
    const resizers = document.querySelectorAll('.col-resizer');
    let startX, startWidth, currentTh;

    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', (e) => {
            currentTh = e.target.parentElement;
            startX = e.pageX;
            startWidth = currentTh.offsetWidth;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
    });

    function onMouseMove(e) {
        if (!currentTh) return;
        const dx = e.pageX - startX;
        let newWidth = startWidth + dx;

        const computedStyle = window.getComputedStyle(currentTh);
        const minW = parseInt(computedStyle.minWidth) || 50;

        if (newWidth < minW) newWidth = minW;
        currentTh.style.width = `${newWidth}px`;
    }

    function onMouseUp() {
        if (!currentTh) return;
        currentTh.querySelector('.col-resizer').classList.remove('resizing');
        document.body.style.cursor = '';
        currentTh = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

initColumnResizers();

// 右クリックのコンテキストメニューを制御する
const contextMenu = document.getElementById('context-menu');

window.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    if (typeof newMenu !== 'undefined' && newMenu) newMenu.classList.remove('visible');
    if (typeof sortMenu !== 'undefined' && sortMenu) sortMenu.classList.remove('visible');
    if (typeof viewMenu !== 'undefined' && viewMenu) viewMenu.classList.remove('visible');

    const fileRow = e.target.closest('#file-list-body tr, .grid-item');
    const treeItem = e.target.closest('.tree-item');
    const homeItem = e.target.closest('.quick-tile, .recent-item');
    const isFilePane = e.target.closest('.file-pane');

    if (!isFilePane && !treeItem) {
        contextMenu.style.display = 'none';
        return;
    }

    if (fileRow) {
        let path = currentPath + fileRow.dataset.name;
        if (fileRow.dataset.type === 'D' && !path.endsWith('\\')) path += '\\';
        contextTarget = {
            name: fileRow.dataset.name,
            path: path,
            isDir: fileRow.dataset.type === 'D'
        };

        if (!fileRow.classList.contains('selected')) {
            document.querySelectorAll('#file-list-body tr, .grid-item').forEach(el => el.classList.remove('selected'));
            fileRow.classList.add('selected');
        }
    } else if (treeItem) {
        const node = treeItem.closest('.tree-node');
        const path = node.dataset.path;
        contextTarget = {
            name: path.split('\\').filter(Boolean).pop() || path,
            path: path,
            isDir: true
        };

        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        treeItem.classList.add('active');
    } else if (homeItem) {
        let path = homeItem.dataset.path;
        if (!path.endsWith('\\')) path += '\\';
        contextTarget = {
            name: homeItem.dataset.label,
            path: path,
            isDir: true
        };
        document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(el => el.classList.remove('selected'));
    } else {
        contextTarget = null;
        document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(el => el.classList.remove('selected'));
    }

    const ctxGroupItem = document.getElementById('ctx-group-item');
    const ctxGroupEmpty = document.getElementById('ctx-group-empty');
    const isExplorer = e.target.closest('#explorer-view');
    const isHome = e.target.closest('#home-view');

    if (contextTarget) {
        ctxGroupItem.style.display = 'block';
        ctxGroupEmpty.style.display = 'none';
    } else if (isFilePane) {
        ctxGroupItem.style.display = 'none';
        ctxGroupEmpty.style.display = 'block';
    } else {
        contextMenu.style.display = 'none';
        return;
    }

    document.querySelectorAll('.context-item').forEach(item => {
        item.classList.remove('disabled');
    });

    const hasSelection = contextTarget !== null;
    ['ctx-open', 'ctx-open-new-tab', 'ctx-open-new-window', 'ctx-cut', 'ctx-copy', 'ctx-rename', 'ctx-delete', 'ctx-quick-access', 'ctx-favorite', 'ctx-properties', 'ctx-copy-path'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('disabled', !hasSelection);
    });

    if (hasSelection && contextTarget.isDir) {
        const qaItem = document.getElementById('ctx-quick-access');
        if (qaItem) {
            const isQAEntry = treeItem && treeItem.closest('.tree-node').dataset.isQuickAccess === 'true';
            const isRegistered = quickAccessItems.some(item => item.path === contextTarget.path);

            if (isQAEntry || isRegistered) {
                qaItem.querySelector('span').textContent = 'クイックアクセスから解除';
            } else {
                qaItem.querySelector('span').textContent = 'クイックアクセスに登録';
            }
        }
    } else if (hasSelection && !contextTarget.isDir) {
        const qaItem = document.getElementById('ctx-quick-access');
        if (qaItem) qaItem.classList.add('disabled');
        const favItem = document.getElementById('ctx-favorite');
        if (favItem) favItem.classList.add('disabled');
        const newTabItem = document.getElementById('ctx-open-new-tab');
        if (newTabItem) newTabItem.classList.add('disabled');
        const newWinItem = document.getElementById('ctx-open-new-window');
        if (newWinItem) newWinItem.classList.add('disabled');
    }

    const isImageFile = hasSelection && !contextTarget.isDir && /\.(jpe?g|png|gif|webp|svg)$/i.test(contextTarget.name);
    const wallpaperItem = document.getElementById('ctx-set-wallpaper');
    if (wallpaperItem) {
        wallpaperItem.style.display = isImageFile ? 'flex' : 'none';
    }

    if (hasSelection && contextTarget.isDir) {
        const favItem = document.getElementById('ctx-favorite');
        if (favItem) {
            const isRegistered = favoriteItems.some(item => item.path === contextTarget.path);
            favItem.querySelector('span').textContent = isRegistered ? 'お気に入りから解除' : 'お気に入りに追加';
        }
    }

    const canPaste = clipboard.mode && clipboard.items.length > 0;
    document.getElementById('ctx-paste').classList.toggle('disabled', !canPaste);

    updateSortMenuUI();
    updateViewMenuUI();

    contextMenu.style.display = 'block';
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    let x = e.clientX;
    let y = e.clientY;

    x = Math.max(0, x + menuWidth > window.innerWidth ? x - menuWidth : x);
    y = Math.max(0, y + menuHeight > window.innerHeight ? y - menuHeight : y);

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
});

window.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    tabContextMenu.style.display = 'none';
}, true);

// サブメニューの表示位置を調整する（画面端での折り返し制御）
document.querySelectorAll('.has-submenu').forEach(item => {
    item.addEventListener('mouseenter', () => {
        const submenu = item.querySelector('.submenu');
        if (!submenu) return;

        submenu.style.visibility = 'hidden';
        submenu.style.display = 'block';
        const submenuWidth = submenu.offsetWidth;
        const submenuHeight = submenu.offsetHeight;
        submenu.style.display = '';
        submenu.style.visibility = '';

        const rect = item.getBoundingClientRect();

        if (rect.right + submenuWidth > window.innerWidth) {
            submenu.style.left = 'auto';
            submenu.style.right = '100%';
        } else {
            submenu.style.left = '100%';
            submenu.style.right = 'auto';
        }

        if (rect.top + submenuHeight > window.innerHeight) {
            submenu.style.top = 'auto';
            submenu.style.bottom = '0';
        } else {
            submenu.style.top = '-5px';
            submenu.style.bottom = 'auto';
        }
    });
});

// クイックアクセス項目を登録・削除する
const btnCtxQuickAccess = document.getElementById('ctx-quick-access');
if (btnCtxQuickAccess) {
    btnCtxQuickAccess.onclick = () => {
        if (!contextTarget || !contextTarget.isDir) return;

        const index = quickAccessItems.findIndex(item => item.path === contextTarget.path);
        if (index !== -1) {
            quickAccessItems.splice(index, 1);
        } else {
            let icon = 'folder';
            if (cachedSystemPaths) {
                const normalize = p => p.endsWith('\\') ? p : p + '\\';
                if (contextTarget.path === normalize(cachedSystemPaths.desktop)) icon = 'desktop';
                else if (contextTarget.path === normalize(cachedSystemPaths.downloads)) icon = 'download';
                else if (contextTarget.path === normalize(cachedSystemPaths.documents)) icon = 'doc';
                else if (contextTarget.path === normalize(cachedSystemPaths.music)) icon = 'audio';
                else if (contextTarget.path === normalize(cachedSystemPaths.pictures)) icon = 'image';
                else if (contextTarget.path === normalize(cachedSystemPaths.videos)) icon = 'media';
            }

            quickAccessItems.push({
                path: contextTarget.path,
                label: contextTarget.name,
                icon: icon
            });
        }

        localStorage.setItem('quickAccessItems', JSON.stringify(quickAccessItems));
        refreshQuickAccessUI();
    };
}

// お気に入り項目を登録・削除する
const btnCtxFavorite = document.getElementById('ctx-favorite');
if (btnCtxFavorite) {
    btnCtxFavorite.onclick = () => {
        if (!contextTarget || !contextTarget.isDir) return;

        const index = favoriteItems.findIndex(item => item.path === contextTarget.path);
        if (index !== -1) {
            favoriteItems.splice(index, 1);
        } else {
            let icon = 'folder';
            if (cachedSystemPaths) {
                const normalize = p => p.endsWith('\\') ? p : p + '\\';
                if (contextTarget.path === normalize(cachedSystemPaths.desktop)) icon = 'desktop';
                else if (contextTarget.path === normalize(cachedSystemPaths.downloads)) icon = 'download';
                else if (contextTarget.path === normalize(cachedSystemPaths.documents)) icon = 'doc';
                else if (contextTarget.path === normalize(cachedSystemPaths.music)) icon = 'audio';
                else if (contextTarget.path === normalize(cachedSystemPaths.pictures)) icon = 'image';
                else if (contextTarget.path === normalize(cachedSystemPaths.videos)) icon = 'media';
            }

            favoriteItems.push({
                path: contextTarget.path,
                label: contextTarget.name,
                icon: icon
            });
        }

        localStorage.setItem('favoriteItems', JSON.stringify(favoriteItems));
        if (isHomeActive) renderHomeContent();
    };
}

// HOMEタブ切り替え
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-home-recent') {
        homeDisplayMode = 'recent';
        localStorage.setItem('homeDisplayMode', 'recent');
        renderHomeContent();
    } else if (e.target.id === 'btn-home-favorite') {
        homeDisplayMode = 'favorite';
        localStorage.setItem('homeDisplayMode', 'favorite');
        renderHomeContent();
    }
});

// クイックアクセスの表示を更新する
function refreshQuickAccessUI() {
    initTree(currentPath);
    if (isHomeActive) renderHomeContent();
}

// クイックアクセスの順序を変更する
function reorderQuickAccess(srcPath, targetPath, isAfter) {
    const srcIndex = quickAccessItems.findIndex(item => item.path === srcPath);
    const targetIndex = quickAccessItems.findIndex(item => item.path === targetPath);

    if (srcIndex !== -1 && targetIndex !== -1) {
        const item = quickAccessItems.splice(srcIndex, 1)[0];
        let newTargetIndex = quickAccessItems.findIndex(item => item.path === targetPath);
        const insertIndex = isAfter ? newTargetIndex + 1 : newTargetIndex;

        quickAccessItems.splice(insertIndex, 0, item);
        localStorage.setItem('quickAccessItems', JSON.stringify(quickAccessItems));
        refreshQuickAccessUI();
    }
}

// コンテキストメニューのアクション
document.getElementById('ctx-open').onclick = () => {
    if (contextTarget) {
        if (contextTarget.isDir) {
            loadPath(contextTarget.path, true);
        } else {
            window.api.sendCommand(`OPEN|${contextTarget.path}`);
            if (typeof PreviewManager !== 'undefined' && PreviewManager.isOpen) {
                PreviewManager.hide();
            }
        }
    }
};

document.getElementById('ctx-open-new-tab').onclick = () => {
    if (contextTarget && contextTarget.isDir) {
        addTab(contextTarget.path);
    }
};

document.getElementById('ctx-open-new-window').onclick = () => {
    if (contextTarget && contextTarget.isDir) {
        window.api.invoke('OPEN_NEW_WINDOW', contextTarget.path);
    }
};

document.getElementById('ctx-set-wallpaper').onclick = async () => {
    if (contextTarget && !contextTarget.isDir) {
        try {
            const history = await window.api.invoke('SET_WALLPAPER_BY_PATH', contextTarget.path);
            if (history && history.length > 0) {
                localStorage.setItem('settings-global-wallpaper-active', 'true');
                localStorage.setItem('settings-active-wallpaper-id', history[0].id);
                if (typeof SettingsManager !== 'undefined' && typeof SettingsManager.loadWallpapers === 'function') {
                    await SettingsManager.loadWallpapers();
                }
            }
        } catch (e) {
            console.error('Failed to set wallpaper:', e);
        }
        if (window.isSelectingWallpaperMode && typeof window.endWallpaperSelectionMode === 'function') {
            window.endWallpaperSelectionMode(false);
        }
    }
};

// タブのコンテキストメニューアクション
document.getElementById('ctx-tab-close').onclick = () => {
    if (contextTabId) closeTab(contextTabId);
};

document.getElementById('ctx-tab-close-others').onclick = () => {
    if (!contextTabId) return;
    const tabToKeep = tabs.find(t => t.id === contextTabId);
    tabs = [tabToKeep];
    switchTab(tabToKeep.id);
};

document.getElementById('ctx-tab-close-right').onclick = () => {
    if (!contextTabId) return;
    const index = tabs.findIndex(t => t.id === contextTabId);
    if (index !== -1) {
        tabs = tabs.slice(0, index + 1);
        if (!tabs.find(t => t.id === activeTabId)) {
            switchTab(tabs[tabs.length - 1].id);
        } else {
            renderTabs();
        }
    }
    saveTabsState();
};

document.getElementById('ctx-tab-duplicate').onclick = () => {
    if (!contextTabId) return;
    const srcTab = tabs.find(t => t.id === contextTabId);
    if (srcTab) {
        addTab(srcTab.path);
    }
};

tabContextMenu.addEventListener('mouseenter', () => {
    let pinItem = document.getElementById('ctx-tab-pin');
    if (!pinItem) {
        pinItem = document.createElement('div');
        pinItem.className = 'context-item';
        pinItem.id = 'ctx-tab-pin';
        pinItem.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"></path><path d="m16.5 9.4 4.5 4.6"></path><path d="m21 9.5-4.5 4.5"></path><path d="M12 22v-5"></path></svg>
            <span>タブをピン留め</span>
        `;
        tabContextMenu.appendChild(pinItem);
    }

    if (contextTabId) {
        const tab = tabs.find(t => t.id === contextTabId);
        if (tab) {
            pinItem.querySelector('span').textContent = tab.isPinned ? 'ピン留めを外す' : 'タブをピン留め';
            pinItem.onclick = () => {
                tab.isPinned = !tab.isPinned;
                tabs.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
                renderTabs();
                saveTabsState();
                tabContextMenu.style.display = 'none';
            };
        }
    }
});

document.getElementById('ctx-cut').onclick = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
        clipboard = { mode: 'cut', items };
        document.querySelectorAll('#file-list-body tr, .grid-item').forEach(el => el.classList.remove('cut-item'));
        document.querySelectorAll('.selected').forEach(el => el.classList.add('cut-item'));
        updateClipboardButtons();
    }
};

document.getElementById('ctx-copy').onclick = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
        clipboard = { mode: 'copy', items };
        document.querySelectorAll('#file-list-body tr, .grid-item').forEach(el => el.classList.remove('cut-item'));
        updateClipboardButtons();
    }
};

document.getElementById('ctx-paste').onclick = () => {
    if (clipboard.mode && clipboard.items.length > 0) {
        const cmd = clipboard.mode === 'copy' ? 'COPY' : 'MOVE';
        clipboard.items.forEach(item => {
            window.api.sendCommand(`${cmd}|${item.srcPath}|${currentPath}${item.name}`);
        });
        if (clipboard.mode === 'cut') {
            clipboard = { mode: null, items: [] };
            updateClipboardButtons();
        }
    }
};

document.getElementById('ctx-rename').onclick = () => {
    const selected = document.querySelector('.selected');
    if (selected) {
        const nameCell = selected.querySelector('.file-name');
        if (nameCell) startRename(selected);
    }
};

document.getElementById('ctx-delete').onclick = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
        items.forEach(item => {
            window.api.sendCommand(`DELETE|${item.srcPath}`);
        });
    }
};

document.getElementById('ctx-properties').onclick = () => {
    if (!contextTarget) return;
    const useNative = localStorage.getItem('settings-native-properties') === 'true';
    if (useNative) {
        window.api.sendCommand(`PROP_NATIVE|${contextTarget.path}`);
    } else {
        showPropertiesModal(contextTarget.path);
    }
};

// パスをコピーする
document.getElementById('ctx-copy-path').onclick = () => {
    if (!contextTarget) return;
    navigator.clipboard.writeText(contextTarget.path).then(() => {
        appendTerminal(`Copied path: ${contextTarget.path}`, 'command-echo');
    }).catch(() => {
        appendTerminal(`ERROR: クリップボードへのコピーに失敗しました`, 'error');
    });
};

// プロパティ情報を取得・表示する
function showPropertiesModal(path) {
    window.api.sendCommand(`PROP|${path}`);
    appendTerminal(`Action: プロパティを取得中...`, 'command-echo');
}

// 取得したプロパティ詳細情報をモーダルに反映する
function handlePropData(content) {
    const parts = content.split('|');
    if (parts.length < 8) return;

    const path = parts[0];
    const size = parseInt(parts[1]);
    const created = parseInt(parts[2]);
    const modified = parseInt(parts[3]);
    const accessed = parseInt(parts[4]);
    const attr = parseInt(parts[5]);
    const fileCount = parseInt(parts[6]);
    const dirCount = parseInt(parts[7]);

    const fileName = path.split('\\').filter(x => x).pop() || path;
    const isDir = attr & 16;

    document.getElementById('prop-name').value = fileName;

    const iconWrapper = document.getElementById('prop-icon-wrapper');
    if (iconWrapper) {
        iconWrapper.innerHTML = IconThemeManager.getIcon(fileName, isDir);
    }

    document.getElementById('prop-type').textContent = isDir ? 'フォルダ' : (fileName.split('.').pop().toUpperCase() + ' ファイル');
    document.getElementById('prop-location').textContent = path.substring(0, path.lastIndexOf('\\'));

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 バイト';
        const k = 1024;
        const sizes = ['バイト', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i] + ' (' + bytes.toLocaleString() + ' バイト)';
    };
    document.getElementById('prop-size').textContent = formatSize(size);

    const containsRow = document.getElementById('prop-contains-row');
    if (isDir) {
        containsRow.style.display = 'flex';
        document.getElementById('prop-contains').textContent = `${fileCount.toLocaleString()} ファイル、${dirCount.toLocaleString()} フォルダ`;
    } else {
        containsRow.style.display = 'none';
    }

    const formatDate = (ms) => {
        const d = new Date(ms);
        return d.toLocaleString('ja-JP');
    };
    document.getElementById('prop-created').textContent = formatDate(created);
    document.getElementById('prop-modified').textContent = formatDate(modified);
    document.getElementById('prop-accessed').textContent = formatDate(accessed);

    document.getElementById('prop-attr-readonly').checked = attr & 1;
    document.getElementById('prop-attr-hidden').checked = attr & 2;

    document.getElementById('property-modal').style.display = 'flex';
}

// プロパティモーダルの閉じる処理を初期化する
function initPropertyModal() {
    const modal = document.getElementById('property-modal');
    const closeBtn = document.getElementById('btn-close-prop');
    const okBtn = document.getElementById('prop-ok-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    if (okBtn) {
        okBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPropertyModal);
} else {
    initPropertyModal();
}

// ドラッグ＆ドロップ(D&D)制御のためのグローバル変数
window.activeDragPaths = null;
window.hasTriggeredNativeDrag = false;
window.isDragging = false;

// ドラッグイベントのデータTransferからパス情報を抽出するヘルパー関数
function getPathsFromDragEvent(e) {
    let srcPaths = [];

    // 1. HTML5カスタムMIME（同一アプリ内）から抽出
    const pathsJson = e.dataTransfer.getData('application/x-file-paths');
    if (pathsJson) {
        try {
            srcPaths = JSON.parse(pathsJson);
        } catch (err) {
            console.error('Failed to parse drag paths JSON:', err);
        }
    }

    // 2. Electronネイティブ/外部アプリのドラッグから抽出
    if ((!srcPaths || srcPaths.length === 0) && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        srcPaths = Array.from(e.dataTransfer.files)
            .map(file => file.path)
            .filter(path => path);
    }

    // 3. フォールバック: 現在の選択項目から抽出
    if (!srcPaths || srcPaths.length === 0) {
        srcPaths = getSelectedItems().map(i => i.srcPath);
    }

    return srcPaths;
}

// HTML5ドラッグ開始イベントを処理する
function handleDragStart(e) {
    const item = e.target.closest('tr, .grid-item, .tree-item');
    if (!item) return;

    const node = item.closest('.tree-node');
    const isQA = node && node.dataset.isQuickAccess === 'true';

    let paths = [];
    let dragName = '';
    let count = 0;

    if (isQA) {
        paths = [node.dataset.path];
        dragName = item.querySelector('.tree-label').textContent;
        count = 1;
        e.dataTransfer.setData('application/x-quick-access-path', node.dataset.path);
    } else if (item.classList.contains('tree-item')) {
        return;
    } else {
        if (!item.classList.contains('selected')) {
            document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
            item.classList.add('selected');
            onSelectionChanged();
        }
        const selectedItems = getSelectedItems();
        if (selectedItems.length === 0) return;
        paths = selectedItems.map(i => i.srcPath);
        dragName = selectedItems[0].name;
        count = selectedItems.length;
    }

    e.dataTransfer.setData('application/x-file-paths', JSON.stringify(paths));
    e.dataTransfer.effectAllowed = 'all';

    const transparentImage = new Image();
    transparentImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(transparentImage, 0, 0);

    item.classList.add('dragging');

    if (!isQA) {
        window.activeDragPaths = paths;
        window.hasTriggeredNativeDrag = false;
        window.isDragging = true;
    }
}

// HTML5ドラッグ終了イベントを処理する
function handleDragEnd(e) {
    const item = e.target.closest('tr, .grid-item');
    if (item) item.classList.remove('dragging');

    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    window.isDragging = false;
    window.activeDragPaths = null;
    if (!window.hasTriggeredNativeDrag) {
        window.hasTriggeredNativeDrag = false;
    }
}

// HTML5ドラッグセッションを強制キャンセルする
function cancelHtml5Drag() {
    const item = document.querySelector('.dragging');
    if (!item) return;

    const parent = item.parentNode;
    if (!parent) return;

    const nextSibling = item.nextSibling;

    parent.removeChild(item);

    setTimeout(() => {
        if (nextSibling) {
            parent.insertBefore(item, nextSibling);
        } else {
            parent.appendChild(item);
        }
    }, 50);
}

// ウィンドウ外へのドラッグアウトを検知してネイティブドラッグを開始する
document.documentElement.addEventListener('dragleave', (e) => {
    if (window.isDragging && window.activeDragPaths && !window.hasTriggeredNativeDrag) {
        if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
            window.hasTriggeredNativeDrag = true;

            cancelHtml5Drag();

            window.api.send('ondragstart', window.activeDragPaths);
        }
    }
});

// ドラッグセッション中にタブバーの-webkit-app-region: dragを一時的に無効化し、ドロップを受け付けるようにする
window.addEventListener('dragenter', (e) => {
    document.body.classList.add('window-dragging-active');
});

window.addEventListener('dragover', (e) => {
    document.body.classList.add('window-dragging-active');
});

window.addEventListener('dragleave', (e) => {
    if (!window.hasTriggeredNativeDrag) {
        if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
            document.body.classList.remove('window-dragging-active');
        }
    }
});

window.addEventListener('drop', (e) => {
    document.body.classList.remove('window-dragging-active');
});

window.addEventListener('dragend', (e) => {
    if (!window.hasTriggeredNativeDrag) {
        document.body.classList.remove('window-dragging-active');
    }
});

// ドラッグ要素が重なったときのイベントを処理する
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const isQAMove = e.dataTransfer.types.includes('application/x-quick-access-path');

    if (isQAMove) {
        const target = e.target.closest('.tree-node[data-is-quick-access="true"]');
        if (target) {
            const treeItem = target.querySelector('.tree-item');
            const rect = treeItem.getBoundingClientRect();
            const isAfter = e.clientY > (rect.top + rect.height / 2);

            treeItem.classList.remove('drag-gap-top', 'drag-gap-bottom');
            treeItem.classList.add(isAfter ? 'drag-gap-bottom' : 'drag-gap-top');
            e.dataTransfer.dropEffect = 'move';
        }
    } else {
        const target = e.target.closest('tr[data-type="D"], .grid-item[data-type="D"], .tree-node');
        if (target) {
            const highlightTarget = target.classList.contains('tree-node') ? target.querySelector('.tree-item') : target;
            if (highlightTarget) highlightTarget.classList.add('drag-over');
        }
    }
}

// ドラッグ要素が離れたときのイベントを処理する
function handleDragLeave(e) {
    const target = e.target.closest('tr[data-type="D"], .grid-item[data-type="D"], .tree-node, .tree-item');
    if (target) {
        const highlightTarget = target.classList.contains('tree-node') ? target.querySelector('.tree-item') : target;
        if (highlightTarget) {
            highlightTarget.classList.remove('drag-over', 'drag-gap-top', 'drag-gap-bottom');
        }
    }
}

// ドロップ時のイベントを処理する
function handleDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.drag-over, .drag-gap-top, .drag-gap-bottom').forEach(el => {
        el.classList.remove('drag-over', 'drag-gap-top', 'drag-gap-bottom');
    });

    const qaPath = e.dataTransfer.getData('application/x-quick-access-path');
    if (qaPath) {
        const targetNode = e.target.closest('.tree-node[data-is-quick-access="true"]');
        if (targetNode && targetNode.dataset.path !== qaPath) {
            const treeItem = targetNode.querySelector('.tree-item');
            const rect = treeItem.getBoundingClientRect();
            const isAfter = e.clientY > (rect.top + rect.height / 2);
            reorderQuickAccess(qaPath, targetNode.dataset.path, isAfter);
        }
        return;
    }

    const target = e.target.closest('tr[data-type="D"], .grid-item[data-type="D"], .tree-node');
    if (!target) return;

    const srcPaths = getPathsFromDragEvent(e);

    if (srcPaths.length === 0) return;

    let destPath = '';
    if (target.classList.contains('tree-node')) {
        destPath = target.dataset.path;
    } else if (target.dataset.name) {
        destPath = currentPath + target.dataset.name + '\\';
    }

    if (!destPath) return;

    if (typeof appendTerminal === 'function') {
        appendTerminal(`Moving ${srcPaths.length} items to ${destPath}...`, 'command-echo');
    }

    srcPaths.forEach(srcPath => {
        const fileName = srcPath.split('\\').pop();
        const targetPath = destPath + fileName;

        if (srcPath !== targetPath && !destPath.startsWith(srcPath + '\\')) {
            window.api.sendCommand(`MOVE|${srcPath}|${targetPath}`);
        }
    });
}

// 管理者権限ダイアログを表示する
function showPermissionDialog(path) {
    const overlay = document.createElement('div');
    overlay.className = 'permission-overlay';
    overlay.innerHTML = `
        <div class="permission-dialog">
            <div class="permission-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <h3>アクセス許可がありません</h3>
            <p>このフォルダーへのアクセス権限がありません。<br>「続行」をクリックすると、管理者権限を使用してこのフォルダーへの永続的なアクセス権を取得します。</p>
            <div class="permission-path">${path}</div>
            <div class="permission-buttons">
                <button class="btn-cancel">キャンセル</button>
                <button class="btn-continue btn-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px; margin-right:6px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    続行
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.btn-cancel').onclick = () => {
        document.body.removeChild(overlay);
    };

    overlay.querySelector('.btn-continue').onclick = () => {
        window.api.sendCommand(`ELEVATE|${path}`);
        document.body.removeChild(overlay);
    };
}

window.isSelectingWallpaperMode = false;

// 壁紙選択モードを開始する
window.startWallpaperSelectionMode = async () => {
    window.isSelectingWallpaperMode = true;

    document.body.classList.add('wallpaper-gallery-mode');

    const settingsScreen = document.getElementById('settings-screen');
    if (settingsScreen) settingsScreen.style.display = 'none';

    const banner = document.getElementById('wallpaper-select-banner');
    if (banner) {
        banner.style.display = 'flex';
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectWallpaper') === 'true') {
        const homeView = document.getElementById('home-view');
        const explorerView = document.getElementById('explorer-view');
        const galleryView = document.getElementById('wallpaper-gallery-view');

        if (homeView) homeView.style.display = 'none';
        if (explorerView) explorerView.style.display = 'none';
        if (galleryView) {
            galleryView.style.display = 'flex';

            const grid = document.getElementById('wallpaper-gallery-grid');
            if (grid) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px; font-size: 13px;">画像をスキャン中...（数秒かかる場合があります）</div>';
            }

            try {
                const images = await window.api.invoke('SCAN_USER_IMAGES');

                let history = [];
                try {
                    history = await window.api.invoke('GET_WALLPAPERS');
                } catch (e) {
                    console.error('Failed to get wallpaper history for catalog exclusion:', e);
                }

                const registeredPaths = new Set(
                    history
                        .map(item => (item.originalPath || '').toLowerCase().trim())
                        .filter(p => p !== '')
                );

                const filteredImages = images.filter(img => {
                    const imgPathLower = (img.path || '').toLowerCase().trim();
                    return !registeredPaths.has(imgPathLower);
                });

                renderGalleryGrid(filteredImages);
            } catch (err) {
                console.error('Failed to scan images:', err);
                if (grid) {
                    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px; font-size: 13px;">画像の検索に失敗しました。</div>';
                }
            }
        }
    }
};

// 壁紙選択モードを終了する
window.endWallpaperSelectionMode = (restoreSettings = false) => {
    window.isSelectingWallpaperMode = false;

    document.body.classList.remove('wallpaper-gallery-mode');

    const banner = document.getElementById('wallpaper-select-banner');
    if (banner) banner.style.display = 'none';

    const galleryView = document.getElementById('wallpaper-gallery-view');
    if (galleryView) galleryView.style.display = 'none';

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectWallpaper') === 'true') {
        window.close();
        return;
    }

    if (restoreSettings) {
        const settingsScreen = document.getElementById('settings-screen');
        if (settingsScreen) {
            settingsScreen.style.display = 'flex';
            const tabBtn = document.querySelector('.settings-tab-btn[data-tab="wallpaper"]');
            if (tabBtn) tabBtn.click();
        }
    }
};

// 壁紙ギャラリーのグリッドを描画する
function renderGalleryGrid(images) {
    const grid = document.getElementById('wallpaper-gallery-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!images || images.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px; font-size: 13px;">画像ファイルが見つかりませんでした。</div>';
        return;
    }

    images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'gallery-card';

        const fileUri = encodeURI(`file:///${img.path}`.replace(/\\/g, '/')).replace(/#/g, '%23');

        card.innerHTML = `
            <div class="gallery-card-thumb">
                <img src="${fileUri}" loading="lazy" alt="${img.name}" onerror="this.src='build/icon.ico'">
            </div>
            <div class="gallery-card-info">
                <div class="gallery-card-title" title="${img.name}">${img.name}</div>
                <div class="gallery-card-path" title="${img.path}">${img.path}</div>
            </div>
        `;

        card.ondblclick = async () => {
            try {
                const history = await window.api.invoke('SET_WALLPAPER_BY_PATH', img.path);
                if (history && history.length > 0) {
                    localStorage.setItem('settings-global-wallpaper-active', 'true');
                    localStorage.setItem('settings-active-wallpaper-id', history[0].id);
                    if (typeof SettingsManager !== 'undefined' && typeof SettingsManager.loadWallpapers === 'function') {
                        await SettingsManager.loadWallpapers();
                    }
                }
            } catch (e) {
                console.error('Failed to set wallpaper:', e);
            }
            if (typeof window.endWallpaperSelectionMode === 'function') {
                window.endWallpaperSelectionMode(false);
            }
        };

        card.onclick = () => {
            document.querySelectorAll('.gallery-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        };

        grid.appendChild(card);
    });
}

// 壁紙選択バナーのキャンセルボタンを初期化する
document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('btn-cancel-wallpaper-select');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (typeof window.endWallpaperSelectionMode === 'function') {
                window.endWallpaperSelectionMode(false);
            }
        };
    }
});

// デバイスの変更を検知してツリービューを自動更新する
if (window.api && typeof window.api.onDeviceChange === 'function') {
    window.api.onDeviceChange(() => {
        console.log('USB/Removable drive change detected! Refreshing drives list...');
        initTree('HOME');
    });
}
