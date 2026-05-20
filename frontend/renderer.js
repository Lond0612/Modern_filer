// ---------------------------------------------------------------------------
// 状態変数・タブ管理
// ---------------------------------------------------------------------------

class Tab {
    constructor(id, path = 'HOME', isPinned = false) {
        this.id = id;
        this.path = path;
        this.isPinned = isPinned;
        this.isHomeActive = (path === 'HOME');
        this.historyBack = [];
        this.historyForward = [];
        this.scrollPosition = 0;
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

function saveTabsState() {
    // ピン留めされたタブのみを保存対象とする
    const pinnedTabs = tabs.filter(t => t.isPinned).map(t => ({
        id: t.id,
        path: t.path,
        isPinned: true
    }));
    localStorage.setItem('pinnedTabsState', JSON.stringify(pinnedTabs));
}

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

function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

// 互換性のためのゲッター/セッター（既存コードの修正を最小限にするため、
// 内部で activeTab のプロパティを参照するようにする）
// ※ 最終的にはこれらもリファクタリングして getActiveTab().path 等に置き換えるのが望ましい

function getCurrentPath() { return getActiveTab()?.path || ''; }
function setCurrentPath(val) { if (getActiveTab()) getActiveTab().path = val; }
function getIsHomeActive() { return getActiveTab()?.isHomeActive ?? true; }
function setIsHomeActive(val) { if (getActiveTab()) getActiveTab().isHomeActive = val; }
function getHistoryBack() { return getActiveTab()?.historyBack || []; }
function getHistoryForward() { return getActiveTab()?.historyForward || []; }

// 既存コードとの互換性のためにグローバル変数としてアクセス可能にする
Object.defineProperty(window, 'currentPath', { get: getCurrentPath, set: setCurrentPath, configurable: true });
Object.defineProperty(window, 'isHomeActive', { get: getIsHomeActive, set: setIsHomeActive, configurable: true });
Object.defineProperty(window, 'historyBack', { get: getHistoryBack, configurable: true });
Object.defineProperty(window, 'historyForward', { get: getHistoryForward, configurable: true });

// 外部ショートカット管理用の公開
Object.defineProperty(window, 'activeTabId', { get: () => activeTabId, set: (val) => activeTabId = val, configurable: true });
Object.defineProperty(window, 'tabs', { get: () => tabs, set: (val) => tabs = val, configurable: true });
Object.defineProperty(window, 'contextTarget', { get: () => contextTarget, set: (val) => contextTarget = val, configurable: true });
Object.defineProperty(window, 'selectionAnchorIndex', { get: () => selectionAnchorIndex, set: (val) => selectionAnchorIndex = val, configurable: true });

let recentFolders = JSON.parse(localStorage.getItem('recentFolders') || '[]');
let pendingRename = null; // 作成直後のリネーム待ちファイル名

// クリップボード状態
let clipboard = { mode: null, items: [] };
// mode: 'copy' | 'cut'
// items: [{ name: string, srcPath: string }]

// クイックアクセス
let rawQuickAccessItems = JSON.parse(localStorage.getItem('quickAccessItems') || '[]');
let quickAccessItems = rawQuickAccessItems.filter(item => item.path !== 'HOME' && item.path !== 'HOME\\' && item.label !== 'HOME' && item.label !== 'ホーム').map(item => {
    if (item.path && !item.path.endsWith('\\')) item.path += '\\';
    return item;
});
if (rawQuickAccessItems.length !== quickAccessItems.length) {
    localStorage.setItem('quickAccessItems', JSON.stringify(quickAccessItems));
}

// 重複や不正なデータの簡易リペア（ミュージックが重複する等の不具合対策）
function repairQuickAccess(paths) {
    if (!paths) return;
    const normalize = p => (p && !p.endsWith('\\')) ? p + '\\' : p;
    
    // システムパスに基づき、特定のラベルを持つアイテムのパスを強制修正
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
let homeDisplayMode = localStorage.getItem('homeDisplayMode') || 'recent'; // 'recent' | 'favorite'

// ナビゲーションロック
let navigationLockUntil = 0;

function isNavigationLocked() {
    return Date.now() < navigationLockUntil;
}

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


// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
window.onload = () => {
    // 起動時はバックエンドのREADYを待つ
    initTabs();

    // 壁紙選択用ウィンドウとして開かれた場合の処理
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectWallpaper') === 'true') {
        if (typeof window.startWallpaperSelectionMode === 'function') {
            window.startWallpaperSelectionMode();
        }
    }
};

function initTabs() {
    // 1. ピン留めタブを復元
    loadTabsState();
    
    // 2. 常に新規HOMEタブを追加してアクティブにする
    const urlParams = new URLSearchParams(window.location.search);
    const initialPath = urlParams.get('path') || 'HOME';
    addTab(initialPath);
}

function addTab(path = 'HOME', switchImmediately = true) {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const newTab = new Tab(id, path);
    
    // ピン留めタブの後に挿入
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
    
    // アクティブなタブを視界に入れる
    const tabEl = document.querySelector(`.tab-item[data-id="${id}"]`);
    if (tabEl) {
        tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    
    saveTabsState();

    // ターミナルの同期（カレントディレクトリの移動）
    if (tab.path && tab.path !== 'HOME') {
        window.api.sendCommand(`CD|${tab.path}`);
    }
}

function closeTab(id, e) {
    if (e) e.stopPropagation();
    
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const tabToClose = tabs[index];
    if (tabs.length <= 1) {
        window.close();
        return;
    }

    // 閉じたタブをスタックに保存
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

function restoreRecentlyClosedTab() {
    const last = recentlyClosedTabs.pop();
    if (last) {
        addTab(last.path);
    }
}

function renderTabs() {
    const tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;

    // FLIP: First (現在の位置を記録)
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
        
        // 選択は onMouseUp で処理（ドラッグと区別するため）
        
        tabEl.onmousedown = (e) => handleTabMouseDown(e, tab.id);
        
        tabEl.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            contextTabId = tab.id;
            
            // 表示位置の計算
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

    // ホイールでの横スクロール対応
    tabBar.onwheel = (e) => {
        e.preventDefault();
        tabBar.scrollLeft += e.deltaY;
    };

    // FLIP: Last, Invert, Play (新しい位置との差分をアニメーション)
    requestAnimationFrame(() => {
        tabBar.querySelectorAll('.tab-item').forEach(el => {
            const id = el.dataset.id;
            
            if (id === draggedTabId) {
                // ドラッグ中のタブはオフセットを直接適用
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

// ---------------------------------------------------------------------------
// タブのカスタムドラッグ＆ドロップ
// ---------------------------------------------------------------------------
function handleTabMouseDown(e, id) {
    if (e.button === 1) { // 中ボタンクリックでタブを閉じる
        e.preventDefault();
        e.stopPropagation();
        closeTab(id);
        return;
    }
    if (e.button !== 0) return; // 左クリック以外（右クリック等）は無視
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
            const isDetached = Math.abs(offsetY) > 60; // 60px以上離れたら切り離しモード

            tabEl.style.transition = 'none';
            tabEl.style.zIndex = '1000';
            tabEl.classList.add('dragging');

            if (isDetached && tabs.length > 1) {
                // 切り離し中
                tabEl.classList.add('detaching');
                tabEl.style.transform = `translate(${tabDragOffsetX}px, ${offsetY}px) scale(0.85)`;
                return; // 切り離し中は入れ替え判定を行わない
            } else {
                tabEl.classList.remove('detaching');
                tabEl.style.transform = `translateX(${tabDragOffsetX}px)`;
            }

            // 他のタブとの入れ替え判定
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
                    // 右方向への入れ替え
                    const item = tabs.splice(srcIndex, 1)[0];
                    tabs.splice(otherIndex, 0, item);
                    tabDragStartX += otherRect.width + 4;
                    tabDragOffsetX = tabDragCurrentX - tabDragStartX;
                    renderTabs();
                    break;
                } else if (srcIndex > otherIndex && draggedMid < otherMid) {
                    // 左方向への入れ替え
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
            
            // 60px以上離れた場所で離した場合、かつタブが複数ある場合
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

            // ドラッグ距離が小さければタブ切り替え（クリック判定）
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

// ---------------------------------------------------------------------------
// 各種ボタン・メニュー制御
// ---------------------------------------------------------------------------

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

// 新規作成メニューの動的生成
window.updateNewFileMenus = function() {
    const data = localStorage.getItem('settings-custom-new-files');
    const customExtensions = data ? JSON.parse(data) : [
        { id: 'default-text', label: 'テキストファイル', extension: '.txt' }
    ];

    // 1. ツールバーのメニュー更新
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

        // フォルダ作成のイベント付け直し
        const dirItem = newMenuEl.querySelector('[data-type="directory"]');
        if (dirItem) {
            dirItem.onclick = (e) => {
                e.stopPropagation();
                createNewItem('directory');
                newMenuEl.classList.remove('visible');
            };
        }
    }

    // 2. コンテキストメニューのサブメニュー更新
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

        // フォルダ作成のイベント付け直し
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

function createNewItem(typeOrExt, label = '') {
    if (!currentPath) return;
    
    let defaultName = '';
    let command = '';

    if (typeOrExt === 'directory') {
        defaultName = '新しいフォルダ';
        command = 'MKDIR';
    } else {
        // 拡張子つきファイル
        const ext = typeOrExt.startsWith('.') ? typeOrExt : '.' + typeOrExt;
        defaultName = (label || '新規ファイル') + ext;
        command = 'NEW_FILE';
    }

    defaultName = resolveNameConflict(defaultName);
    pendingRename = defaultName;
    window.api.sendCommand(`${command}|${currentPath}${defaultName}`);
}

// 初期化と同期
updateNewFileMenus(); // 即座に実行

window.addEventListener('storage', (e) => {
    if (e.key === 'settings-custom-new-files' || e.key === 'settings-custom-new-files-updated') {
        updateNewFileMenus();
    }
});

// メニュー以外をクリックしたら閉じる、ファイルリスト外をクリックしたら選択解除
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
    // 前のカット状態をクリア
    document.querySelectorAll('#file-list-body tr.cut-item, .grid-item.cut-item').forEach(r => r.classList.remove('cut-item'));
    clipboard = { mode: 'cut', items: selected };
    // 選択行を半透明に
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
    // 選択中の先頭が1つの行に対してリネームを開始
    const selectedRows = document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected');
    if (selectedRows.length === 0) return;
    startRename(selectedRows[0]);
};

// ソートメニューのイベント
function updateSortMenuUI() {
    document.querySelectorAll('.sort-item .check-icon').forEach(icon => icon.style.opacity = '0');
    document.querySelectorAll(`.sort-item[data-sort-key="${currentSortKey}"] .check-icon`).forEach(icon => icon.style.opacity = '1');

    document.querySelectorAll('.sort-order .check-icon').forEach(icon => icon.style.opacity = '0');
    document.querySelectorAll(`.sort-order[data-sort-order="${currentSortOrder}"] .check-icon`).forEach(icon => icon.style.opacity = '1');
}
// デフォルト状態（名前・昇順）のチェックマークを初期表示
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


// 表示モードの順序
const viewModeOrder = ['compact', 'details', 'small', 'medium', 'large', 'extralarge'];
let currentIconSize = 40; // デフォルトサイズ（中アイコン相当）

// 表示モードを適用する共通関数
function applyViewMode(mode, customSize = null) {
    const prevMode = currentViewMode;
    currentViewMode = mode;
    
    // アイコンサイズの設定
    if (customSize) {
        currentIconSize = Math.max(24, Math.min(256, customSize));
    } else {
        // 固定モード名からサイズを設定
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
        
        // カスタムサイズが指定されているか、固定サイズか
        if (customSize || !['small', 'medium', 'large', 'extralarge'].includes(mode)) {
            fileGrid.className = 'grid-custom';
            const itemWidth = Math.max(80, currentIconSize * 2.2); // 少し余裕を持たせる
            fileGrid.style.setProperty('--grid-icon-size', `${currentIconSize}px`);
            fileGrid.style.setProperty('--grid-item-width', `${itemWidth}px`);
        } else {
            fileGrid.classList.remove('grid-custom');
            fileGrid.className = `grid-size-${currentViewMode}`;
        }
    }
    
    updateViewMenuUI();

    // モード体系（テーブル vs グリッド）が変わった場合のみリロード
    if (isIconMode !== wasIconMode || (currentViewMode !== prevMode && !isIconMode)) {
        if (currentPath) window.api.sendCommand(`LIST|${currentPath}`);
    }
}

// マウスホイールによるズーム（Ctrl + Wheel）
window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        
        const isIconMode = !['details', 'compact'].includes(currentViewMode);

        if (e.deltaY < 0) { // 上にスクロール（拡大）
            if (currentViewMode === 'compact') {
                applyViewMode('details');
            } else if (currentViewMode === 'details') {
                applyViewMode('small');
            } else if (isIconMode) {
                // 既にアイコンモードならサイズを増やす
                if (currentIconSize < 256) {
                    applyViewMode('icons-custom', currentIconSize + 8);
                }
            }
        } else { // 下にスクロール（縮小）
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

// updateViewMenuUI の修正（カスタムサイズ時も近いモードにチェックを入れる）
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
        window.api.sendCommand(`LIST|${currentPath}`); // Reload
    };
});

// ---------------------------------------------------------------------------
// ナビゲーション
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// マウスサイドボタン（戻る/進む）ナビゲーション
// ---------------------------------------------------------------------------
// button=3: XButton1（戻るボタン）/ button=4: XButton2（進むボタン）
window.addEventListener('mousedown', (e) => {
    // テキスト入力中は無視（リネームやアドレスバー操作に影響しないよう）
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

function showHomeUI() {
    homeView.style.display = 'block';
    explorerView.style.display = 'none';
    btnSidebarHome.classList.add('active');
    addressInput.value = 'HOME';
    
    // ツリーの選択解除
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    // HOME項目をアクティブに
    const homeNode = treeView.querySelector('.tree-node[data-path="HOME"]');
    if (homeNode) homeNode.querySelector('.tree-item').classList.add('active');
    
    renderHomeContent();

    // プレビューを閉じる
    if (typeof PreviewManager !== 'undefined') {
        PreviewManager.hide();
    }

    // Git状態の非表示とクリア
    const gitIndicator = document.getElementById('git-branch-indicator');
    if (gitIndicator) gitIndicator.style.display = 'none';
    currentGitStatus = { isRepo: false, branch: '', files: {} };
}

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

function showExplorerUI(path) {
    homeView.style.display = 'none';
    explorerView.style.display = 'block';
    btnSidebarHome.classList.remove('active');
    if (path) {
        window.api.sendCommand(`LIST|${path}`);
    }
}

function showExplorer(path) {
    const tab = getActiveTab();
    if (!tab) return;
    tab.isHomeActive = false;
    showExplorerUI(path);
    if (path) loadPath(path, true);
}

async function renderHomeContent() {
    const quickAccess = document.getElementById('home-quick-access');
    const recentList = document.getElementById('home-recent-list');
    const favoriteList = document.getElementById('home-favorite-list');
    const greeting = document.getElementById('home-greeting');
    
    // 挨拶の更新
    const hour = new Date().getHours();
    if (hour < 12) greeting.textContent = "おはようございます";
    else if (hour < 18) greeting.textContent = "こんにちは";
    else greeting.textContent = "こんばんは";

    // 表示モードの同期
    const btnRecent = document.getElementById('btn-home-recent');
    const btnFavorite = document.getElementById('btn-home-favorite');
    if (btnRecent && btnFavorite) {
        btnRecent.classList.toggle('active', homeDisplayMode === 'recent');
        btnFavorite.classList.toggle('active', homeDisplayMode === 'favorite');
        recentList.style.display = homeDisplayMode === 'recent' ? 'flex' : 'none';
        favoriteList.style.display = homeDisplayMode === 'favorite' ? 'flex' : 'none';
    }

    // クイックアクセスの描画
    quickAccess.innerHTML = '';
    
    if (quickAccessItems.length === 0 || !cachedSystemPaths) {
        // 初回またはキャッシュがない場合の取得
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
            if (e.button === 1) { // ホイールクリック
                e.preventDefault();
                addTab(item.path, false); // バックグラウンドで開く
            }
        };
        quickAccess.appendChild(tile);
    });

    // 最近使用したフォルダの描画
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
                if (e.button === 1) { // ホイールクリック
                    e.preventDefault();
                    addTab(folder.path, false); // バックグラウンドで開く
                }
            };
            recentList.appendChild(item);
        });
    }

    // お気に入りの描画
    favoriteList.innerHTML = '';
    if (favoriteItems.length === 0) {
        favoriteList.innerHTML = '<div style="color:var(--text-muted); font-size:13px; padding: 20px; text-align: center;">お気に入りは登録されていません</div>';
    } else {
        favoriteItems.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'recent-item'; // 同じスタイルを流用
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

function addToRecentFolders(path) {
    if (!path || path === 'HOME') return;
    const name = path.split('\\').filter(Boolean).pop() || path;
    recentFolders = recentFolders.filter(f => f.path !== path);
    recentFolders.unshift({ name, path, timestamp: Date.now() });
    recentFolders = recentFolders.slice(0, 20);
    localStorage.setItem('recentFolders', JSON.stringify(recentFolders));
}

btnRefresh.onclick = () => {
    addressInput.value = currentPath; // アドレスバーの表示をリセット
    if (currentPath === 'HOME') {
        renderHomeContent();
    } else if (currentPath) {
        window.api.sendCommand(`LIST|${currentPath}`);
    }
};

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

    // パスの正規化（末尾のバックスラッシュが重複しないようにする）
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

// ---------------------------------------------------------------------------
// バックエンド通信
// ---------------------------------------------------------------------------
window.api.onBackendResponse((obj) => {
    switch (obj.type) {
        case 'READY':
            const initialTab = getActiveTab();
            if (initialTab && initialTab.path !== 'HOME') {
                loadPath(initialTab.path, true); // バックエンドの状態を同期
            } else {
                showHome();
            }
            initTree('HOME');
            // getDrives() は不要（initTreeがGET_DRIVESを送信して取得するため削除）
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
            // サーバーが生成した実際のパス（重複回避後の名前）を取得
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
            if (typeof updateGitStatus === 'function') {
                updateGitStatus(currentPath);
            }
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
            // 移動元と移動先が同一ディレクトリなら1回のLISTで済む
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
            // 何もしない
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

// ---------------------------------------------------------------------------
// ファイルリスト表示
// ---------------------------------------------------------------------------

// 選択中アイテムを [{name, srcPath}] で返す
function getSelectedItems() {
    const items = [];
    document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(row => {
        const name = row.dataset.name;
        if (name) items.push({ name, srcPath: currentPath + name });
    });
    return items;
}

// ペーストボタンの有効/無効を制御
function updateClipboardButtons() {
    btnPaste.disabled = !clipboard.mode || clipboard.items.length === 0;
}

function getFileNameWithoutExtension(name) {
    if (showExtensions) return name;
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex > 0) {
        return name.substring(0, lastDotIndex);
    }
    return name;
}

function isImageExtension(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext);
}

function isVideoExtension(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext);
}

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

        // D&D イベント
        tr.ondragstart = handleDragStart;
        tr.ondragend = handleDragEnd;
        if (isDir) {
            tr.ondragover = handleDragOver;
            tr.ondragenter = handleDragOver;
            tr.ondragleave = handleDragLeave;
            tr.ondrop = handleDrop;
        }

        // 選択ロジック
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

        // D&D イベント
        div.ondragstart = handleDragStart;
        div.ondragend = handleDragEnd;
        if (isDir) {
            div.ondragover = handleDragOver;
            div.ondragenter = handleDragOver;
            div.ondragleave = handleDragLeave;
            div.ondrop = handleDrop;
        }

        // 選択ロジック
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

    const gitStatus = typeof getGitStatusForFile === 'function' ? getGitStatusForFile(name) : null;
    if (gitStatus) {
        element.classList.add(`git-status-${gitStatus}`);
    }

    // (個別要素の onclick/onmousedown は作成時に登録済み)

    element.ondblclick = async () => {
        if (isNavigationLocked()) return;
        if (type === 'D') {
            loadPath(currentPath + name + '\\', true);
        } else {
            // 壁紙選択モード時の割り込み
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
        if (e.button === 1) { // ホイールクリック
            if (isNavigationLocked()) return;
            if (type === 'D') {
                e.preventDefault();
                addTab(currentPath + name + '\\', false); // バックグラウンドで開く
            }
        }
    };

    if (pendingRename && name === pendingRename) {
        pendingRename = null;
        setTimeout(() => startRename(element), 100);
    }
}

// ---------------------------------------------------------------------------
// リネーム機能
// ---------------------------------------------------------------------------
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

    // 入力内容に合わせて入力欄の幅を動的に調整
    const adjustInputWidth = () => {
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.font = window.getComputedStyle(input).font;
        span.textContent = input.value || ' '; // 空の場合は1文字分の幅を確保
        document.body.appendChild(span);
        // padding(左右合わせて10px)やカーソル幅を考慮して15pxほど余裕を持たせる
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

        // 共通の描画復旧処理
        const restoreView = (nameToUse) => {
            const currentIcon = IconThemeManager.getIcon(nameToUse, isDir);
            const displayName = isDir ? nameToUse : getFileNameWithoutExtension(nameToUse);
            if (el.tagName === 'TR') {
                nameCell.innerHTML = `<span class="cell-content"><span style="margin-right: 6px; display: flex; align-items: center; flex-shrink: 0;">${currentIcon}</span><span class="file-name-text">${displayName}</span></span>`;
            } else {
                nameCell.textContent = displayName;
                // グリッドの場合はアイコンも更新（名前で変わる可能性があるため）
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

        // キャンセルまたは空入力
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

// 現在のファイルリストに同名エントリがあれば、連番を付けてユニークな名前を返す
// skipName: 現在リネーム対象のファイル（自分自身は除外する）
function resolveNameConflict(name, skipName) {
    const existing = new Set();
    document.querySelectorAll('#file-list-body tr, .grid-item').forEach(row => {
        const n = row.dataset.name;
        if (n && n !== skipName) existing.add(n);
    });

    if (!existing.has(name)) return name;

    // 拡張子とベース名を分離して連番を付ける
    const dotIndex = name.lastIndexOf('.');
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext  = dotIndex > 0 ? name.slice(dotIndex)   : '';

    for (let i = 2; i < 1000; i++) {
        const candidate = `${base} (${i})${ext}`;
        if (!existing.has(candidate)) return candidate;
    }
    return name;
}

// ---------------------------------------------------------------------------
// 検索バー
// ---------------------------------------------------------------------------
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
        if (e.button === 1) { // Middle click
            e.preventDefault(); // オートスクロールを防止
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

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------
function appendTerminal(text, className = '') {
    const div = document.createElement('div');
    if (className) div.className = className;
    div.textContent = text;
    terminalOutput.appendChild(div);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function formatSize(bytes) {
    const b = parseInt(bytes);
    if (isNaN(b)) return bytes;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

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
            terminalInput.value = '';
        }
    }
});

addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loadPath(addressInput.value.trim(), true);
    }
});

// ---------------------------------------------------------------------------
// ツリービュー
// ---------------------------------------------------------------------------
const treeView = document.getElementById('tree-view');
let treeLoadingPath = '';

async function initTree(rootPath) {
    treeView.innerHTML = '';
    
    // クイックアクセスの初期化確認
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

    // クイックアクセス
    quickAccessItems.forEach(item => {
        const iconHtml = IconThemeManager.customIcons[item.icon] || IconThemeManager.customIcons.folder;
        createTreeNode(item.path, treeView, true, iconHtml, item.label, true, true);
    });
    
    // セパレーター
    const sep = document.createElement('div');
    sep.className = 'tree-separator';
    treeView.appendChild(sep);
    
    // ドライブ一覧の取得
    window.api.sendCommand('GET_DRIVES');
}

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

    // D&D イベント (サイドバーは全てフォルダー)
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
        
        // クイックアクセス等のトグルがない項目の場合は1クリックで移動
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
        if (e.button === 1) { // ホイールクリック
            if (isNavigationLocked()) return;
            e.preventDefault();
            e.stopPropagation();
            addTab(node.dataset.path, false); // バックグラウンドで開く
        }
    };

    container.appendChild(node);
    return node;
}

function addTreeItem(folderName) {
    const parentNode = findTreeNode(treeLoadingPath);
    if (parentNode) {
        const childrenContainer = parentNode.querySelector('.tree-children');
        createTreeNode(treeLoadingPath + folderName, childrenContainer);
    }
}

function findTreeNode(path) {
    const p = path.endsWith('\\') ? path : path + '\\';
    const escapedPath = p.replace(/\\/g, '\\\\');
    
    // クイックアクセス以外のノード（ドライブツリー内のノード）を優先的に探す
    const node = treeView.querySelector(`.tree-node[data-path="${escapedPath}"]:not([data-is-quick-access="true"])`);
    if (node) return node;
    
    return treeView.querySelector(`.tree-node[data-path="${escapedPath}"]`);
}

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

// ---------------------------------------------------------------------------
// リサイズ機能
// ---------------------------------------------------------------------------
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

function onSelectionChanged() {
    if (typeof PreviewManager !== 'undefined') {
        PreviewManager.update();
    }
}

// 以前ここにあったショートカット用ヘルパー関数と initShortcuts は js/shortcuts.js へ移動しました

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

// レイアウト切り替えロジック


initResizers();

// ---------------------------------------------------------------------------
// カラムリサイズ機能
// ---------------------------------------------------------------------------
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
            e.preventDefault(); // テキスト選択を防ぐ
        });
    });

    function onMouseMove(e) {
        if (!currentTh) return;
        const dx = e.pageX - startX;
        let newWidth = startWidth + dx;
        
        // CSS の min-width を取得して尊重する（設定されていない場合はデフォルト 50px）
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

// ---------------------------------------------------------------------------
// コンテキストメニュー制御
// ---------------------------------------------------------------------------
const contextMenu = document.getElementById('context-menu');
let contextTarget = null; // 右クリック対象のデータ

window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    // 他のドロップダウンメニューが開いている場合は閉じる
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

    // メニューグループの表示切り替え
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

    // すべてのメニュー項目を一度リセット
    document.querySelectorAll('.context-item').forEach(item => {
        item.classList.remove('disabled');
    });

    // アイテム選択の有無に応じた制御
    const hasSelection = contextTarget !== null;
    ['ctx-open', 'ctx-open-new-tab', 'ctx-open-new-window', 'ctx-cut', 'ctx-copy', 'ctx-rename', 'ctx-delete', 'ctx-quick-access', 'ctx-favorite', 'ctx-properties', 'ctx-copy-path'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('disabled', !hasSelection);
    });

    // クイックアクセスのテキスト切り替え
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
        // ファイルの場合はクイックアクセス・お気に入り無効
        const qaItem = document.getElementById('ctx-quick-access');
        if (qaItem) qaItem.classList.add('disabled');
        const favItem = document.getElementById('ctx-favorite');
        if (favItem) favItem.classList.add('disabled');
        // 新しいタブ・ウィンドウで開くも無効
        const newTabItem = document.getElementById('ctx-open-new-tab');
        if (newTabItem) newTabItem.classList.add('disabled');
        const newWinItem = document.getElementById('ctx-open-new-window');
        if (newWinItem) newWinItem.classList.add('disabled');
    }

    // 壁紙設定項目の表示切替（画像ファイルの場合のみ表示）
    const isImageFile = hasSelection && !contextTarget.isDir && /\.(jpe?g|png|gif|webp|svg)$/i.test(contextTarget.name);
    const wallpaperItem = document.getElementById('ctx-set-wallpaper');
    if (wallpaperItem) {
        wallpaperItem.style.display = isImageFile ? 'flex' : 'none';
    }

    // お気に入りのテキスト切り替え
    if (hasSelection && contextTarget.isDir) {
        const favItem = document.getElementById('ctx-favorite');
        if (favItem) {
            const isRegistered = favoriteItems.some(item => item.path === contextTarget.path);
            favItem.querySelector('span').textContent = isRegistered ? 'お気に入りから解除' : 'お気に入りに追加';
        }
    }
    
    // 貼り付けの制御
    const canPaste = clipboard.mode && clipboard.items.length > 0;
    document.getElementById('ctx-paste').classList.toggle('disabled', !canPaste);

    // チェックマーク同期（Bug Fix 2 & 3）
    updateSortMenuUI();
    updateViewMenuUI();

    // 表示位置の計算（Bug Fix 1: 画面外クランプ対応）
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

