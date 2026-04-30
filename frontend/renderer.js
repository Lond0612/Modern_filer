let currentPath = '';
const addressInput = document.getElementById('address-input');
const fileListBody = document.getElementById('file-list-body');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');

// 初期化
window.onload = () => {
    // サーバーがREADYになるのを待つか、自ら要求する
};

// バックエンドからのレスポンス処理
window.api.onBackendResponse((obj) => {
    switch (obj.type) {
        case 'READY':
            currentPath = obj.content;
            loadPath(currentPath);
            break;
            
        case 'START_LIST':
            fileListBody.innerHTML = '';
            break;
            
        case 'DATA':
            addFileRow(obj.content);
            break;
            
        case 'SYNC_PATH':
            const newPath = obj.content.endsWith('\\') ? obj.content : obj.content + '\\';
            if (newPath.toLowerCase() !== currentPath.toLowerCase()) {
                currentPath = newPath;
                addressInput.value = currentPath;
                window.api.sendCommand(`LIST|${currentPath}`);
            }
            break;
            
        case 'CMD_OUT':
            appendTerminal(obj.content);
            break;
            
        case 'ERROR':
            appendTerminal(`ERROR: ${obj.content}`, 'error');
            break;
    }
});

function loadPath(path) {
    if (!path.endsWith('\\')) path += '\\';
    currentPath = path;
    addressInput.value = currentPath;
    window.api.sendCommand(`LIST|${currentPath}`);
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
    
    tr.onclick = () => {
        if (type === 'D') {
            loadPath(currentPath + name + '\\');
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
        loadPath(addressInput.value.trim());
    }
});
