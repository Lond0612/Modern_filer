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
        <td>${size === '-' ? '-' : formatSize(size)}</td>
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