// ---------------------------------------------------------------------------
// サブメニュー位置制御（右端はみ出し防止）
// ---------------------------------------------------------------------------
// CSSホバーでサブメニューを表示する前に位置を調整するため、
// mouseenterイベントで毎回方向を計算して切り替える
document.querySelectorAll('.has-submenu').forEach(item => {
    item.addEventListener('mouseenter', () => {
        const submenu = item.querySelector('.submenu');
        if (!submenu) return;

        // 実際の幅と高さを取得するため、一時的にvisibility:hiddenで表示
        submenu.style.visibility = 'hidden';
        submenu.style.display = 'block';
        const submenuWidth = submenu.offsetWidth;
        const submenuHeight = submenu.offsetHeight;
        submenu.style.display = '';
        submenu.style.visibility = '';

        // 要素の座標を取得
        const rect = item.getBoundingClientRect();

        // 横幅の調整
        if (rect.right + submenuWidth > window.innerWidth) {
            // 右側に入らない → 左側に反転
            submenu.style.left = 'auto';
            submenu.style.right = '100%';
        } else {
            // 右側に余裕あり → デフォルト（右側）
            submenu.style.left = '100%';
            submenu.style.right = 'auto';
        }

        // 高さの調整
        if (rect.top + submenuHeight > window.innerHeight) {
            // 下側に入らない → 上に伸ばす
            submenu.style.top = 'auto';
            submenu.style.bottom = '0';
        } else {
            // 下側に余裕あり → デフォルト（下へ）
            submenu.style.top = '-5px';
            submenu.style.bottom = 'auto';
        }
    });
});

