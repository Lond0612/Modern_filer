// ---------------------------------------------------------------------------
// 状態変数
// ---------------------------------------------------------------------------
let currentPath = '';
const addressInput = document.getElementById('address-input');
const fileListBody = document.getElementById('file-list-body');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');

// 履歴管理
let historyBack = [];   // 戻るスタック
let historyForward = []; // 進むスタック

// ナビゲーションボタン
const btnBack    = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnUp      = document.getElementById('btn-up');
const btnRefresh = document.getElementById('btn-refresh');
const btnNew     = document.getElementById('btn-new');
const btnCut     = document.getElementById('btn-cut');
const btnCopy    = document.getElementById('btn-copy');
const btnPaste   = document.getElementById('btn-paste');
const btnDelete  = document.getElementById('btn-delete');
const newMenu    = document.getElementById('new-menu');

// アクションボタンのイベントリスナー
btnNew.onclick = (e) => {
    e.stopPropagation();
    newMenu.classList.toggle('visible');
};

// メニュー項目のクリックイベント
document.querySelectorAll('.menu-item').forEach(item => {
    item.onclick = (e) => {
        const type = item.dataset.type;
        const label = item.querySelector('span').textContent;
        appendTerminal(`Action: Create ${label} selected (${type})`, 'command-echo');
        newMenu.classList.remove('visible');
    };
});

// メニュー以外をクリックしたら閉じる
document.addEventListener('click', (e) => {
    if (!e.target.closest('.new-btn-wrapper')) {
        newMenu.classList.remove('visible');
    }
});

btnCut.onclick = () => {
    appendTerminal('Action: Cut (Not implemented)', 'command-echo');
};

btnCopy.onclick = () => {
    appendTerminal('Action: Copy (Not implemented)', 'command-echo');
};

btnPaste.onclick = () => {
    appendTerminal('Action: Paste (Not implemented)', 'command-echo');
};

btnDelete.onclick = () => {
    appendTerminal('Action: Delete (Not implemented)', 'command-echo');
};

// ボタンの有効/無効を更新
function updateNavButtons() {
    btnBack.disabled    = historyBack.length === 0;
    btnForward.disabled = historyForward.length === 0;
    btnUp.disabled      = !currentPath || currentPath.split('\\').filter(Boolean).length <= 1;
}

// 初期化
window.onload = () => {
    // 起動時はバックエンドのREADYを待つ
};

// 戻るボタン
btnBack.onclick = () => {
    if (historyBack.length === 0) return;
    historyForward.push(currentPath);
    const prev = historyBack.pop();
    navigateTo(prev, false); // 履歴を汚さずに移動
};

// 進むボタン
btnForward.onclick = () => {
    if (historyForward.length === 0) return;
    historyBack.push(currentPath);
    const next = historyForward.shift();
    navigateTo(next, false);
};

// 上へボタン
btnUp.onclick = () => {
    if (!currentPath) return;
    // 末尾の \ を除いた状態で親を取得
    const trimmed = currentPath.endsWith('\\') ? currentPath.slice(0, -1) : currentPath;
    const parent = trimmed.substring(0, trimmed.lastIndexOf('\\') + 1);
    if (parent && parent !== currentPath) {
        loadPath(parent, true);
    }
};

// 更新ボタン
btnRefresh.onclick = () => {
    if (currentPath) {
        window.api.sendCommand(`LIST|${currentPath}`);
    }
};

// バックエンドからのレスポンス処理
window.api.onBackendResponse((obj) => {
    switch (obj.type) {
        case 'READY':
            currentPath = obj.content;
            if (!currentPath.endsWith('\\')) currentPath += '\\';
            addressInput.value = currentPath;
            updateNavButtons(); // パスが確定してから更新
            initTree(currentPath); // ツリーの初期化
            updateTreeActiveState();
            break;

        case 'START_LIST':
            fileListBody.innerHTML = '';
            break;

        case 'DATA':
            addFileRow(obj.content);
            break;

        case 'SYNC_PATH':
            let newPath = obj.content;
            if (!newPath.endsWith('\\')) newPath += '\\';
            currentPath = newPath;
            addressInput.value = currentPath;
            updateTreeActiveState(); // 同期
            break;

        case 'CMD_OUT':
            appendTerminal(obj.content);
            break;

        case 'ERROR':
            appendTerminal(`ERROR: ${obj.content}`, 'error');
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
            // ツリーデータの受信開始（特定のフォルダノードに対して）
            const node = findTreeNode(obj.content);
            if (node) {
                const childrenContainer = node.querySelector('.tree-children');
                childrenContainer.innerHTML = '';
            }
            break;

        case 'TREE_DATA':
            // フォルダ名が届くのでノードを追加
            addTreeItem(obj.content);
            break;

        case 'END_TREE':
            // 受信完了
            break;
    }
});

