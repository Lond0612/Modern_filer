const fs = require('fs');
const path = require('path');

const rendererPath = path.join(__dirname, '..', 'frontend', 'renderer.js');
let content = fs.readFileSync(rendererPath, 'utf8');

// 1. Remove Git features
content = content.replace(/function updateGitBranch\([\s\S]*?\n\}/g, '');
content = content.replace(/updateGitBranch\([^)]*\);/g, '');
content = content.replace(/const branchIndicator = document\.getElementById\('git-branch-indicator'\);[\s\S]*?\}\s*\}/g, '');

// 2. Add UI logic
const uiLogic = `

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
`;

fs.writeFileSync(rendererPath, content + uiLogic, 'utf8');
console.log('renderer.js patched!');