// クイックアクセス操作
const btnCtxQuickAccess = document.getElementById('ctx-quick-access');
if (btnCtxQuickAccess) {
    btnCtxQuickAccess.onclick = () => {
        if (!contextTarget || !contextTarget.isDir || contextTarget.path === 'HOME' || contextTarget.path === 'HOME\\') return;
        
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

// お気に入り操作
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

function refreshQuickAccessUI() {
    initTree(currentPath);
    if (isHomeActive) renderHomeContent();
}

function reorderQuickAccess(srcPath, targetPath, isAfter) {
    const srcIndex = quickAccessItems.findIndex(item => item.path === srcPath);
    const targetIndex = quickAccessItems.findIndex(item => item.path === targetPath);
    
    if (srcIndex !== -1 && targetIndex !== -1) {
        const item = quickAccessItems.splice(srcIndex, 1)[0];
        // 移動によってインデックスがずれるのを防ぐため、再取得
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

// ---------------------------------------------------------------------------
// タブコンテキストメニューアクション
// ---------------------------------------------------------------------------
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

// ピン留めトグルをメニューに追加するための動的制御
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
                // ピン留めされたものを左に寄せ、かつ元の順序をなるべく維持
                tabs.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
                renderTabs();
                saveTabsState();
                tabContextMenu.style.display = 'none';
            };
        }
    }
});

