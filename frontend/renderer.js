// UI Elements
const addressInput = document.getElementById('address-input');
const fileListBody = document.getElementById('file-list-body');
const drivesList = document.getElementById('drives-list');
const terminalOutput = document.getElementById('terminal-output');
const terminalInput = document.getElementById('terminal-input');
const contextMenu = document.getElementById('context-menu');
const btnBack = document.getElementById('btn-back');
const btnRefresh = document.getElementById('btn-refresh');

let currentPath = "C:\\";
let currentFiles = [];
let selectedPath = null;
let clipboardPath = null; // Path to cut/copy
let clipboardAction = null; // 'CUT' or 'COPY'
let pathHistory = ["C:\\"];
let historyIndex = 0;

// Icons
const folderIcon = `<svg class="icon-folder" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
const fileIcon = `<svg class="icon-file" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

// Initialize
window.onload = () => {
    window.api.sendCommand('DRIVES');
    loadPath(currentPath, true);
};

// Navigation
function loadPath(path, pushHistory = false) {
    if (!path.endsWith('\\')) path += '\\';
    currentPath = path;
    addressInput.value = currentPath;
    currentFiles = [];
    fileListBody.innerHTML = ''; // Clear current list
    window.api.sendCommand(`LIST|${currentPath}`);
    
    if (pushHistory) {
        if (historyIndex < pathHistory.length - 1) {
            pathHistory = pathHistory.slice(0, historyIndex + 1);
        }
        if (pathHistory[historyIndex] !== currentPath) {
            pathHistory.push(currentPath);
            historyIndex = pathHistory.length - 1;
        }
    }
}

addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loadPath(addressInput.value, true);
    }
});

btnBack.addEventListener('click', () => {
    if (historyIndex > 0) {
        historyIndex--;
        loadPath(pathHistory[historyIndex], false);
    }
});

btnRefresh.addEventListener('click', () => {
    loadPath(currentPath, false);
});

// Terminal
terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const cmd = terminalInput.value;
        if (cmd.trim() !== '') {
            appendTerminal(`> ${cmd}`, '#60a5fa');
            window.api.sendCommand(`EXEC|${cmd}`);
            terminalInput.value = '';
        }
    }
});

document.getElementById('btn-clear-term').addEventListener('click', () => {
    terminalOutput.innerHTML = '<div>Welcome to the integrated terminal.</div>';
});

function appendTerminal(text, color = '#cbd5e1') {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = color;
    terminalOutput.appendChild(div);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// Format size
function formatSize(bytesStr) {
    if (bytesStr === '-') return '';
    let bytes = parseInt(bytesStr);
    if (isNaN(bytes)) return '';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

// Backend Response Handler
window.api.onBackendResponse((data) => {
    if (data.type === 'START_LIST') {
        currentFiles = [];
        fileListBody.innerHTML = '';
    } else if (data.type === 'DATA') {
        if (data.line.match(/^[A-Z]:\\$/)) {
            // Drive data
            const li = document.createElement('li');
            li.textContent = `Drive ${data.line}`;
            li.addEventListener('click', () => loadPath(data.line, true));
            drivesList.appendChild(li);
        } else {
            // File data: F|name|size or D|name|-
            const parts = data.line.split('|');
            if (parts.length >= 3) {
                const type = parts[0];
                const name = parts[1];
                const size = parts[2];
                currentFiles.push({ type, name, size });
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${type === 'D' ? folderIcon : fileIcon} <span>${name}</span></td>
                    <td>${type === 'D' ? 'Folder' : 'File'}</td>
                    <td>${formatSize(size)}</td>
                `;
                
                tr.addEventListener('click', (e) => {
                    document.querySelectorAll('.file-table tr').forEach(r => r.classList.remove('selected'));
                    tr.classList.add('selected');
                    selectedPath = currentPath + name + (type === 'D' ? '\\' : '');
                });

                tr.addEventListener('dblclick', () => {
                    if (type === 'D') {
                        loadPath(currentPath + name + '\\', true);
                    } else {
                        const fullPath = currentPath + name;
                        window.api.sendCommand(`OPEN|${fullPath}`);
                    }
                });
                
                // Context Menu on Right Click
                tr.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    document.querySelectorAll('.file-table tr').forEach(r => r.classList.remove('selected'));
                    tr.classList.add('selected');
                    selectedPath = currentPath + name + (type === 'D' ? '\\' : '');
                    
                    contextMenu.style.left = e.pageX + 'px';
                    contextMenu.style.top = e.pageY + 'px';
                    contextMenu.style.display = 'block';
                });

                fileListBody.appendChild(tr);
            }
        }
    } else if (data.type === 'CMD_OUT') {
        appendTerminal(data.line);
    } else if (data.type === 'MOVE_OK' || data.type === 'DELETE_OK' || data.type === 'OPEN_OK') {
        if (data.type !== 'OPEN_OK') {
            loadPath(currentPath, false); // Refresh list
        }
        if (data.type === 'MOVE_OK') clipboardPath = null;
    } else if (data.type === 'SYNC_PATH') {
        let newPath = data.path;
        if (!newPath.endsWith('\\')) newPath += '\\';
        
        // Use loose comparison or normalization if needed
        if (newPath.toLowerCase() === currentPath.toLowerCase()) {
            loadPath(currentPath, false); // Refresh
        } else {
            loadPath(newPath, true); // Navigate
        }
    } else if (data.type.startsWith('ERROR')) {
        appendTerminal(data.line, '#f87171');
    }
});

// Hide context menu on click anywhere
document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
});

// Quick Access clicks
document.getElementById('quick-access-list').addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        loadPath(e.target.dataset.path, true);
    }
});

// Context Menu Actions
document.getElementById('menu-pin').addEventListener('click', () => {
    if (selectedPath) {
        const name = selectedPath.split('\\').filter(Boolean).pop() || selectedPath;
        const li = document.createElement('li');
        li.textContent = name;
        li.dataset.path = selectedPath;
        document.getElementById('quick-access-list').appendChild(li);
    }
});

document.getElementById('menu-open').addEventListener('click', () => {
    if (selectedPath) {
        if (selectedPath.endsWith('\\')) {
            loadPath(selectedPath, true);
        } else {
            window.api.sendCommand(`OPEN|${selectedPath}`);
        }
    }
});

document.getElementById('menu-cut').addEventListener('click', () => {
    if (selectedPath) {
        clipboardPath = selectedPath;
        clipboardAction = 'CUT';
        appendTerminal(`Cut: ${selectedPath}`);
    }
});

document.getElementById('menu-paste').addEventListener('click', () => {
    if (clipboardPath && clipboardAction === 'CUT') {
        const name = clipboardPath.split('\\').filter(Boolean).pop();
        const destPath = currentPath + name;
        window.api.sendCommand(`MOVE|${clipboardPath}|${destPath}`);
        appendTerminal(`Moving ${clipboardPath} to ${destPath}...`);
    }
});

document.getElementById('menu-delete').addEventListener('click', () => {
    if (selectedPath) {
        if (confirm(`Are you sure you want to delete ${selectedPath}?`)) {
            window.api.sendCommand(`DELETE|${selectedPath}`);
        }
    }
});
