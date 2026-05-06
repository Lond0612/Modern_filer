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
// 初期化
// ---------------------------------------------------------------------------
window.onload = () => {
    // 起動時はバックエンドのREADYを待つ
};

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
        sortMenu.classList.remove('visible');
    };
});

document.querySelectorAll('.sort-order').forEach(item => {
    item.onclick = (e) => {
        currentSortOrder = parseInt(item.dataset.sortOrder);
        updateSortMenuUI();
        window.api.sendCommand(`SORT|${currentSortKey}|${currentSortOrder}`);
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

function addFileRow(data) {
    const parts = data.split('|');
    if (parts.length < 4) return;

    const type = parts[0];
    const name = parts[1];
    const size = parts[2];
    const isHidden = parts[3] === '1';

    if (!showHiddenFiles && isHidden) return;

    const displayName = type === 'D' ? name : getFileNameWithoutExtension(name);

    let element;

    if (currentViewMode === 'details' || currentViewMode === 'compact') {
        const tr = document.createElement('tr');
        tr.dataset.name = name;
        tr.dataset.fullname = name;
        tr.dataset.type = type;
        tr.innerHTML = `
            <td class="file-name" title="${name}">${type === 'D' ? '📁' : '📄'} ${displayName}</td>
            <td>${type === 'D' ? 'Folder' : 'File'}</td>
            <td>${type === 'D' ? '' : formatSize(size)}</td>
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
        if (type === 'D') {
            iconHtml = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        } else if (isImageExtension(name)) {
            const fileUri = encodeURI(`file:///${currentPath}${name}`.replace(/\\/g, '/')).replace(/#/g, '%23');
            iconHtml = `<img src="${fileUri}" loading="lazy" alt="${name}" onerror="this.outerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'currentColor\\'><path d=\\'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z\\'></path><polyline points=\\'13 2 13 9 20 9\\'></polyline></svg>'">`;
        } else {
            iconHtml = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
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
    icon.innerHTML = '📁';
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
