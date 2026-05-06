// ---------------------------------------------------------------------------
// 状態変数
// ---------------------------------------------------------------------------
let currentPath = '';
let pendingRename = null; // 作成直後のリネーム待ちファイル名

// クリップボード状態
let clipboard = { mode: null, items: [] };
// mode: 'copy' | 'cut'
// items: [{ name: string, srcPath: string }]

const addressInput = document.getElementById('address-input');
const fileListBody = document.getElementById('file-list-body');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');

// 履歴管理
let historyBack = [];   // 戻るスタック
let historyForward = []; // 進むスタック

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
// 設定とテーマ・アイコン管理 (ピュア独自アイコン)
// ---------------------------------------------------------------------------
let isCustomThemeEnabled = localStorage.getItem('isCustomThemeEnabled') !== 'false';

const btnSettings = document.getElementById('btn-settings');
const settingsScreen = document.getElementById('settings-screen');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggleCustomUI = document.getElementById('toggle-custom-ui');

if (toggleCustomUI) {
    toggleCustomUI.checked = isCustomThemeEnabled;
}

const IconThemeManager = {
    customIcons: {
        folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="file-icon-svg"><path fill="rgb(255, 212, 59)" d="M64 448l384 0c35.3 0 64-28.7 64-64l0-240c0-35.3-28.7-64-64-64L298.7 80c-6.9 0-13.7-2.2-19.2-6.4L241.1 44.8C230 36.5 216.5 32 202.7 32L64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64z"/></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-277.5c0-17-6.7-33.3-18.7-45.3L258.7 18.7C246.7 6.7 230.5 0 213.5 0L64 0zM325.5 176L232 176c-13.3 0-24-10.7-24-24L208 58.5 325.5 176z"/></svg>`,
        exe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M348.8 32C340.7 46.1 336 62.5 336 80l0 16-272 0 0 224 272 0 0 64-272 0c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l284.8 0zM336 432c0 17.5 4.7 33.9 12.8 48L120 480c-13.3 0-24-10.7-24-24s10.7-24 24-24l216 0zM432 32l96 0c26.5 0 48 21.5 48 48l0 352c0 26.5-21.5 48-48 48l-96 0c-26.5 0-48-21.5-48-48l0-352c0-26.5 21.5-48 48-48zm24 64c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0zm56 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>`,
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm128 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm136 72c8.5 0 16.4 4.5 20.7 11.8l80 136c4.4 7.4 4.4 16.6 .1 24.1S352.6 384 344 384l-240 0c-8.9 0-17.2-5-21.3-12.9s-3.5-17.5 1.6-24.8l56-80c4.5-6.4 11.8-10.2 19.7-10.2s15.2 3.8 19.7 10.2l17.2 24.6 46.5-79c4.3-7.3 12.2-11.8 20.7-11.8z"/></svg>`,
        archive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM80 104c0 13.3 10.7 24 24 24l16 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-16 0c-13.3 0-24 10.7-24 24zm0 80c0 13.3 10.7 24 24 24l32 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-32 0c-13.3 0-24 10.7-24 24zm64 56l-32 0c-17.7 0-32 14.3-32 32l0 48c0 26.5 21.5 48 48 48s48-21.5 48-48l0-48c0-17.7-14.3-32-32-32zm-16 64a16 16 0 1 1 0 32 16 16 0 1 1 0-32z"/></svg>`,
        media: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM80 288l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-24 35 35c3.2 3.2 7.5 5 12 5 9.4 0 17-7.6 17-17l0-94.1c0-9.4-7.6-17-17-17-4.5 0-8.8 1.8-12 5l-35 35 0-24c0-17.7-14.3-32-32-32l-96 0c-17.7 0-32 14.3-32 32z"/></svg>`,
        audio: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM221.9 267.6c-4.7 10-.3 21.9 9.7 26.6 19.2 8.9 32.4 28.3 32.4 50.8s-13.2 41.9-32.4 50.8c-10 4.7-14.4 16.6-9.7 26.6s16.6 14.4 26.6 9.7C281.2 416.8 304 383.6 304 345s-22.8-71.9-55.6-87.1c-10-4.7-21.9-.3-26.6 9.7zM104 305c-13.3 0-24 10.7-24 24l0 32c0 13.3 10.7 24 24 24l16 0 27.2 34c3 3.8 7.6 6 12.5 6l.3 0c8.8 0 16-7.2 16-16l0-128c0-8.8-7.2-16-16-16l-.3 0c-4.9 0-9.5 2.2-12.5 6l-27.2 34-16 0zM223.3 373c9.9-5.4 16.7-16 16.7-28.1s-6.7-22.7-16.7-28.1c-7.8-4.2-15.3 3.3-15.3 12.1l0 32c0 8.8 7.6 16.3 15.3 12.1z"/></svg>`,
        doc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="file-icon-svg"><path fill="rgb(241, 242, 243)" d="M208 48L96 48c-8.8 0-16 7.2-16 16l0 384c0 8.8 7.2 16 16 16l80 0 0 48-80 0c-35.3 0-64-28.7-64-64L32 64C32 28.7 60.7 0 96 0L229.5 0c17 0 33.3 6.7 45.3 18.7L397.3 141.3c12 12 18.7 28.3 18.7 45.3l0 149.5-48 0 0-128-88 0c-39.8 0-72-32.2-72-72l0-88zM348.1 160L256 67.9 256 136c0 13.3 10.7 24 24 24l68.1 0zM240 380l32 0c33.1 0 60 26.9 60 60s-26.9 60-60 60l-12 0 0 28c0 11-9 20-20 20s-20-9-20-20l0-128c0-11 9-20 20-20zm32 80c11 0 20-9 20-20s-9-20-20-20l-12 0 0 40 12 0zm96-80l32 0c28.7 0 52 23.3 52 52l0 64c0 28.7-23.3 52-52 52l-32 0c-11 0-20-9-20-20l0-128c0-11 9-20 20-20zm32 128c6.6 0 12-5.4 12-12l0-64c0-6.6-5.4-12-12-12l-12 0 0 88 12 0zm76-108c0-11 9-20 20-20l48 0c11 0 20 9 20 20s-9 20-20 20l-28 0 0 24 28 0c11 0 20 9 20 20s-9 20-20 20l-28 0 0 44c0 11-9 20-20 20s-20-9-20-20l0-128z"/></svg>`
    },
    
    getIcon(name, isDir) {
        if (isDir) return this.customIcons.folder;
        const ext = name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return this.customIcons.image;
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return this.customIcons.archive;
        if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) return this.customIcons.media;
        if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) return this.customIcons.audio;
        if (['exe', 'bat', 'cmd', 'ps1', 'sh', 'msi', 'dll'].includes(ext)) return this.customIcons.exe;
        if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext)) return this.customIcons.doc;
        return this.customIcons.file;
    }
};

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
window.onload = () => {
    // 起動時はバックエンドのREADYを待つ
};

if (btnSettings) {
    btnSettings.addEventListener('click', () => {
        if (settingsScreen) settingsScreen.style.display = 'flex';
    });
}

if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
        if (settingsScreen) settingsScreen.style.display = 'none';
    });
}

if (toggleCustomUI) {
    toggleCustomUI.addEventListener('change', (e) => {
        isCustomThemeEnabled = e.target.checked;
        localStorage.setItem('isCustomThemeEnabled', isCustomThemeEnabled);
        // テーマ変更による再描画
        if (currentPath) {
            window.api.sendCommand(`LIST|${currentPath}`);
        }
    });
}

btnNew.onclick = (e) => {
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
            defaultName = '新規メモ';
            command = 'NEW_FILE';
        }

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
    // ファイルリスト行の外をクリックしたら選択解除
    if (!e.target.closest('#file-list-body tr') && !e.target.closest('.grid-item')) {
        document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
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
    const activeItem = document.querySelector(`.sort-item[data-sort-key="${currentSortKey}"] .check-icon`);
    if (activeItem) activeItem.style.opacity = '1';

    document.querySelectorAll('.sort-order .check-icon').forEach(icon => icon.style.opacity = '0');
    const activeOrder = document.querySelector(`.sort-order[data-sort-order="${currentSortOrder}"] .check-icon`);
    if (activeOrder) activeOrder.style.opacity = '1';
}

document.querySelectorAll('.sort-item').forEach(item => {
    item.onclick = (e) => {
        currentSortKey = parseInt(item.dataset.sortKey);
        updateSortMenuUI();
        window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`);
        if (currentPath) window.api.sendCommand(`LIST|${currentPath}`);
        sortMenu.classList.remove('visible');
    };
});

