let currentPath = '';
const addressInput = document.getElementById('address-input');
const fileListBody = document.getElementById('file-list-body');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');

// 初期化
window.onload = () => {
    // 起動時はバックエンドのREADYを待つ
};

// 更新ボタン
const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) {
    refreshBtn.onclick = () => {
        if (currentPath) {
            console.log('Refreshing:', currentPath);
            window.api.sendCommand(`LIST|${currentPath}`);
        }
    };
}

// バックエンドからのレスポンス処理
window.api.onBackendResponse((obj) => {
    switch (obj.type) {
        case 'READY':
            currentPath = obj.content;
            if (!currentPath.endsWith('\\')) currentPath += '\\';
            addressInput.value = currentPath;
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
    }
});

function loadPath(path, isUserClick = false) {
    if (!path.endsWith('\\')) path += '\\';
    currentPath = path;
    addressInput.value = currentPath;

    if (isUserClick) {
        // GUIでのクリック時は、まずCDを送り、その後のSYNC_PATHでLISTが走る
        window.api.sendCommand(`CD|${currentPath}`);
    } else {
        // 直接入力などは即座にLISTを要求
        window.api.sendCommand(`LIST|${currentPath}`);
    }
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
