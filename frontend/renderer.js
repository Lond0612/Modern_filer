// ---------------------------------------------------------------------------
// 状態変数
// ---------------------------------------------------------------------------
let currentPath = '';
let isHomeActive = true;
let recentFolders = JSON.parse(localStorage.getItem('recentFolders') || '[]');
let pendingRename = null; // 作成直後のリネーム待ちファイル名

// クリップボード状態
let clipboard = { mode: null, items: [] };
// mode: 'copy' | 'cut'
// items: [{ name: string, srcPath: string }]

const addressInput = document.getElementById('address-input');
const btnSidebarHome = document.getElementById('btn-sidebar-home');
const homeView = document.getElementById('home-view');
const explorerView = document.getElementById('explorer-view');
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
// 設定とテーマ管理
// ---------------------------------------------------------------------------
let isDarkMode = localStorage.getItem('isDarkMode') !== 'false';

const btnSettings = document.getElementById('btn-settings');
const settingsScreen = document.getElementById('settings-screen');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggleDarkMode = document.getElementById('toggle-dark-mode');

function applyTheme() {
    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
    if (toggleDarkMode) toggleDarkMode.checked = isDarkMode;
}

// 初期化時にテーマを適用
applyTheme();

if (toggleDarkMode) {
    toggleDarkMode.onchange = () => {
        isDarkMode = toggleDarkMode.checked;
        localStorage.setItem('isDarkMode', isDarkMode);
        applyTheme();
        // テーマ変更による再描画
        if (isHomeActive) {
            renderHomeContent();
        } else if (currentPath) {
            window.api.sendCommand(`LIST|${currentPath}`);
        }
    };
}