// 以前ここにあったショートカットキーの実装は initShortcuts に集約されました

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
        if (nameCell) startRename(selected); // 修正: 引数を要素全体に変更（元々の startRename(selectedRows[0]) に合わせる）
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

// パスをコピー（Feature 2）
document.getElementById('ctx-copy-path').onclick = () => {
    if (!contextTarget) return;
    navigator.clipboard.writeText(contextTarget.path).then(() => {
        appendTerminal(`Copied path: ${contextTarget.path}`, 'command-echo');
    }).catch(() => {
        appendTerminal(`ERROR: クリップボードへのコピーに失敗しました`, 'error');
    });
};

// 右クリックから新規作成（Feature 1） - 動的に生成されるためここでは何もしない、または既存の静的要素のみ削除を検討
// (updateNewFileMenus 内でイベントを付与するように変更済み)

function showPropertiesModal(path) {
    // バックエンドに情報を要求
    window.api.sendCommand(`PROP|${path}`);
    appendTerminal(`Action: プロパティを取得中...`, 'command-echo');
}

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
    const isDir = attr & 16; // FILE_ATTRIBUTE_DIRECTORY

    document.getElementById('prop-name').value = fileName;
    
    // アイコンの設定 (IconThemeManagerを使用)
    const iconWrapper = document.getElementById('prop-icon-wrapper');
    if (iconWrapper) {
        iconWrapper.innerHTML = IconThemeManager.getIcon(fileName, isDir);
    }

    document.getElementById('prop-type').textContent = isDir ? 'フォルダ' : (fileName.split('.').pop().toUpperCase() + ' ファイル');
    document.getElementById('prop-location').textContent = path.substring(0, path.lastIndexOf('\\'));
    
    // サイズフォーマット
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 バイト';
        const k = 1024;
        const sizes = ['バイト', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i] + ' (' + bytes.toLocaleString() + ' バイト)';
    };
    document.getElementById('prop-size').textContent = formatSize(size);

    // 内容（フォルダのみ）
    const containsRow = document.getElementById('prop-contains-row');
    if (isDir) {
        containsRow.style.display = 'flex';
        document.getElementById('prop-contains').textContent = `${fileCount.toLocaleString()} ファイル、${dirCount.toLocaleString()} フォルダ`;
    } else {
        containsRow.style.display = 'none';
    }

    // 日付フォーマット
    const formatDate = (ms) => {
        const d = new Date(ms);
        return d.toLocaleString('ja-JP');
    };
    document.getElementById('prop-created').textContent = formatDate(created);
    document.getElementById('prop-modified').textContent = formatDate(modified);
    document.getElementById('prop-accessed').textContent = formatDate(accessed);

    // 属性
    document.getElementById('prop-attr-readonly').checked = attr & 1; // READONLY
    document.getElementById('prop-attr-hidden').checked = attr & 2;   // HIDDEN

    // 表示
    document.getElementById('property-modal').style.display = 'flex';
}

