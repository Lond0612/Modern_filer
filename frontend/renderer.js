// ---------------------------------------------------------------------------
// 状態変数・タブ管理
// ---------------------------------------------------------------------------

class Tab {
    constructor(id, path = 'HOME') {
        this.id = id;
        this.path = path;
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

let recentFolders = JSON.parse(localStorage.getItem('recentFolders') || '[]');
let pendingRename = null; // 作成直後のリネーム待ちファイル名

// クリップボード状態
let clipboard = { mode: null, items: [] };
// mode: 'copy' | 'cut'
// items: [{ name: string, srcPath: string }]

// クイックアクセス
let quickAccessItems = JSON.parse(localStorage.getItem('quickAccessItems') || '[]').map(item => {
    if (item.path && !item.path.endsWith('\\')) item.path += '\\';
    return item;
});

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
};

function initTabs() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialPath = urlParams.get('path') || 'HOME';
    addTab(initialPath);
}

function addTab(path = 'HOME') {
    const id = Date.now().toString();
    const newTab = new Tab(id, path);
    tabs.push(newTab);
    switchTab(id);
    renderTabs();
}

function switchTab(id) {
    const prevTab = getActiveTab();
    if (prevTab) {
        // 現在の表示状態を保存（必要に応じて）
        prevTab.scrollPosition = explorerView.scrollTop;
    }

    activeTabId = id;
    const tab = getActiveTab();

    // UIの同期
    if (tab.isHomeActive || tab.path === 'HOME') {
        showHomeUI();
    } else {
        showExplorerUI(tab.path);
    }
    
    addressInput.value = tab.path;
    updateNavButtons();
    renderTabs();

    // ターミナルの同期（カレントディレクトリの移動）
    if (tab.path && tab.path !== 'HOME') {
        window.api.sendCommand(`CD|${tab.path}`);
    }
}