document.querySelectorAll('.sort-order').forEach(item => {
    item.onclick = (e) => {
        currentSortOrder = parseInt(item.dataset.sortOrder);
        updateSortMenuUI();
        window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`);
        if (currentPath) window.api.sendCommand(`LIST|${currentPath}`);
        sortMenu.classList.remove('visible');
    };
});

// 表示メニューのイベント
function updateViewMenuUI() {
    document.querySelectorAll('.view-mode .check-icon').forEach(icon => icon.style.opacity = '0');
    const activeMode = document.querySelector(`.view-mode[data-view-mode="${currentViewMode}"] .check-icon`);
    if (activeMode) activeMode.style.opacity = '1';

    const hiddenIcon = document.querySelector(`.view-toggle[data-toggle="hidden"] .check-icon`);
    if (hiddenIcon) hiddenIcon.style.opacity = showHiddenFiles ? '1' : '0';

    const extIcon = document.querySelector(`.view-toggle[data-toggle="extension"] .check-icon`);
    if (extIcon) extIcon.style.opacity = showExtensions ? '1' : '0';
}

document.querySelectorAll('.view-mode').forEach(item => {
    item.onclick = (e) => {
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
        viewMenu.classList.remove('visible');
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
    btnBack.disabled = historyBack.length === 0;
    btnForward.disabled = historyForward.length === 0;
    btnUp.disabled = !currentPath || currentPath.split('\\').filter(Boolean).length <= 1;
}

btnBack.onclick = () => {
    if (historyBack.length === 0) return;
    historyForward.push(currentPath);
    const prev = historyBack.pop();
    navigateTo(prev, false);
};

btnForward.onclick = () => {
    if (historyForward.length === 0) return;
    historyBack.push(currentPath);
    const next = historyForward.shift();
    navigateTo(next, false);
};

btnUp.onclick = () => {
    if (!currentPath) return;
    const trimmed = currentPath.endsWith('\\') ? currentPath.slice(0, -1) : currentPath;
    const parent = trimmed.substring(0, trimmed.lastIndexOf('\\') + 1);
    if (parent && parent !== currentPath) {
        loadPath(parent, true);
    }
};

btnRefresh.onclick = () => {
    if (currentPath) {
        window.api.sendCommand(`LIST|${currentPath}`);
    }
};

function loadPath(path, isUserClick = false) {
    if (!path.endsWith('\\')) path += '\\';
    if (isUserClick && currentPath && currentPath !== path) {
        historyBack.push(currentPath);
        historyForward = [];
    }
    currentPath = path;
    addressInput.value = currentPath;
    updateNavButtons();
    updateTreeActiveState();
    if (isUserClick) {
        window.api.sendCommand(`CD|${currentPath}`);
    } else {
        window.api.sendCommand(`LIST|${currentPath}`);
    }
}

function navigateTo(path) {
    if (!path.endsWith('\\')) path += '\\';
    currentPath = path;
    addressInput.value = currentPath;
    updateNavButtons();
    updateTreeActiveState();
    window.api.sendCommand(`CD|${currentPath}`);
}

// ---------------------------------------------------------------------------
// バックエンド通信
// ---------------------------------------------------------------------------
window.api.onBackendResponse((obj) => {
    switch (obj.type) {
        case 'READY':
            currentPath = obj.content;
            if (!currentPath.endsWith('\\')) currentPath += '\\';
            addressInput.value = currentPath;
            updateNavButtons();
            initTree(currentPath);
            updateTreeActiveState();
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
        tr.innerHTML = `
            <td class="file-name" title="${name}"><span style="margin-right: 6px;">${customIcon}</span> ${displayName}</td>
            <td>${dateStr}</td>
            <td>${isDir ? '' : formatSize(size)}</td>
            <td class="filler-col"></td>
        `;
        fileListBody.appendChild(tr);
        element = tr;
    } else {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.dataset.name = name;
        div.dataset.fullname = name;
        div.dataset.type = type;
        
        let iconHtml = '';
        if (isImageExtension(name)) {
            const fileUri = encodeURI(`file:///${currentPath}${name}`.replace(/\\/g, '/')).replace(/#/g, '%23');
            iconHtml = `<img src="${fileUri}" loading="lazy" alt="${name}" onerror="this.outerHTML='<div class=\\'grid-icon-placeholder\\'>${customIcon}</div>'">`;
        } else {
            iconHtml = `<div class="grid-icon-placeholder">${customIcon}</div>`;
        }
        
        div.innerHTML = `
            <div class="grid-icon">${iconHtml}</div>
            <div class="grid-name file-name" title="${name}">${displayName}</div>
        `;
        fileGrid.appendChild(div);
        element = div;
    }

    element.onclick = (e) => {
        if (e.ctrlKey) {
            element.classList.toggle('selected');
        } else {
            document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(r => r.classList.remove('selected'));
            element.classList.add('selected');
        }
    };

    element.ondblclick = () => {
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

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = oldName;

    const typeIcon = isDir ? '📁 ' : '📄 ';
    nameCell.innerHTML = '';
    if (el.tagName === 'TR') {
        nameCell.innerHTML = typeIcon;
    }
    
    nameCell.appendChild(input);
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

        // キャンセルまたは空入力
        if (cancel || !newName) {
            const displayName = isDir ? oldName : getFileNameWithoutExtension(oldName);
            nameCell.textContent = el.tagName === 'TR' ? `${typeIcon}${displayName}` : displayName;
            return;
        }

        // 「その他ファイル」（初期名：新規メモ）の拡張子補完
        // 入力名にドットが含まれていない場合、.txt を付与する
        if (!isDir && !newName.includes('.') && oldName.startsWith('新規メモ')) {
            newName += '.txt';
        }

        // リネーム後の名前が既存ファイルと衝突しないかチェック
        newName = resolveNameConflict(newName, oldName);

        // 変更がない場合は何もしない
        if (newName === oldName) {
            const displayName = isDir ? oldName : getFileNameWithoutExtension(oldName);
            nameCell.textContent = el.tagName === 'TR' ? `${typeIcon}${displayName}` : displayName;
            return;
        }

        window.api.sendCommand(`RENAME|${currentPath}${oldName}|${currentPath}${newName}`);
        const displayName = isDir ? newName : getFileNameWithoutExtension(newName);
        nameCell.textContent = el.tagName === 'TR' ? `${typeIcon}${displayName}` : displayName;
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

function initTree(rootPath) {
    treeView.innerHTML = '';
    const drive = rootPath.substring(0, 3);
    const rootNode = createTreeNode(drive, treeView, true);
    const expander = rootNode.querySelector('.tree-expander');
    if (expander) expander.click();
}

function createTreeNode(fullPath, container, isRoot = false) {
    const name = isRoot ? fullPath : fullPath.split('\\').filter(Boolean).pop();
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.dataset.path = fullPath.endsWith('\\') ? fullPath : fullPath + '\\';

    const item = document.createElement('div');
    item.className = 'tree-item';
    const expander = document.createElement('span');
    expander.className = 'tree-expander';
    expander.innerHTML = '▶';
    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = IconThemeManager.customIcons.folder;
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = name;

    item.appendChild(expander);
    item.appendChild(icon);
    item.appendChild(label);
    node.appendChild(item);

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
        e.stopPropagation();
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
    };

    item.ondblclick = (e) => {
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
    return treeView.querySelector(`.tree-node[data-path="${p.replace(/\\/g, '\\\\')}"]`);
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

    function setupResizer(resizer, targetElem, axis) {
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
                const newWidth = e.clientX - targetRect.left;
                if (newWidth > 100 && newWidth < 600) {
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

    setupResizer(resizerSidebar, sidebar, 'h');
    setupResizer(resizerTerminal, terminalPane, 'v');
}

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