// ---------------------------------------------------------------------------
// 検索バー
// ---------------------------------------------------------------------------
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimer = null;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const kw = searchInput.value.trim();
    if (!kw) {
        searchResults.style.display = 'none';
        return;
    }
    // 500ms 入力が止まったら検索開始
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

// 検索バー以外をクリックしたら閉じる
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.style.display = 'none';
    }
});

function addSearchResult(data) {
    // 「検索中...」を消す
    const placeholder = searchResults.querySelector('.search-searching');
    if (placeholder) placeholder.remove();

    const parts = data.split('|');
    if (parts.length < 3) return;
    const type    = parts[0]; // D or F
    const name    = parts[1];
    const dirPath = parts.slice(2).join('|'); // パスに | が入る場合を考慮

    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
        <span>${type === 'D' ? '📁' : '📄'}</span>
        <div style="min-width:0;flex:1;">
            <div class="search-result-name">${name}</div>
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

// ユーザー操作による移動（履歴を積む）
function loadPath(path, isUserClick = false) {
    if (!path.endsWith('\\')) path += '\\';
    
    if (isUserClick && currentPath && currentPath !== path) {
        historyBack.push(currentPath);
        historyForward = []; // 新しい移動で「進む」履歴はクリア
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

// 戻る・進む専用の移動（履歴を積まない）
function navigateTo(path, addToHistory = true) {
    if (!path.endsWith('\\')) path += '\\';
    currentPath = path;
    addressInput.value = currentPath;
    updateNavButtons();
    updateTreeActiveState();
    window.api.sendCommand(`CD|${currentPath}`);
}

function addFileRow(data) {
    const parts = data.split('|');
    if (parts.length < 3) return;

    const type = parts[0];
    const name = parts[1];
    const size = parts[2];

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="file-name">${type === 'D' ? '📁' : '📄'} ${name}</td>
        <td>${type === 'D' ? 'Folder' : 'File'}</td>
        <td>${type === 'D' ? '' : formatSize(size)}</td>
    `;

    // シングルクリック：選択
    tr.onclick = () => {
        document.querySelectorAll('#file-list-body tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
    };

    // ダブルクリック：移動または開く
    tr.ondblclick = () => {
        if (type === 'D') {
            loadPath(currentPath + name + '\\', true);
        } else {
            window.api.sendCommand(`OPEN|${currentPath}${name}`);
        }
    };

    fileListBody.appendChild(tr);
}

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

// ターミナル入力
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

// アドレスバー入力
addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loadPath(addressInput.value.trim(), true);
    }
});

// ---------------------------------------------------------------------------
// ツリービュー
// ---------------------------------------------------------------------------
const treeView = document.getElementById('tree-view');
let treeLoadingPath = ''; // 現在ロード中のツリーの親パス

function initTree(rootPath) {
    treeView.innerHTML = '';
    // ルート（ドライブ）を追加
    const drive = rootPath.substring(0, 3); // "C:\"
    const rootNode = createTreeNode(drive, treeView, true);
    
    // 自動で1段目を開く
    const expander = rootNode.querySelector('.tree-expander');
    if (expander) {
        expander.click();
    }
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

    // ▶ アイコン：展開/折りたたみのみ
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

    // 項目シングルクリック：選択のみ
    item.onclick = (e) => {
        e.stopPropagation();
        // ここでは移動せず、ハイライトだけ手動で切り替える
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
    };

    // 項目ダブルクリック：ディレクトリ移動
    item.ondblclick = (e) => {
        e.stopPropagation();
        loadPath(node.dataset.path, true);
    };

    container.appendChild(node);
    return node;
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
                // 下からの距離で高さを計算
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

// 初期化時に実行
initResizers();

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
            // 親を辿って展開
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