// モーダルを閉じる処理
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

// 初期化時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPropertyModal);
} else {
    initPropertyModal();
}



// ---------------------------------------------------------------------------
// ドラッグ＆ドロップ (D&D) 制御
// ---------------------------------------------------------------------------

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
        // 通常のツリー項目のD&D（ディレクトリ移動）は、バグ回避のため一旦無効化
        return;
    } else {
        // ファイルリスト（グリッド/詳細）からのドラッグ
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

    // ドラッグデータをセット
    e.dataTransfer.setData('application/x-file-paths', JSON.stringify(paths));
    e.dataTransfer.effectAllowed = 'move';

    // ドラッグイメージ（ゴースト）の作成
    const dragIcon = document.createElement('div');
    dragIcon.className = 'drag-ghost';
    dragIcon.style.position = 'absolute';
    dragIcon.style.top = '-1000px';
    
    // アイコンとバッジ
    const folderIcon = IconThemeManager.customIcons.folder;
    const countBadge = count > 1 ? `<span style="background: white; color: var(--accent-color); padding: 0 6px; border-radius: 12px; font-size: 11px; font-weight: 800;">${count}</span>` : '';
    dragIcon.innerHTML = `<span style="display: flex; align-items: center; gap: 8px;">${folderIcon} ${dragName}</span> ${countBadge}`;
    
    document.body.appendChild(dragIcon);
    e.dataTransfer.setDragImage(dragIcon, 0, 0);
    
    setTimeout(() => {
        if (dragIcon.parentNode) document.body.removeChild(dragIcon);
    }, 0);
    
    item.classList.add('dragging');

    // 【外部アプリへのD&D対応】
    if (window.api.send && !isQA) {
        window.api.send('ondragstart', paths);
    }
}