const IconThemeManager = {
    customIcons: {
        folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="file-icon-svg"><path fill="var(--icon-folder)" d="M64 448l384 0c35.3 0 64-28.7 64-64l0-240c0-35.3-28.7-64-64-64L298.7 80c-6.9 0-13.7-2.2-19.2-6.4L241.1 44.8C230 36.5 216.5 32 202.7 32L64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64z"/></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M176 48L64 48c-8.8 0-16 7.2-16 16l0 384c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-240-88 0c-39.8 0-72-32.2-72-72l0-88zM316.1 160L224 67.9 224 136c0 13.3 10.7 24 24 24l68.1 0zM0 64C0 28.7 28.7 0 64 0L197.5 0c17 0 33.3 6.7 45.3 18.7L365.3 141.3c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64z"/></svg>`,
        exe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M348.8 32C340.7 46.1 336 62.5 336 80l0 16-272 0 0 224 272 0 0 64-272 0c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l284.8 0zM336 432c0 17.5 4.7 33.9 12.8 48L120 480c-13.3 0-24-10.7-24-24s10.7-24 24-24l216 0zM432 32l96 0c26.5 0 48 21.5 48 48l0 352c0 26.5-21.5 48-48 48l-96 0c-26.5 0-48-21.5-48-48l0-352c0-26.5 21.5-48 48-48zm24 64c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l48 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0zm56 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>`,
        image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm128 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm136 72c8.5 0 16.4 4.5 20.7 11.8l80 136c4.4 7.4 4.4 16.6 .1 24.1S352.6 384 344 384l-240 0c-8.9 0-17.2-5-21.3-12.9s-3.5-17.5 1.6-24.8l56-80c4.5-6.4 11.8-10.2 19.7-10.2s15.2 3.8 19.7 10.2l17.2 24.6 46.5-79c4.3-7.3 12.2-11.8 20.7-11.8z"/></svg>`,
        archive: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM80 104c0 13.3 10.7 24 24 24l16 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-16 0c-13.3 0-24 10.7-24 24zm0 80c0 13.3 10.7 24 24 24l32 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-32 0c-13.3 0-24 10.7-24 24zm64 56l-32 0c-17.7 0-32 14.3-32 32l0 48c0 26.5 21.5 48 48 48s48-21.5 48-48l0-48c0-17.7-14.3-32-32-32zm-16 64a16 16 0 1 1 0 32 16 16 0 1 1 0-32z"/></svg>`,
        media: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM80 288l0 96c0 17.7 14.3 32 32 32l96 0c17.7 0 32-14.3 32-32l0-24 35 35c3.2 3.2 7.5 5 12 5 9.4 0 17-7.6 17-17l0-94.1c0-9.4-7.6-17-17-17-4.5 0-8.8 1.8-12 5l-35 35 0-24c0-17.7-14.3-32-32-32l-96 0c-17.7 0-32 14.3-32 32z"/></svg>`,
        audio: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM221.9 267.6c-4.7 10-.3 21.9 9.7 26.6 19.2 8.9 32.4 28.3 32.4 50.8s-13.2 41.9-32.4 50.8c-10 4.7-14.4 16.6-9.7 26.6s16.6 14.4 26.6 9.7C281.2 416.8 304 383.6 304 345s-22.8-71.9-55.6-87.1c-10-4.7-21.9-.3-26.6 9.7zM104 305c-13.3 0-24 10.7-24 24l0 32c0 13.3 10.7 24 24 24l16 0 27.2 34c3 3.8 7.6 6 12.5 6l.3 0c8.8 0 16-7.2 16-16l0-128c0-8.8-7.2-16-16-16l-.3 0c-4.9 0-9.5 2.2-12.5 6l-27.2 34-16 0zM223.3 373c9.9-5.4 16.7-16 16.7-28.1s-6.7-22.7-16.7-28.1c-7.8-4.2-15.3 3.3-15.3 12.1l0 32c0 8.8 7.6 16.3 15.3 12.1z"/></svg>`,
        doc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zm56 256c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0z"/></svg>`,
        html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M0 32L34.9 427.8 191.5 480 349.1 427.8 384 32 0 32zM308.2 159.9l-183.8 0 4.1 49.4 175.6 0-13.6 148.4-97.9 27 0 .3-1.1 0-98.7-27.3-6-75.8 47.7 0 3.5 38.1 53.5 14.5 53.7-14.5 6-62.2-166.9 0-12.8-145.6 241.1 0-4.4 47.7z"/></svg>`,
        css: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M376.3 32L0 32 0 408.3c0 19 7.6 37.2 21 50.7s31.7 21 50.7 21l304.6 0c19 0 37.2-7.6 50.7-21s21-31.7 21-50.7l0-304.6c0-19-7.6-37.2-21-50.7s-31.7-21-50.7-21zM332.4 431.4c-7.7-8.5-11.7-20.7-12-36.6l31.3 0c.2 14.1 5.1 21.1 14.8 21.1c4.9 0 8.4-1.6 10.5-4.7c2-3.1 3-8 3-14.8c0-5.4-1.3-9.9-4-13.4c-3.5-4.2-8.1-7.5-13.2-9.5L351.2 368c-10.3-4.9-17.8-10.8-22.5-17.6c-4.5-6.8-6.7-16.3-6.7-28.4c0-13.6 4-24.6 11.8-33.1c8.1-8.5 19.1-12.7 33.2-12.7c13.6 0 24.1 4.2 31.5 12.5c7.5 8.4 11.5 20.3 11.8 35.9l-30.1 0c.2-5.1-.9-10.2-3-14.8c-1.7-3.4-5-5.1-10-5.1c-8.8 0-13.2 5.2-13.2 15.7c0 5.3 1.1 9.4 3.2 12.6c3.1 3.5 7 6.2 11.4 7.8l11.1 4.9c11.5 5.3 19.7 11.7 24.8 19.4c5.1 7.7 7.6 18 7.6 31c0 15.5-4 27.4-12.3 35.7c-8.2 8.3-19.5 12.5-34.1 12.5s-25.6-4.2-33.4-12.7zm-101 0c-7.7-8.5-11.7-20.7-12-36.6l31.3 0c.2 14.1 5.1 21.1 14.8 21.1c4.9 0 8.4-1.6 10.4-4.7c2-3.1 3-8 3-14.8c0-5.4-1.3-9.9-3.9-13.4c-3.5-4.2-8.1-7.5-13.2-9.5L250.2 368c-10.3-4.9-17.8-10.8-22.5-17.6c-4.5-6.8-6.7-16.3-6.7-28.4c0-13.6 4-24.6 11.8-33.1c8.1-8.5 19.1-12.7 33.2-12.7c13.6 0 24.1 4.2 31.4 12.5c7.6 8.4 11.5 20.3 11.9 35.9l-30.1 0c.2-5.1-.9-10.2-3-14.8c-1.7-3.4-5-5.1-10-5.1c-8.8 0-13.2 5.2-13.2 15.7c0 5.3 1.1 9.4 3.2 12.6c3.1 3.5 7 6.2 11.4 7.8l11.1 4.9c11.5 5.3 19.7 11.7 24.8 19.4c5.1 7.7 7.6 18 7.6 31c0 15.5-4.1 27.4-12.3 35.7s-19.5 12.5-34.1 12.5s-25.6-4.2-33.4-12.7zm-105.6 1.1c-8.4-7.7-12.5-19.2-12.5-34.5l0-75.4c0-15.2 4.4-26.7 13.2-34.6c8.9-7.8 20.7-11.8 35.2-11.8c14.1 0 25.2 4 33.4 12c8.3 8 12.5 20 12.5 35.9l0 6-33.1 0 0-5.8c0-6.1-1.3-10.7-4-13.6c-1.1-1.5-2.6-2.7-4.3-3.5s-3.5-1.2-5.4-1.1c-5.4 0-9.2 1.8-11.4 5.6c-2.3 5.2-3.3 10.8-3 16.4l0 65.5c0 13.7 4.8 20.6 14.4 20.8c4.5 0 7.9-1.6 10.2-4.8c2.5-4.1 3.7-8.8 3.5-13.6l0-4.9 33.1 0 0 5.1c0 10.6-2.1 19.5-6.2 26.6c-4 6.9-9.9 12.5-17.1 16c-7.7 3.7-16.1 5.5-24.6 5.3c-14.2 0-25.5-3.9-33.8-11.6z"/></svg>`,
        js: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M0 32l0 448 448 0 0-448-448 0zM243.8 381.4c0 43.6-25.6 63.5-62.9 63.5-33.7 0-53.2-17.4-63.2-38.5L152 385.7c6.6 11.7 12.6 21.6 27.1 21.6 13.8 0 22.6-5.4 22.6-26.5l0-143.1 42.1 0 0 143.7zm99.6 63.5c-39.1 0-64.4-18.6-76.7-43L301 382.1c9 14.7 20.8 25.6 41.5 25.6 17.4 0 28.6-8.7 28.6-20.8 0-14.4-11.4-19.5-30.7-28l-10.5-4.5c-30.4-12.9-50.5-29.2-50.5-63.5 0-31.6 24.1-55.6 61.6-55.6 26.8 0 46 9.3 59.8 33.7L368 290c-7.2-12.9-15-18-27.1-18-12.3 0-20.1 7.8-20.1 18 0 12.6 7.8 17.7 25.9 25.6l10.5 4.5c35.8 15.3 55.9 31 55.9 66.2 0 37.8-29.8 58.6-69.7 58.6z"/></svg>`,
        python: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M439.8 200.5c-7.7-30.9-22.3-54.2-53.4-54.2l-40.1 0 0 47.4c0 36.8-31.2 67.8-66.8 67.8l-106.8 0c-29.2 0-53.4 25-53.4 54.3l0 101.8c0 29 25.2 46 53.4 54.3 33.8 9.9 66.3 11.7 106.8 0 26.9-7.8 53.4-23.5 53.4-54.3l0-40.7-106.7 0 0-13.6 160.2 0c31.1 0 42.6-21.7 53.4-54.2 11.2-33.5 10.7-65.7 0-108.6zM286.2 444.7a20.4 20.4 0 1 1 0-40.7 20.4 20.4 0 1 1 0 40.7zM167.8 248.1l106.8 0c29.7 0 53.4-24.5 53.4-54.3l0-101.9c0-29-24.4-50.7-53.4-55.6-35.8-5.9-74.7-5.6-106.8 .1-45.2 8-53.4 24.7-53.4 55.6l0 40.7 106.9 0 0 13.6-147 0c-31.1 0-58.3 18.7-66.8 54.2-9.8 40.7-10.2 66.1 0 108.6 7.6 31.6 25.7 54.2 56.8 54.2l36.7 0 0-48.8c0-35.3 30.5-66.4 66.8-66.4zM161.2 64.7a20.4 20.4 0 1 1 0 40.8 20.4 20.4 0 1 1 0-40.8z"/></svg>`,
        c: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M329.1 142.9c-62.5-62.5-155.8-62.5-218.3 0s-62.5 163.8 0 226.3 155.8 62.5 218.3 0c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3c-87.5 87.5-221.3 87.5-308.8 0s-87.5-229.3 0-316.8 221.3-87.5 308.8 0c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0z"/></svg>`,
        java: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M277.8 312.9c9.8-6.7 23.4-12.5 23.4-12.5s-38.7 7-77.2 10.2c-47.1 3.9-97.7 4.7-123.1 1.3-60.1-8 33-30.1 33-30.1s-36.1-2.4-80.6 19c-52.5 25.4 130 37 224.5 12.1zm-85.4-32.1c-19-42.7-83.1-80.2 0-145.8 103.7-81.8 50.5-135 50.5-135 21.5 84.5-75.6 110.1-110.7 162.6-23.9 35.9 11.7 74.4 60.2 118.2zM307 104.6c.1 0-175.2 43.8-91.5 140.2 24.7 28.4-6.5 54-6.5 54s62.7-32.4 33.9-72.9C216 188.1 195.4 169.3 307 104.6zm-6.1 270.5c-.5 1-1.2 1.8-2 2.6 128.3-33.7 81.1-118.9 19.8-97.3-3.3 1.2-6.2 3.4-8.2 6.3 3.6-1.3 7.3-2.3 11-3 31-6.5 75.5 41.5-20.6 91.4zM348 437.4s14.5 11.9-15.9 21.2c-57.9 17.5-240.8 22.8-291.6 .7-18.3-7.9 16-19 26.8-21.3 11.2-2.4 17.7-2 17.7-2-20.3-14.3-131.3 28.1-56.4 40.2 204.2 33.2 372.4-14.9 319.4-38.8zM124.5 396c-78.7 22 47.9 67.4 148.1 24.5-9.8-3.8-19.2-8.4-28.2-13.8-44.7 8.5-65.4 9.1-106 4.5-33.5-3.8-13.9-15.2-13.9-15.2zm179.8 97.2c-78.7 14.8-175.8 13.1-233.3 3.6 0-.1 11.8 9.7 72.4 13.6 92.2 5.9 233.8-3.3 237.1-46.9 0 0-6.4 16.5-76.2 29.7zM260.7 353c-59.2 11.4-93.5 11.1-136.8 6.6-33.5-3.5-11.6-19.7-11.6-19.7-86.8 28.8 48.2 61.4 169.5 25.9-7.8-2.8-15-7.1-21.1-12.8z"/></svg>`,
        cpp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"/></svg>`,
        csharp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M214.7 .7c17.3 3.7 28.3 20.7 24.6 38l-19.1 89.3 126.5 0 22-102.7C372.4 8 389.4-3 406.7 .7s28.3 20.7 24.6 38L412.2 128 480 128c17.7 0 32 14.3 32 32s-14.3 32-32 32l-81.6 0-27.4 128 67.8 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-81.6 0-22 102.7c-3.7 17.3-20.7 28.3-38 24.6s-28.3-20.7-24.6-38l19.1-89.3-126.5 0-22 102.7c-3.7 17.3-20.7 28.3-38 24.6s-28.3-20.7-24.6-38L99.8 384 32 384c-17.7 0-32-14.3-32-32s14.3-32 32-32l81.6 0 27.4-128-67.8 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l81.6 0 22-102.7C180.4 8 197.4-3 214.7 .7zM206.4 192l-27.4 128 126.5 0 27.4-128-126.5 0z"/></svg>`,
        desktop: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M64 0C28.7 0 0 28.7 0 64V352c0 35.3 28.7 64 64 64H240l-10.7 32H160c-17.7 0-32 14.3-32 32s14.3 32 32 32H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H346.7L336 416H512c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64zM512 64V288H64V64H512z"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" class="file-icon-svg"><path fill="var(--icon-file)" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>`
    },

    getIcon(name, isDir) {
        if (isDir) return this.customIcons.folder;
        const ext = name.split('.').pop().toLowerCase();
        if (['html', 'htm'].includes(ext)) return this.customIcons.html;
        if (ext === 'css') return this.customIcons.css;
        if (['js', 'mjs', 'cjs'].includes(ext)) return this.customIcons.js;
        if (['py', 'pyw'].includes(ext)) return this.customIcons.python;
        if (ext === 'c') return this.customIcons.c;
        if (ext === 'java') return this.customIcons.java;
        if (['cpp', 'cc', 'cxx', 'h', 'hpp'].includes(ext)) return this.customIcons.cpp;
        if (ext === 'cs') return this.customIcons.csharp;
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return this.customIcons.image;
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return this.customIcons.archive;
        if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) return this.customIcons.media;
        if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) return this.customIcons.audio;
        if (['exe', 'bat', 'cmd', 'ps1', 'sh', 'msi', 'dll'].includes(ext)) return this.customIcons.exe;
        if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'md', 'rtf'].includes(ext)) return this.customIcons.doc;
        return this.customIcons.file;
    }
};

function isImageExtension(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext);
}

function isVideoExtension(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext);
}

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

// サムネイル読み込み失敗時の共通ハンドラ
window.handleThumbError = (el, iconType) => {
    const icon = IconThemeManager.customIcons[iconType] || IconThemeManager.customIcons.file;
    el.outerHTML = `<div class="grid-icon-placeholder">${icon}</div>`;
};

// ---------------------------------------------------------------------------
// 各種ボタン・メニュー制御
// ---------------------------------------------------------------------------

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

btnSidebarHome.onclick = () => showHome();

function showHome() {
    isHomeActive = true;
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
}

function showExplorer(path) {
    isHomeActive = false;
    homeView.style.display = 'none';
    explorerView.style.display = 'block';
    btnSidebarHome.classList.remove('active');
    if (path) loadPath(path, true);
}

async function renderHomeContent() {
    const quickAccess = document.getElementById('home-quick-access');
    const recentList = document.getElementById('home-recent-list');
    const greeting = document.getElementById('home-greeting');
    
    // 挨拶の更新
    const hour = new Date().getHours();
    if (hour < 12) greeting.textContent = "おはようございます";
    else if (hour < 18) greeting.textContent = "こんにちは";
    else greeting.textContent = "こんばんは";

    // クイックアクセスの描画
    quickAccess.innerHTML = '';
    const paths = await window.api.getSystemPaths();
    if (paths) {
        const items = [
            { path: paths.desktop, label: "デスクトップ", icon: IconThemeManager.customIcons.desktop },
            { path: paths.downloads, label: "ダウンロード", icon: IconThemeManager.customIcons.download },
            { path: paths.documents, label: "ドキュメント", icon: IconThemeManager.customIcons.doc },
            { path: paths.music, label: "ミュージック", icon: IconThemeManager.customIcons.audio },
            { path: paths.pictures, label: "ピクチャ", icon: IconThemeManager.customIcons.image },
            { path: paths.videos, label: "ビデオ", icon: IconThemeManager.customIcons.media }
        ];

        items.forEach(item => {
            const tile = document.createElement('div');
            tile.className = 'quick-tile';
            tile.innerHTML = `
                <div class="tile-icon">${item.icon}</div>
                <span>${item.label}</span>
            `;
            tile.onclick = () => showExplorer(item.path);
            quickAccess.appendChild(tile);
        });
    }

    // 最近使用したフォルダの描画
    recentList.innerHTML = '';
    if (recentFolders.length === 0) {
        recentList.innerHTML = '<div style="color:var(--text-muted); font-size:13px;">履歴はありません</div>';
    } else {
        recentFolders.slice(0, 8).forEach(folder => {
            const item = document.createElement('div');
            item.className = 'recent-item';
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
    addToRecentFolders(path);

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
            initTree(currentPath);
            showHome();
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
        const isImg = isImageExtension(name);
        const isVid = isVideoExtension(name);
        
        // アイコンタイプの決定
        let iconType = 'file';
        if (isDir) iconType = 'folder';
        else if (isImg) iconType = 'image';
        else if (isVid) iconType = 'media';
        else {
            const ext = name.split('.').pop().toLowerCase();
            if (['exe', 'bat', 'cmd'].includes(ext)) iconType = 'exe';
            else if (['zip', 'rar', '7z'].includes(ext)) iconType = 'archive';
            // ... 他の判定は getIcon と同様だが、ここではプレースホルダー用
        }

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

    const currentIcon = IconThemeManager.getIcon(oldName, isDir);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = oldName;

    nameCell.innerHTML = '';
    if (el.tagName === 'TR') {
        const iconSpan = document.createElement('span');
        iconSpan.style.marginRight = '6px';
        iconSpan.innerHTML = currentIcon;
        nameCell.appendChild(iconSpan);
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

        // 共通の描画復旧処理
        const restoreView = (nameToUse) => {
            const currentIcon = IconThemeManager.getIcon(nameToUse, isDir);
            const displayName = isDir ? nameToUse : getFileNameWithoutExtension(nameToUse);
            if (el.tagName === 'TR') {
                nameCell.innerHTML = `<span style="margin-right: 6px;">${currentIcon}</span> ${displayName}`;
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
    
    // クイックアクセス
    const paths = await window.api.getSystemPaths();
    if (paths) {
        createTreeNode(paths.desktop, treeView, true, IconThemeManager.customIcons.desktop, "デスクトップ", true);
        createTreeNode(paths.downloads, treeView, true, IconThemeManager.customIcons.download, "ダウンロード", true);
        createTreeNode(paths.documents, treeView, true, IconThemeManager.customIcons.doc, "ドキュメント", true);
        createTreeNode(paths.music, treeView, true, IconThemeManager.customIcons.audio, "ミュージック", true);
        createTreeNode(paths.pictures, treeView, true, IconThemeManager.customIcons.image, "ピクチャ", true);
        createTreeNode(paths.videos, treeView, true, IconThemeManager.customIcons.media, "ビデオ", true);
    }
    
    // セパレーター
    const sep = document.createElement('div');
    sep.className = 'tree-separator';
    treeView.appendChild(sep);
    
    // ドライブ一覧の取得
    window.api.sendCommand('GET_DRIVES');
}

function createTreeNode(fullPath, container, isRoot = false, customIcon = null, labelName = null, hideExpander = false) {
    const name = labelName || (isRoot ? fullPath : fullPath.split('\\').filter(Boolean).pop());
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.dataset.path = fullPath.endsWith('\\') ? fullPath : fullPath + '\\';

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
        
        // クイックアクセス等のトグルがない項目の場合は1クリックで移動
        if (hideExpander) {
            showExplorer(node.dataset.path);
        }
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

// ---------------------------------------------------------------------------
// コンテキストメニュー制御
// ---------------------------------------------------------------------------
const contextMenu = document.getElementById('context-menu');
let contextTarget = null; // 右クリック対象のデータ

window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    if (isHomeActive) return;

    const fileRow = e.target.closest('#file-list-body tr, .grid-item');
    const isFilePane = e.target.closest('.file-pane');
    
    if (!isFilePane) {
        contextMenu.style.display = 'none';
        return;
    }
    
    if (fileRow) {
        contextTarget = {
            name: fileRow.dataset.name,
            path: currentPath + fileRow.dataset.name,
            isDir: fileRow.dataset.type === 'D'
        };
        
        if (!fileRow.classList.contains('selected')) {
            document.querySelectorAll('#file-list-body tr, .grid-item').forEach(el => el.classList.remove('selected'));
            fileRow.classList.add('selected');
        }
    } else {
        contextTarget = null;
        // 空白部分の右クリックでは既存の選択を解除する
        document.querySelectorAll('#file-list-body tr.selected, .grid-item.selected').forEach(el => el.classList.remove('selected'));
    }

    // すべてのメニュー項目を一度リセット
    document.querySelectorAll('.context-item').forEach(item => {
        item.classList.remove('disabled');
    });

    // アイテム選択の有無に応じた制御
    const hasSelection = contextTarget !== null;
    ['ctx-open', 'ctx-cut', 'ctx-copy', 'ctx-rename', 'ctx-delete'].forEach(id => {
        document.getElementById(id).classList.toggle('disabled', !hasSelection);
    });
    
    // 貼り付けの制御
    const canPaste = clipboard.mode && clipboard.items.length > 0;
    document.getElementById('ctx-paste').classList.toggle('disabled', !canPaste);

    // 表示位置の計算
    contextMenu.style.display = 'block';
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
});

window.addEventListener('click', () => {
    contextMenu.style.display = 'none';
});

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
        if (nameCell) startRename(nameCell, selected.dataset.name);
    }
};

document.getElementById('ctx-delete').onclick = () => {
    const items = getSelectedItems();
    if (items.length > 0) {
        if (confirm(`${items.length}個のアイテムを削除しますか？`)) {
            items.forEach(item => {
                window.api.sendCommand(`DELETE|${item.srcPath}`);
            });
        }
    }
};