function closeTab(id, e) {
    if (e) e.stopPropagation();
    if (tabs.length <= 1) return; // 最後のタブは閉じない

    const index = tabs.findIndex(t => t.id === id);
    const isActive = activeTabId === id;
    
    tabs.splice(index, 1);
    
    if (isActive) {
        const nextTab = tabs[Math.min(index, tabs.length - 1)];
        switchTab(nextTab.id);
    } else {
        renderTabs();
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
        tabEl.className = `tab-item${tab.id === activeTabId ? ' active' : ''}${tab.id === draggedTabId ? ' dragging' : ''}`;
        tabEl.draggable = false; // カスタムドラッグのため無効化
        tabEl.dataset.id = tab.id;
        
        tabEl.innerHTML = `
            <span class="tab-title">${tab.title}</span>
            <span class="tab-close" onclick="closeTab('${tab.id}', event)">&times;</span>
        `;
        
        tabEl.onclick = () => {
            if (!tabDragOffsetX) switchTab(tab.id);
        };
        
        tabEl.onmousedown = (e) => handleTabMouseDown(e, tab.id);
        
        tabBar.appendChild(tabEl);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'tab-add-btn';
    addBtn.innerHTML = '+';
    addBtn.onclick = () => addTab('HOME');
    tabBar.appendChild(addBtn);

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
    if (e.button !== 0) return; // 左クリックのみ
    if (e.target.closest('.tab-close')) return; // 閉じるボタンは除外

    e.preventDefault(); // テキスト選択などを防止
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
            // 現在のドラッグ中タブの位置を更新
            tabEl.style.transition = 'none';
            tabEl.style.transform = `translateX(${tabDragOffsetX}px)`;
            tabEl.style.zIndex = '100';
            tabEl.classList.add('dragging');

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
                    // オフセットを調整（新しい位置基準にするため）
                    tabDragStartX += otherRect.width + 4; // 4はgap分
                    tabDragOffsetX = tabDragCurrentX - tabDragStartX;
                    renderTabs();
                    break;
                } else if (srcIndex > otherIndex && draggedMid < otherMid) {
                    // 左方向への入れ替え
                    const item = tabs.splice(srcIndex, 1)[0];
                    tabs.splice(otherIndex, 0, item);
                    // オフセットを調整
                    tabDragStartX -= otherRect.width + 4;
                    tabDragOffsetX = tabDragCurrentX - tabDragStartX;
                    renderTabs();
                    break;
                }
            }
        }
    };

    const onMouseUp = () => {
        if (draggedTabId) {
            const id = draggedTabId;
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

// メニュー項目のクリックイベント
document.querySelectorAll('#new-menu .menu-item').forEach(item => {
    item.onclick = (e) => {
        const type = item.dataset.type;
        let defaultName = '';
        let command = '';

        if (type === 'directory') {
            defaultName = '新しいフォルダ';
            command = 'MKDIR';
        } else if (type === 'text') {
            defaultName = '新規メモ.txt';
            command = 'NEW_FILE';
        } else if (type === 'other') {
            defaultName = '新規メモ.txt';
            command = 'NEW_FILE';
        }

        // 名前被りを事前にチェックして回避
        defaultName = resolveNameConflict(defaultName);

        pendingRename = defaultName;
        window.api.sendCommand(`${command}|${currentPath}${defaultName}`);
        newMenu.classList.remove('visible');
    };
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

// 表示メニューのイベント（ツールバー + コンテキストメニュー内のすべての .view-mode を対象）
function updateViewMenuUI() {
    document.querySelectorAll('.view-mode .check-icon').forEach(icon => icon.style.opacity = '0');
    document.querySelectorAll(`.view-mode[data-view-mode="${currentViewMode}"] .check-icon`).forEach(icon => {
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
        currentViewMode = item.dataset.viewMode;
        if (currentViewMode === 'compact') {
            document.body.classList.add('compact-mode');
        } else {
            document.body.classList.remove('compact-mode');
        }
        
        if (currentViewMode === 'details' || currentViewMode === 'compact') {
            fileTable.style.display = '';
            fileGrid.style.display = 'none';
        } else {
            fileTable.style.display = 'none';
            fileGrid.style.display = 'grid';
            fileGrid.className = `grid-size-${currentViewMode}`;
        }
        
        updateViewMenuUI();
        window.api.sendCommand(`LIST|${currentPath}`); // Reload
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
    const next = tab.historyForward.shift();
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
        const next = tab.historyForward.shift();
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
    if (currentPath === 'HOME') {
        renderHomeContent();
    } else if (currentPath) {
        window.api.sendCommand(`LIST|${currentPath}`);
    }
};

function loadPath(path, isUserClick = false) {
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
            currentPath = obj.content;
            if (!currentPath.endsWith('\\')) currentPath += '\\';
            initTree(currentPath);
            
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('path')) {
                isHomeActive = false;
                homeView.style.display = 'none';
                explorerView.style.display = 'block';
                btnSidebarHome.classList.remove('active');
                addressInput.value = currentPath;
                updateNavButtons();
            } else {
                showHome();
            }
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
            <td class="file-name" title="${name}"><span class="cell-content"><span style="margin-right: 6px;">${customIcon}</span> ${displayName}</span></td>
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
            if (e.ctrlKey) {
                tr.classList.toggle('selected');
            } else {
                document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
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
            if (e.ctrlKey) {
                div.classList.toggle('selected');
            } else {
                document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
                div.classList.add('selected');
            }
            onSelectionChanged();
        };

        fileGrid.appendChild(div);
        element = div;
    }

    // (個別要素の onclick/onmousedown は作成時に登録済み)

    element.ondblclick = () => {
        if (isNavigationLocked()) return;
        if (type === 'D') {
            loadPath(currentPath + name + '\\', true);
        } else {
            window.api.sendCommand(`OPEN|${currentPath}${name}`);
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
                nameCell.innerHTML = `<span class="cell-content"><span style="margin-right: 6px;">${currentIcon}</span> ${displayName}</span>`;
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
        }
        searchResults.style.display = 'none';
        searchInput.value = '';
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

// グローバルキーイベント
window.addEventListener('keydown', (e) => {
    // 入力エリアにフォーカスがある場合は無視
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
    }

    if (e.code === 'Space') {
        e.preventDefault();
        if (typeof PreviewManager !== 'undefined') {
            PreviewManager.toggle();
        }
    }

    // 上下キーでの選択移動
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        navigateSelection(e.code === 'ArrowDown' ? 1 : -1);
    }
});

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
        currentTh.style.width = `${startWidth + dx}px`;
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
    ['ctx-open', 'ctx-open-new-window', 'ctx-cut', 'ctx-copy', 'ctx-rename', 'ctx-delete', 'ctx-quick-access', 'ctx-favorite', 'ctx-properties', 'ctx-copy-path'].forEach(id => {
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
        // 新しいウィンドウで開くも無効
        const newWinItem = document.getElementById('ctx-open-new-window');
        if (newWinItem) newWinItem.classList.add('disabled');
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
        }
    }
};

document.getElementById('ctx-open-new-window').onclick = () => {
    if (contextTarget && contextTarget.isDir) {
        window.api.invoke('OPEN_NEW_WINDOW', contextTarget.path);
    }
};

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

// 右クリックから新規作成（Feature 1）
const btnCtxNewDir = document.getElementById('ctx-new-dir');
if (btnCtxNewDir) {
    btnCtxNewDir.onclick = (e) => {
        e.stopPropagation();
        if (!currentPath) return;
        let defaultName = resolveNameConflict('新しいフォルダ');
        pendingRename = defaultName;
        window.api.sendCommand(`MKDIR|${currentPath}${defaultName}`);
        contextMenu.style.display = 'none';
    };
}

const btnCtxNewFile = document.getElementById('ctx-new-file');
if (btnCtxNewFile) {
    btnCtxNewFile.onclick = (e) => {
        e.stopPropagation();
        if (!currentPath) return;
        let defaultName = resolveNameConflict('新規メモ.txt');
        pendingRename = defaultName;
        window.api.sendCommand(`NEW_FILE|${currentPath}${defaultName}`);
        contextMenu.style.display = 'none';
    };
}

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