function handleDragEnd(e) {
    const item = e.target.closest('tr, .grid-item');
    if (item) item.classList.remove('dragging');
    
    // 全てのハイライトを消去
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // クイックアクセスの並べ替え中か判定
    const isQAMove = e.dataTransfer.types.includes('application/x-quick-access-path');
    
    if (isQAMove) {
        const target = e.target.closest('.tree-node[data-is-quick-access="true"]');
        if (target) {
            const treeItem = target.querySelector('.tree-item');
            const rect = treeItem.getBoundingClientRect();
            const isAfter = e.clientY > (rect.top + rect.height / 2);
            
            // クラスの付け替え
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

function handleDragLeave(e) {
    const target = e.target.closest('tr[data-type="D"], .grid-item[data-type="D"], .tree-node, .tree-item');
    if (target) {
        const highlightTarget = target.classList.contains('tree-node') ? target.querySelector('.tree-item') : target;
        if (highlightTarget) {
            highlightTarget.classList.remove('drag-over', 'drag-gap-top', 'drag-gap-bottom');
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.drag-over, .drag-gap-top, .drag-gap-bottom').forEach(el => {
        el.classList.remove('drag-over', 'drag-gap-top', 'drag-gap-bottom');
    });

    // クイックアクセスの並べ替え
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

    let srcPaths = [];
    const pathsJson = e.dataTransfer.getData('application/x-file-paths');
    
    if (pathsJson) {
        srcPaths = JSON.parse(pathsJson);
    } else {
        // フォールバック: dataTransfer が空の場合は現在選択中のアイテムを使用
        // (startDrag を使用すると renderer の dataTransfer がクリアされる場合があるため)
        srcPaths = getSelectedItems().map(i => i.srcPath);
    }

    if (srcPaths.length === 0) return;

    let destPath = '';
    if (target.classList.contains('tree-node')) {
        destPath = target.dataset.path;
    } else if (target.dataset.name) {
        destPath = currentPath + target.dataset.name + '\\';
    }

    if (!destPath) return;

    // ログ出力
    if (typeof appendTerminal === 'function') {
        appendTerminal(`Moving ${srcPaths.length} items to ${destPath}...`, 'command-echo');
    }

    srcPaths.forEach(srcPath => {
        const fileName = srcPath.split('\\').pop();
        const targetPath = destPath + fileName;
        
        // 自分自身の中、または同一箇所への移動を防止
        if (srcPath !== targetPath && !destPath.startsWith(srcPath + '\\')) {
            window.api.sendCommand(`MOVE|${srcPath}|${targetPath}`);
        }
    });
}

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

// 壁紙選択モードの開始・終了ヘルパー
window.isSelectingWallpaperMode = false;

window.startWallpaperSelectionMode = async () => {
    window.isSelectingWallpaperMode = true;
    
    // ボディにギャラリーモードのクラスを追加
    document.body.classList.add('wallpaper-gallery-mode');
    
    // 設定画面を非表示にする
    const settingsScreen = document.getElementById('settings-screen');
    if (settingsScreen) settingsScreen.style.display = 'none';
    
    // バナーを表示する
    const banner = document.getElementById('wallpaper-select-banner');
    if (banner) {
        banner.style.display = 'flex';
    }

    // 壁紙専用ウィンドウの場合：独自のギャラリー画面を表示し、ユーザー画像を検索する
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectWallpaper') === 'true') {
        const homeView = document.getElementById('home-view');
        const explorerView = document.getElementById('explorer-view');
        const galleryView = document.getElementById('wallpaper-gallery-view');
        
        if (homeView) homeView.style.display = 'none';
        if (explorerView) explorerView.style.display = 'none';
        if (galleryView) {
            galleryView.style.display = 'flex';
            
            // ローディングプレースホルダーを表示
            const grid = document.getElementById('wallpaper-gallery-grid');
            if (grid) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px; font-size: 13px;">画像をスキャン中...（数秒かかる場合があります）</div>';
            }
            
            try {
                // 画像スキャンの実行（バックエンド呼び出し）
                const images = await window.api.invoke('SCAN_USER_IMAGES');
                
                // すでに壁紙履歴（履歴リスト）に登録されている画像を除外
                let history = [];
                try {
                    history = await window.api.invoke('GET_WALLPAPERS');
                } catch (e) {
                    console.error('Failed to get wallpaper history for catalog exclusion:', e);
                }

                // 登録済み画像パスのセットを作成（パスの大文字小文字を揃えて比較）
                const registeredPaths = new Set(
                    history
                        .map(item => (item.originalPath || '').toLowerCase().trim())
                        .filter(p => p !== '')
                );

                // 履歴に登録されていない画像のみに絞り込む
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

window.endWallpaperSelectionMode = (restoreSettings = false) => {
    window.isSelectingWallpaperMode = false;
    
    // ボディからギャラリーモードのクラスを削除
    document.body.classList.remove('wallpaper-gallery-mode');
    
    // バナーを非表示にする
    const banner = document.getElementById('wallpaper-select-banner');
    if (banner) banner.style.display = 'none';
    
    // ギャラリービューを隠す
    const galleryView = document.getElementById('wallpaper-gallery-view');
    if (galleryView) galleryView.style.display = 'none';
    
    // 壁紙専用ウィンドウの場合はウィンドウ自体を閉じる
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('selectWallpaper') === 'true') {
        window.close();
        return;
    }

    if (restoreSettings) {
        // 設定画面を再表示し、壁紙タブを選択状態にする
        const settingsScreen = document.getElementById('settings-screen');
        if (settingsScreen) {
            settingsScreen.style.display = 'flex';
            const tabBtn = document.querySelector('.settings-tab-btn[data-tab="wallpaper"]');
            if (tabBtn) tabBtn.click();
        }
    }
};

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
        
        // ダブルクリックで壁紙に設定してクローズ
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
        
        // シングルクリック（選択ハイライト等）
        card.onclick = () => {
            document.querySelectorAll('.gallery-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        };
        
        grid.appendChild(card);
    });
}

// バナーキャンセルボタンの初期化
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

// USBドライブ等の抜き差し（デバイス変更）を検知してツリービューを自動更新
if (window.api && typeof window.api.onDeviceChange === 'function') {
    window.api.onDeviceChange(() => {
        console.log('USB/Removable drive change detected! Refreshing drives list...');
        initTree('HOME');
    });
}

// ==========================================================================
// Elite Developer Features - Git, Fuzzy Finder, Command Palette
// ==========================================================================

let currentGitStatus = { isRepo: false, branch: '', files: {} };

async function updateGitStatus(dirPath) {
    const gitIndicator = document.getElementById('git-branch-indicator');
    if (!dirPath || dirPath === 'HOME') {
        currentGitStatus = { isRepo: false, branch: '', files: {} };
        if (gitIndicator) gitIndicator.style.display = 'none';
        return;
    }
    try {
        const res = await window.api.invoke('GET_GIT_STATUS', dirPath);
        if (res && res.isRepo) {
            currentGitStatus = res;
            if (gitIndicator) {
                gitIndicator.textContent = res.branch;
                gitIndicator.style.display = 'inline-flex';
            }
            applyGitStylesToExistingElements();
        } else {
            currentGitStatus = { isRepo: false, branch: '', files: {} };
            if (gitIndicator) gitIndicator.style.display = 'none';
            // Clear styles if we left a repo
            applyGitStylesToExistingElements();
        }
    } catch (e) {
        console.error('Failed to update git status:', e);
        currentGitStatus = { isRepo: false, branch: '', files: {} };
        if (gitIndicator) gitIndicator.style.display = 'none';
    }
}

function getGitStatusForFile(fileName) {
    if (!currentGitStatus || !currentGitStatus.isRepo || !currentGitStatus.files) return null;
    const fullPath = (currentPath + fileName).toLowerCase().replace(/\\/g, '/');
    for (const key in currentGitStatus.files) {
        if (key.toLowerCase().replace(/\\/g, '/') === fullPath) {
            return currentGitStatus.files[key];
        }
    }
    return null;
}

function applyGitStylesToExistingElements() {
    const rows = document.querySelectorAll('#file-list-body tr, .grid-item');
    rows.forEach(el => {
        const name = el.dataset.name;
        if (!name) return;
        
        el.classList.remove('git-status-modified', 'git-status-untracked', 'git-status-staged');
        
        const gitStatus = getGitStatusForFile(name);
        if (gitStatus) {
            el.classList.add(`git-status-${gitStatus}`);
        }
    });
}

// ⚡ Fuzzy Finder HUD Controller
const FuzzyFinderHUD = {
    isOpen: false,
    activeIndex: -1,
    filteredItems: [],

    open(initialChar = '') {
        if (isHomeActive || this.isOpen) return;
        
        const hud = document.getElementById('fuzzy-finder-hud');
        const input = document.getElementById('fuzzy-finder-input');
        if (!hud || !input) return;

        this.isOpen = true;
        hud.style.display = 'flex';
        input.value = initialChar;
        input.focus();
        this.activeIndex = -1;
        
        this.filter();
        
        ShortcutManager.isEnabled = false;
    },

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        
        const hud = document.getElementById('fuzzy-finder-hud');
        const input = document.getElementById('fuzzy-finder-input');
        if (hud) hud.style.display = 'none';
        if (input) {
            input.value = '';
            input.blur();
        }
        
        const rows = document.querySelectorAll('#file-list-body tr, .grid-item');
        rows.forEach(r => r.style.display = '');

        ShortcutManager.isEnabled = true;
    },

    filter() {
        const input = document.getElementById('fuzzy-finder-input');
        const countSpan = document.getElementById('fuzzy-finder-count');
        const listContainer = document.getElementById('fuzzy-finder-list');
        if (!input || !listContainer) return;

        const query = input.value.toLowerCase();
        const rows = Array.from(document.querySelectorAll('#file-list-body tr, .grid-item'));
        
        this.filteredItems = [];
        listContainer.innerHTML = '';

        let total = rows.length;
        let matchCount = 0;

        rows.forEach(row => {
            const name = row.dataset.name || '';
            const nameLower = name.toLowerCase();
            
            let isMatch = true;
            let lastIdx = -1;
            for (let i = 0; i < query.length; i++) {
                const char = query[i];
                const idx = nameLower.indexOf(char, lastIdx + 1);
                if (idx === -1) {
                    isMatch = false;
                    break;
                }
                lastIdx = idx;
            }

            if (isMatch) {
                this.filteredItems.push(row);
                row.style.display = '';
                matchCount++;

                const itemEl = document.createElement('div');
                itemEl.className = 'hud-item';
                const isDir = row.dataset.type === 'D';
                const icon = IconThemeManager.getIcon(name, isDir);
                
                const gitStatus = getGitStatusForFile(name);
                const colorStyle = gitStatus ? `git-status-${gitStatus}` : '';

                itemEl.innerHTML = `
                    <div class="hud-item-label ${colorStyle}">
                        <span style="display:flex;align-items:center;">${icon}</span>
                        <span>${name}</span>
                    </div>
                `;
                
                const currentIndex = matchCount - 1;
                itemEl.onclick = () => {
                    this.activeIndex = currentIndex;
                    this.selectActive();
                    this.executeActive();
                };

                listContainer.appendChild(itemEl);
            } else {
                row.style.display = 'none';
            }
        });

        if (countSpan) {
            countSpan.textContent = `${matchCount} / ${total}`;
        }

        if (matchCount > 0) {
            this.activeIndex = 0;
            this.updateActiveHighlight();
            this.selectActive();
        } else {
            this.activeIndex = -1;
        }
    },

    updateActiveHighlight() {
        const listContainer = document.getElementById('fuzzy-finder-list');
        if (!listContainer) return;
        const items = listContainer.querySelectorAll('.hud-item');
        items.forEach((item, idx) => {
            if (idx === this.activeIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    },

    selectActive() {
        const rows = document.querySelectorAll('#file-list-body tr, .grid-item');
        rows.forEach(r => r.classList.remove('selected'));

        if (this.activeIndex >= 0 && this.activeIndex < this.filteredItems.length) {
            const targetRow = this.filteredItems[this.activeIndex];
            targetRow.classList.add('selected');
            
            const indexInMain = Array.from(rows).indexOf(targetRow);
            if (indexInMain !== -1) {
                window.selectionAnchorIndex = indexInMain;
            }
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (typeof onSelectionChanged === 'function') onSelectionChanged();
        }
    },

    executeActive() {
        if (this.activeIndex >= 0 && this.activeIndex < this.filteredItems.length) {
            const targetRow = this.filteredItems[this.activeIndex];
            this.close();
            if (targetRow.ondblclick) {
                targetRow.ondblclick();
            }
        }
    },

    handleKeyDown(e) {
        if (!this.isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            this.executeActive();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.filteredItems.length > 0) {
                this.activeIndex = (this.activeIndex + 1) % this.filteredItems.length;
                this.updateActiveHighlight();
                this.selectActive();
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.filteredItems.length > 0) {
                this.activeIndex = (this.activeIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
                this.updateActiveHighlight();
                this.selectActive();
            }
            return;
        }
    }
};

// 🎨 Command Palette Controller
const CommandPalette = {
    isOpen: false,
    activeIndex: 0,
    commands: [
        { label: 'Create New Folder', desc: 'Create a new empty directory', action: () => { if (typeof createNewItem === 'function') createNewItem('directory'); } },
        { label: 'Create New File', desc: 'Create a new empty text file', action: () => { if (typeof createNewItem === 'function') createNewItem('.txt', '新規メモ'); } },
        { label: 'Toggle Hidden Files', desc: 'Show/hide system and dotfiles', action: () => { showHiddenFiles = !showHiddenFiles; updateViewMenuUI(); window.api.sendCommand(`LIST|${currentPath}`); } },
        { label: 'Toggle File Extensions', desc: 'Show/hide file extensions', action: () => { showExtensions = !showExtensions; updateViewMenuUI(); window.api.sendCommand(`LIST|${currentPath}`); } },
        { label: 'Change View Mode: Details', desc: 'List files in detailed view', action: () => { applyViewMode('details'); } },
        { label: 'Change View Mode: Compact', desc: 'List files in compact view', action: () => { applyViewMode('compact'); } },
        { label: 'Change View Mode: Icons', desc: 'List files in medium icons view', action: () => { applyViewMode('medium'); } },
        { label: 'Sort by Name', desc: 'Sort items alphabetically', action: () => { currentSortKey = 0; updateSortMenuUI(); window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`); if (currentPath) window.api.sendCommand(`LIST|${currentPath}`); } },
        { label: 'Sort by Date', desc: 'Sort items by modified date', action: () => { currentSortKey = 1; updateSortMenuUI(); window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`); if (currentPath) window.api.sendCommand(`LIST|${currentPath}`); } },
        { label: 'Sort by Size', desc: 'Sort items by file size', action: () => { currentSortKey = 2; updateSortMenuUI(); window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`); if (currentPath) window.api.sendCommand(`LIST|${currentPath}`); } },
        { label: 'Toggle Vim Keyboard Mode', desc: 'Toggle keyboard navigation', action: () => {
            const current = localStorage.getItem('settings-vim-mode') === 'true';
            const next = !current;
            localStorage.setItem('settings-vim-mode', next);
            const toggle = document.getElementById('toggle-vim-mode');
            if (toggle) toggle.checked = next;
            const badge = document.getElementById('vim-mode-badge');
            if (badge) badge.style.display = next ? 'inline-block' : 'none';
        } },
        { label: 'Open Settings', desc: 'Configure Modern Filer settings', action: () => { document.getElementById('btn-settings')?.click(); } }
    ],
    filteredCommands: [],

    open() {
        if (this.isOpen) return;
        
        const hud = document.getElementById('command-palette');
        const input = document.getElementById('command-palette-input');
        if (!hud || !input) return;

        this.isOpen = true;
        hud.style.display = 'flex';
        input.value = '';
        input.focus();
        this.activeIndex = 0;
        
        this.filter();
        
        ShortcutManager.isEnabled = false;
    },

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        
        const hud = document.getElementById('command-palette');
        const input = document.getElementById('command-palette-input');
        if (hud) hud.style.display = 'none';
        if (input) {
            input.value = '';
            input.blur();
        }
        
        ShortcutManager.isEnabled = true;
    },

    filter() {
        const input = document.getElementById('command-palette-input');
        const listContainer = document.getElementById('command-palette-list');
        if (!input || !listContainer) return;

        const query = input.value.toLowerCase();
        listContainer.innerHTML = '';
        this.filteredCommands = [];

        this.commands.forEach(cmd => {
            if (!query || cmd.label.toLowerCase().includes(query) || cmd.desc.toLowerCase().includes(query)) {
                this.filteredCommands.push(cmd);
                
                const itemEl = document.createElement('div');
                itemEl.className = 'hud-item';
                itemEl.innerHTML = `
                    <div class="hud-item-label">
                        <span style="font-weight: 600;">${cmd.label}</span>
                        <span style="font-size: 11px; color: var(--text-muted); margin-left: 10px;">${cmd.desc}</span>
                    </div>
                `;
                
                const currentIndex = this.filteredCommands.length - 1;
                itemEl.onclick = () => {
                    this.activeIndex = currentIndex;
                    this.executeActive();
                };

                listContainer.appendChild(itemEl);
            }
        });

        this.activeIndex = Math.min(this.activeIndex, this.filteredCommands.length - 1);
        if (this.filteredCommands.length > 0) {
            if (this.activeIndex < 0) this.activeIndex = 0;
            this.updateActiveHighlight();
        } else {
            this.activeIndex = -1;
        }
    },

    updateActiveHighlight() {
        const listContainer = document.getElementById('command-palette-list');
        if (!listContainer) return;
        const items = listContainer.querySelectorAll('.hud-item');
        items.forEach((item, idx) => {
            if (idx === this.activeIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    },

    executeActive() {
        if (this.activeIndex >= 0 && this.activeIndex < this.filteredCommands.length) {
            const cmd = this.filteredCommands[this.activeIndex];
            this.close();
            cmd.action();
        }
    },

    handleKeyDown(e) {
        if (!this.isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            this.executeActive();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.filteredCommands.length > 0) {
                this.activeIndex = (this.activeIndex + 1) % this.filteredCommands.length;
                this.updateActiveHighlight();
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.filteredCommands.length > 0) {
                this.activeIndex = (this.activeIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
                this.updateActiveHighlight();
            }
            return;
        }
    }
};

// Expose to window context so shortcuts.js can access
window.FuzzyFinderHUD = FuzzyFinderHUD;
window.CommandPalette = CommandPalette;

// Initialize listeners and overlay handlers
document.addEventListener('DOMContentLoaded', () => {
    const fInput = document.getElementById('fuzzy-finder-input');
    if (fInput) {
        fInput.addEventListener('input', () => FuzzyFinderHUD.filter());
        fInput.addEventListener('keydown', (e) => FuzzyFinderHUD.handleKeyDown(e));
    }

    const cpInput = document.getElementById('command-palette-input');
    if (cpInput) {
        cpInput.addEventListener('input', () => CommandPalette.filter());
        cpInput.addEventListener('keydown', (e) => CommandPalette.handleKeyDown(e));
    }
});

// Close overlays on clicking outside
document.addEventListener('mousedown', (e) => {
    if (CommandPalette.isOpen && !e.target.closest('.hud-container')) {
        CommandPalette.close();
    }
    if (FuzzyFinderHUD.isOpen && !e.target.closest('.hud-container')) {
        FuzzyFinderHUD.close();
    }
});


// ==========================================================================
// VS Code Layout Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const terminal = document.getElementById('terminal');
    const mainContent = document.querySelector('.main-content');
    
    // Toggle Buttons
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const btnToggleTerminal = document.getElementById('btn-toggle-terminal');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const btnCloseConsole = document.getElementById('btn-close-console');
    
    if (btnToggleSidebar && sidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
        });
    }
    if (btnCloseSidebar && sidebar) {
        btnCloseSidebar.addEventListener('click', () => {
            sidebar.style.display = 'none';
        });
    }
    if (btnToggleTerminal && terminal) {
        btnToggleTerminal.addEventListener('click', () => {
            terminal.style.display = terminal.style.display === 'none' ? 'flex' : 'none';
        });
    }
    if (btnCloseConsole && terminal) {
        btnCloseConsole.addEventListener('click', () => {
            terminal.style.display = 'none';
        });
    }

    // HOME Button
    const btnSidebarHome = document.getElementById('btn-sidebar-home');
    if (btnSidebarHome) {
        btnSidebarHome.addEventListener('click', () => {
            if (typeof showHome === 'function') {
                showHome(true);
            }
        });
    }

    // Resizers
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const terminalResizer = document.getElementById('terminal-resizer');

    if (sidebarResizer && sidebar) {
        let isResizingSidebar = false;
        sidebarResizer.addEventListener('mousedown', (e) => {
            isResizingSidebar = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.body.classList.add('resizing');
        });
        window.addEventListener('mousemove', (e) => {
            if (!isResizingSidebar) return;
            const newWidth = e.clientX;
            if (newWidth >= 150 && newWidth <= 600) {
                sidebar.style.width = newWidth + 'px';
            }
        });
        window.addEventListener('mouseup', () => {
            if (isResizingSidebar) {
                isResizingSidebar = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
                document.body.classList.remove('resizing');
            }
        });
    }

    if (terminalResizer && terminal && mainContent) {
        let isResizingTerminal = false;
        terminalResizer.addEventListener('mousedown', (e) => {
            isResizingTerminal = true;
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            document.body.classList.add('resizing');
        });
        window.addEventListener('mousemove', (e) => {
            if (!isResizingTerminal) return;
            const containerHeight = document.querySelector('.main-layout').clientHeight;
            const newHeight = containerHeight - e.clientY;
            if (newHeight >= 100 && newHeight <= 800) {
                terminal.style.height = newHeight + 'px';
            }
        });
        window.addEventListener('mouseup', () => {
            if (isResizingTerminal) {
                isResizingTerminal = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
                document.body.classList.remove('resizing');
            }
        });
    }
});
