const { app, BrowserWindow, ipcMain, Menu, shell, protocol, net, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { pathToFileURL } = require('url');

// orbiter-media:// カスタムプロトコルの登録（壁紙配信用）
protocol.registerSchemesAsPrivileged([
  { scheme: 'orbiter-media', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

// ポータブルモード: exe 隣の data フォルダを userData に設定
if (app.isPackaged) {
  const localDataPath = path.join(path.dirname(app.getPath('exe')), 'data');
  app.setPath('userData', localDataPath);
}

const windows = new Map();

// 終了時に強制クリーンアップする子プロセスとタイマーの追跡セット
const trackedChildProcs = new Set();
const trackedTimers = new Set();

// BrowserWindow を生成し、サーバー起動・各種イベントを設定する
function createWindow(initialPath = null, selectWallpaper = false) {
  let windowOptions = {
    width: selectWallpaper ? 1000 : 1200,
    height: selectWallpaper ? 700 : 800,
    minWidth: 770,
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#ffffff',
      height: 40
    },
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  };

  // 既存ウィンドウがあれば位置をずらす
  const focusedWin = BrowserWindow.getFocusedWindow();
  if (focusedWin) {
    const bounds = focusedWin.getBounds();
    windowOptions.x = bounds.x + 30;
    windowOptions.y = bounds.y + 30;
  }

  const win = new BrowserWindow(windowOptions);

  // USB 着脱を WM_DEVICECHANGE フックで検知しレンダラーに通知
  if (process.platform === 'win32') {
    const WM_DEVICECHANGE = 0x0219;
    win.hookWindowMessage(WM_DEVICECHANGE, (wParam, lParam) => {
      let wp = 0;
      if (Buffer.isBuffer(wParam)) {
        wp = wParam.readUInt32LE(0);
      } else if (typeof wParam === 'number') {
        wp = wParam;
      }

      const DBT_DEVICEARRIVAL = 0x8000;
      const DBT_DEVICEREMOVECOMPLETE = 0x8004;

      if (wp === DBT_DEVICEARRIVAL || wp === DBT_DEVICEREMOVECOMPLETE) {
        if (!win.isDestroyed()) {
          console.log('Main Process: USB Drive Arrival or Removal detected!');
          win.webContents.send('device-change');
        }
      }
      return true;
    });
  }

  const winId = win.webContents.id;
  const state = {
    window: win,
    isWallpaperSelectWindow: selectWallpaper,
    filerServer: null,
    decoder: new StringDecoder('utf8'),
    serverBuffer: '',
    batchedCmdOut: '',
    messageQueue: [],
    isWindowReady: false,
    previewWindow: null,
    initialPath: initialPath
  };
  windows.set(winId, state);

  startServerForWindow(winId);

  const query = {};
  if (initialPath) query.path = initialPath;
  if (selectWallpaper) query.selectWallpaper = 'true';

  win.loadFile('index.html', { query });

  win.once('ready-to-show', () => {
    win.show();
  });

  // ロード完了後、キューに溜まったバックエンドメッセージを一括送信
  win.webContents.on('did-finish-load', () => {
    state.isWindowReady = true;
    for (const msg of state.messageQueue) {
      win.webContents.send('backend-response', msg);
    }
    state.messageQueue = [];
  });

  // ウィンドウ閉鎖時: プレビュー・サーバーを終了し、最後のメインウィンドウなら壁紙選択ウィンドウも閉じる
  win.on('closed', () => {
    if (state.previewWindow && !state.previewWindow.isDestroyed()) {
      state.previewWindow.close();
    }
    if (state.filerServer) {
      state.filerServer.kill();
    }
    windows.delete(winId);

    let mainWindowsCount = 0;
    for (const [id, wState] of windows.entries()) {
      if (!wState.isWallpaperSelectWindow) {
        mainWindowsCount++;
      }
    }

    if (mainWindowsCount === 0) {
      for (const [id, wState] of windows.entries()) {
        if (wState.isWallpaperSelectWindow && wState.window && !wState.window.isDestroyed()) {
          wState.window.close();
        }
      }
    }
  });

  // F12 で DevTools を開く
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // マウスサイドボタンによるページナビゲーションを抑制
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

// 指定ウィンドウ用の filer_server.exe を起動し stdout を JSON パースしてレンダラーに転送する
function startServerForWindow(winId) {
  const state = windows.get(winId);
  if (!state) return;

  let serverPath;
  let serverCwd;

  if (app.isPackaged) {
    serverPath = path.join(process.resourcesPath, 'filer_server.exe');
    serverCwd = process.resourcesPath;
  } else {
    serverPath = path.join(__dirname, '..', 'filer_server.exe');
    serverCwd = path.join(__dirname, '..');
  }

  const filerServer = spawn(serverPath, [], { cwd: serverCwd });
  state.filerServer = filerServer;

  filerServer.stdout.on('data', (data) => {
    state.serverBuffer += state.decoder.write(data);
    let lines = state.serverBuffer.split('\n');
    state.serverBuffer = lines.pop();

    for (let line of lines) {
      if (!line.includes('{')) continue;
      try {
        const obj = JSON.parse(line);

        if (!state.isWindowReady) {
          state.messageQueue.push(obj);
          continue;
        }

        if (obj.type === 'CMD_OUT') {
          state.batchedCmdOut += obj.content;
        } else {
          if (state.batchedCmdOut) {
            state.window.webContents.send('backend-response', { type: 'CMD_OUT', content: state.batchedCmdOut });
            state.batchedCmdOut = '';
          }
          state.window.webContents.send('backend-response', obj);
        }
      } catch (e) {
        console.error('Failed to parse JSON:', line, e);
      }
    }

    if (state.batchedCmdOut && state.isWindowReady) {
      state.window.webContents.send('backend-response', { type: 'CMD_OUT', content: state.batchedCmdOut });
      state.batchedCmdOut = '';
    }
  });

  filerServer.stderr.on('data', (data) => {
    console.error(`Backend Error [win ${winId}]: ${data}`);
  });

  filerServer.on('close', (code) => {
    console.log(`Backend process for win ${winId} exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  // orbiter-media:// リクエストを userData/wallpapers フォルダのファイルにマップ
  protocol.handle('orbiter-media', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const fileName = parsedUrl.pathname.replace(/^\//, '');
      const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
      const filePath = path.join(wallpapersDir, fileName);
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (e) {
      console.error('Failed to handle orbiter-media request:', e);
      return new Response('File not found', { status: 404 });
    }
  });

  Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (windows.size === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 終了前に残存タイマー・子プロセス・filerServer を強制クリーンアップしてログ出力
app.on('before-quit', () => {
  const timerCount = trackedTimers.size;
  for (const id of trackedTimers) clearTimeout(id);
  trackedTimers.clear();

  let killed = 0;
  let alreadyDone = 0;
  for (const proc of trackedChildProcs) {
    try {
      if (proc.exitCode === null && !proc.killed) {
        proc.kill('SIGKILL');
        killed++;
      } else {
        alreadyDone++;
      }
    } catch (e) { }
  }
  trackedChildProcs.clear();

  let serverKilled = 0;
  let serverAlreadyExited = 0; // 変数名を alreadyDone 側と合わせて分かりやすく変更
  for (const [, state] of windows.entries()) {
    if (state.filerServer) {
      // 実行中の場合は kill して「強制終了数」をインクリメント
      if (state.filerServer.exitCode === null && !state.filerServer.killed) {
        state.filerServer.kill();
        serverKilled++;
      } else {
        serverAlreadyExited++;
      }
    }
  }

  console.log(
    `[before-quit] cleanup done — ` +
    `timers cancelled: ${timerCount}, ` +
    `child-procs force-killed: ${killed} (already exited: ${alreadyDone}), ` +
    `filer-servers force-killed: ${serverKilled} (already exited: ${serverAlreadyExited})`
  );
});

// コマンドをバックエンドに転送する。PROP_NATIVE と OPEN は Main Process で直接処理
ipcMain.on('send-command', (event, command) => {
  if (!command) return;

  // PROP_NATIVE: VBScript でファイルプロパティダイアログを開く
  if (command.startsWith('PROP_NATIVE|')) {
    const filePath = command.substring('PROP_NATIVE|'.length);
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    const vbsContent = [
      'Set oShell = CreateObject("Shell.Application")',
      'Dim sDir, sFile',
      'sDir = WScript.Arguments(0)',
      'sFile = WScript.Arguments(1)',
      'Set oFolder = oShell.NameSpace(sDir)',
      'Set oItem = oFolder.ParseName(sFile)',
      'oItem.InvokeVerb "properties"',
      'WScript.Sleep 120000'
    ].join('\r\n');

    const { tmpdir } = require('os');
    const { writeFileSync, unlinkSync } = require('fs');
    const tmpVbs = path.join(tmpdir(), `prop_${Date.now()}.vbs`);
    writeFileSync(tmpVbs, '\ufeff' + vbsContent, 'utf16le');

    const proc = spawn('wscript.exe', [tmpVbs, dir, fileName], {
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();

    setTimeout(() => { try { unlinkSync(tmpVbs); } catch (e) { } }, 130000);
    return;
  }

  // OPEN: shell.openPath でファイルを既定アプリで開く
  if (command.startsWith('OPEN|')) {
    const filePath = command.substring(5);
    shell.openPath(filePath).then((error) => {
      if (error) console.error("Failed to open file:", error);
    });
    return;
  }

  const state = windows.get(event.sender.id);

  if (state && state.filerServer && !state.filerServer.killed) {
    state.filerServer.stdin.write(command + '\n');
  }
});

// OS 標準フォルダのパス一覧を返す
ipcMain.handle('get-system-paths', () => {
  const getAbsPath = (name) => {
    try {
      return path.resolve(app.getPath(name));
    } catch (e) {
      return null;
    }
  };

  return {
    desktop: getAbsPath('desktop'),
    documents: getAbsPath('documents'),
    downloads: getAbsPath('downloads'),
    music: getAbsPath('music'),
    pictures: getAbsPath('pictures'),
    videos: getAbsPath('videos'),
    home: getAbsPath('home')
  };
});

// ユーザーテーマ JSON を読み込む（ファイルなければ初期テーマを生成）
ipcMain.handle('GET_USER_THEMES', async () => {
  const themesPath = path.join(app.getPath('userData'), 'themes');
  const themesFile = path.join(themesPath, 'user_themes.json');

  try {
    await fs.mkdir(themesPath, { recursive: true });
    try {
      const data = await fs.readFile(themesFile, 'utf8');
      const cleanJson = data.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      return JSON.parse(cleanJson);
    } catch (e) {
      const initialContent = `[
  {
    "id": "user-emerald",
    "name": "エメラルド",
    "colors": {
      "--bg-main": "#0b0f0e",       // メイン背景
      "--bg-side": "#121817",       // サイドバー背景
      "--accent-color": "#10b981",  // アクセント
      "--text-main": "#ecfdf5",     // テキスト
      "--border-main": "#1e2927",   // 境界線
      "--icon-folder": "#10b981",   // フォルダアイコン
      "--icon-file": "#6ee7b7"      // ファイルアイコン
    }
  },
  {
    "id": "user-cyber",
    "name": "スポーティ",
    "colors": {
      "--bg-main": "#0f172a",
      "--bg-side": "#1e293b",
      "--accent-color": "#f97316",
      "--text-main": "#f8fafc",
      "--border-main": "#334155",
      "--icon-folder": "#f97316",
      "--icon-file": "#94a3b8"
    }
  },
  {
    "id": "user-obsidian",
    "name": "オブシディアン",
    "colors": {
      "--bg-main": "#0a0a0a",
      "--bg-side": "#141414",
      "--accent-color": "#d4af37",
      "--text-main": "#f5f5f7",
      "--border-main": "#262626",
      "--icon-folder": "#d4af37",
      "--icon-file": "#a3a3a3"
    }
  }
]`;
      await fs.writeFile(themesFile, initialContent);
      return JSON.parse(initialContent.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1'));
    }
  } catch (err) {
    console.error('Failed to handle user themes:', err);
    return [];
  }
});

// テーマフォルダを新しいウィンドウで開く
ipcMain.handle('OPEN_THEMES_FOLDER', () => {
  const themesPath = path.join(app.getPath('userData'), 'themes');
  createWindow(themesPath);
});

// 指定パスで新しいウィンドウを開く
ipcMain.handle('OPEN_NEW_WINDOW', (event, targetPath) => {
  if (targetPath) {
    createWindow(targetPath);
  }
});

// タイトルバーオーバーレイの色を更新する
ipcMain.on('UPDATE_TITLE_BAR_OVERLAY', (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && typeof win.setTitleBarOverlay === 'function') {
    win.setTitleBarOverlay({
      color: data.color,
      symbolColor: data.symbolColor,
      height: 40
    });
  }
});

// 壁紙選択ウィンドウを開く（既に開いていればフォーカス）
ipcMain.handle('OPEN_WALLPAPER_SELECT_WINDOW', () => {
  for (const [id, wState] of windows.entries()) {
    if (wState.isWallpaperSelectWindow && wState.window && !wState.window.isDestroyed()) {
      if (wState.window.isMinimized()) {
        wState.window.restore();
      }
      wState.window.focus();
      return;
    }
  }

  createWindow(null, true);
});

// 壁紙選択ウィンドウをすべて閉じる
ipcMain.handle('CLOSE_WALLPAPER_SELECT_WINDOW', () => {
  for (const [id, wState] of windows.entries()) {
    if (wState.isWallpaperSelectWindow && wState.window && !wState.window.isDestroyed()) {
      wState.window.close();
    }
  }
});

// 壁紙履歴を metadata.json と同期し、最新 5 枚を返す（古いファイルは削除）
async function getWallpaperHistory() {
  const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
  await fs.mkdir(wallpapersDir, { recursive: true });

  const metadataPath = path.join(wallpapersDir, 'metadata.json');
  let historyData = [];
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    historyData = JSON.parse(raw);
  } catch (e) { }

  const files = await fs.readdir(wallpapersDir);
  const wpFiles = files.filter(f => f.startsWith('wp_'));

  let syncedHistory = historyData.filter(item => wpFiles.includes(item.file));

  const trackedFiles = syncedHistory.map(item => item.file);
  const untrackedFiles = wpFiles.filter(f => !trackedFiles.includes(f));

  for (const file of untrackedFiles) {
    const filePath = path.join(wallpapersDir, file);
    try {
      const stats = await fs.stat(filePath);
      const baseName = path.basename(file, path.extname(file));
      const timestampStr = baseName.slice('wp_'.length);
      const timestamp = parseInt(timestampStr, 10) || stats.mtimeMs;
      const id = timestampStr;
      const dataUrl = `orbiter-media://wallpaper/${file}`;
      syncedHistory.push({ id, dataUrl, file, timestamp, originalPath: '' });
    } catch (e) { }
  }

  syncedHistory.sort((a, b) => b.timestamp - a.timestamp);

  const keep = syncedHistory.slice(0, 5);
  const remove = syncedHistory.slice(5);

  for (const item of remove) {
    try {
      await fs.unlink(path.join(wallpapersDir, item.file));
    } catch (e) {
      console.error(`Failed to delete old wallpaper file: ${item.file}`, e);
    }
  }

  try {
    await fs.writeFile(metadataPath, JSON.stringify(keep, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write wallpaper metadata:', e);
  }

  return keep.map(item => ({
    id: item.id,
    dataUrl: item.dataUrl,
    originalPath: item.originalPath || ''
  }));
}

// ダイアログで壁紙を選択し userData/wallpapers に保存する
ipcMain.handle('SELECT_WALLPAPER', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const srcPath = result.filePaths[0];
  const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
  await fs.mkdir(wallpapersDir, { recursive: true });

  const timestamp = Date.now();
  const ext = path.extname(srcPath);
  const destName = `wp_${timestamp}${ext}`;
  const destPath = path.join(wallpapersDir, destName);

  await fs.copyFile(srcPath, destPath);

  const metadataPath = path.join(wallpapersDir, 'metadata.json');
  let historyData = [];
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    historyData = JSON.parse(raw);
  } catch (e) { }

  const newItem = {
    id: `${timestamp}`,
    dataUrl: `orbiter-media://wallpaper/${destName}`,
    file: destName,
    timestamp: timestamp,
    originalPath: srcPath
  };
  historyData.unshift(newItem);

  try {
    await fs.writeFile(metadataPath, JSON.stringify(historyData, null, 2), 'utf8');
  } catch (e) { }

  return await getWallpaperHistory();
});

// パス指定で壁紙を userData/wallpapers に保存する（壁紙ギャラリーからのダブルクリック用）
ipcMain.handle('SET_WALLPAPER_BY_PATH', async (event, srcPath) => {
  if (!srcPath) return null;

  const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
  await fs.mkdir(wallpapersDir, { recursive: true });

  const timestamp = Date.now();
  const ext = path.extname(srcPath);
  const destName = `wp_${timestamp}${ext}`;
  const destPath = path.join(wallpapersDir, destName);

  await fs.copyFile(srcPath, destPath);

  const metadataPath = path.join(wallpapersDir, 'metadata.json');
  let historyData = [];
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    historyData = JSON.parse(raw);
  } catch (e) { }

  const newItem = {
    id: `${timestamp}`,
    dataUrl: `orbiter-media://wallpaper/${destName}`,
    file: destName,
    timestamp: timestamp,
    originalPath: srcPath
  };
  historyData.unshift(newItem);

  try {
    await fs.writeFile(metadataPath, JSON.stringify(historyData, null, 2), 'utf8');
  } catch (e) { }

  return await getWallpaperHistory();
});

// 壁紙履歴を返す
ipcMain.handle('GET_WALLPAPERS', async () => {
  return await getWallpaperHistory();
});

// 壁紙ファイルと metadata.json をすべて削除する
ipcMain.handle('CLEAR_WALLPAPER', async () => {
  const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
  try {
    const files = await fs.readdir(wallpapersDir);
    for (const file of files) {
      if (file.startsWith('wp_') || file === 'metadata.json') {
        await fs.unlink(path.join(wallpapersDir, file));
      }
    }
  } catch (err) {
    console.error('Failed to clear wallpapers:', err);
  }
});

// レンダラーからのログをメインプロセスのコンソールに転送する
ipcMain.on('RENDERER_LOG', (event, ...args) => {
  console.log('[RENDERER]', ...args);
});

const os = require('os');

// ホームディレクトリ以下の画像ファイルを再帰スキャンする（壁紙ギャラリー用）
async function scanImages(dir, fileList = [], limit = 1000) {
  if (fileList.length >= limit) return fileList;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (fileList.length >= limit) break;

      const fullPath = path.join(dir, entry.name);
      const nameLower = entry.name.toLowerCase();

      if (entry.name.startsWith('.') ||
        nameLower.includes('orbiter') ||
        ['appdata', 'node_modules', 'local settings', 'application data', 'cookies',
          'sendto', 'start menu', 'my documents', 'templates', 'printhood', 'nethood',
          'recent', 'system32', 'windows', 'program files', 'program files (x86)',
          'msocache', 'recovery', 'system volume information', 'searches', 'saved games',
          'contacts', 'links', 'searches', 'favorites', 'music', 'videos'].includes(nameLower)) {
        continue;
      }

      if (entry.isDirectory()) {
        try {
          await scanImages(fullPath, fileList, limit);
        } catch (e) { }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
          try {
            const stats = await fs.stat(fullPath);
            // 80KB超の画像ファイルのみを対象とする
            if (stats.size > 80 * 1024) {
              fileList.push({
                path: fullPath,
                name: entry.name
              });
            }
          } catch (e) { }
        }
      }
    }
  } catch (e) { }
  return fileList;
}

// ホーム以下の画像をスキャンして返す（壁紙ギャラリー用）
ipcMain.handle('SCAN_USER_IMAGES', async () => {
  const homeDir = os.homedir();
  const images = [];
  try {
    await scanImages(homeDir, images, 1000);
  } catch (err) {
    console.error('Scan user images error:', err);
  }
  return images;
});

// ファイルをテキストとして読み込む（1MB 超は先頭 10KB のみ）
ipcMain.handle('READ_FILE_TEXT', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > 1024 * 1024) {
      const buffer = Buffer.alloc(1024 * 10);
      const handle = await fs.open(filePath, 'r');
      const { bytesRead } = await handle.read(buffer, 0, 1024 * 10, 0);
      await handle.close();
      return buffer.toString('utf8', 0, bytesRead) + '\n\n... (File too large, preview truncated)';
    }
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error('IPC READ_FILE_TEXT Error:', err);
    throw err;
  }
});

// パスがディレクトリかどうか判定する
ipcMain.handle('IS_DIRECTORY', async (event, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch (e) {
    return false;
  }
});

// プレビューウィンドウを表示する（既存なら再利用）
ipcMain.handle('SHOW_PREVIEW_WINDOW', async (event, data) => {
  const state = windows.get(event.sender.id);
  if (!state) return;

  if (state.previewWindow) {
    state.previewWindow.show();
    state.previewWindow.webContents.send('backend-response', { type: 'UPDATE_PREVIEW', file: data.file });
    state.previewWindow.webContents.send('backend-response', {
      type: 'APPLY_THEME',
      theme: data.theme,
      isDark: data.isDark,
      highContrast: data.highContrast
    });
    return;
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const winWidth = 600;
  const winHeight = 338;

  state.previewWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round((screenWidth - winWidth) / 2 + 100),
    y: Math.round((screenHeight - winHeight) / 2 + 100),
    title: 'Preview',
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  state.previewWindow.loadFile('preview.html');

  state.previewWindow.webContents.on('did-finish-load', () => {
    state.previewWindow.webContents.send('backend-response', { type: 'UPDATE_PREVIEW', file: data.file });
    state.previewWindow.webContents.send('backend-response', {
      type: 'APPLY_THEME',
      theme: data.theme,
      isDark: data.isDark,
      highContrast: data.highContrast
    });
  });

  state.previewWindow.on('closed', () => {
    state.previewWindow = null;
    if (state.window && !state.window.isDestroyed()) {
      state.window.webContents.send('backend-response', { type: 'PREVIEW_WINDOW_CLOSED' });
    }
  });
});

// プレビューウィンドウを閉じる
ipcMain.on('CLOSE_PREVIEW_WINDOW', (event) => {
  const state = windows.get(event.sender.id);
  if (state && state.previewWindow) {
    state.previewWindow.close();
  }
});

let currentDraggedFiles = [];

// 外部アプリへの D&D: ネイティブドラッグを開始し、同一ドライブへのドロップは移動としてエミュレートする
ipcMain.on('ondragstart', (event, files) => {
  currentDraggedFiles = files || [];
  try {
    if (!files || files.length === 0) return;

    // 4×4 透明アイコン（IDragSourceHelper の HWND を不可視にして Task View ゴーストを防ぐ）
    const dragIcon = nativeImage.createFromBitmap(
      Buffer.alloc(4 * 4 * 4, 0),
      { width: 4, height: 4 }
    );

    const dragConfig = {
      files: files,
      file: files[0],
      icon: dragIcon
    };

    // Windows では startDrag が完了するまで同期ブロックする
    event.sender.startDrag(dragConfig);

    if (!event.sender.isDestroyed()) {
      event.sender.send('backend-response', { type: 'DRAG_END' });
    }

    const { exec } = require('child_process');
    const cmd = 'powershell -NoProfile -Command "$sh = New-Object -ComObject Shell.Application; $paths = New-Object System.Collections.Generic.List[string]; try { $sh.Windows() | ForEach-Object { $p = $_.Document.Folder.Self.Path; if ($p) { $paths.Add($p) } } } catch {}; try { $sh.Namespace(\'shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}\').Items() | ForEach-Object { $p = $_.Path; if ($p) { $paths.Add($p) } } } catch {}; $paths.Add([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)); $paths.Add([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)); $paths.Add(([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile) + \'\\Downloads\')); $paths.Add([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyPictures)); $paths.Add([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyMusic)); $paths.Add([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyVideos)); try { [System.IO.DriveInfo]::GetDrives() | ForEach-Object { if ($_.IsReady) { $paths.Add($_.Name) } } } catch {}; $paths | Select-Object -Unique"';

    const checkAttempts = [300, 1200, 3000];
    checkAttempts.forEach((delay) => {
      const timerId = setTimeout(() => {
        trackedTimers.delete(timerId);
        const child = exec(cmd, async (err, stdout) => {
          trackedChildProcs.delete(child);
          let destDirs = [];
          if (!err && stdout) {
            destDirs = stdout.split(/\r?\n/).map(p => p.trim()).filter(p => p.length > 0);
          }

          const uniqueDestDirs = [...new Set(destDirs)];
          const allCandidateDirs = [...uniqueDestDirs];

          // Gather immediate subfolders of all target candidate directories
          for (const dir of uniqueDestDirs) {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  allCandidateDirs.push(path.join(dir, entry.name));
                }
              }
            } catch (e) {
              // Ignore inaccessible folders
            }
          }

          let filesMoved = false;
          for (const srcPath of files) {
            try {
              try {
                await fs.access(srcPath);
              } catch (e) {
                // Already deleted or moved in a previous attempt
                continue;
              }

              const srcStat = await fs.stat(srcPath);
              const fileName = path.basename(srcPath);
              const srcDrive = srcPath[0].toLowerCase();
              const isDirectory = srcStat.isDirectory();

              const checkPromises = allCandidateDirs.map(async (destDir) => {
                const destDrive = destDir[0].toLowerCase();
                if (srcDrive !== destDrive) return null;

                const destPath = path.join(destDir, fileName);
                if (destPath.toLowerCase() === srcPath.toLowerCase()) return null;

                try {
                  const destStat = await fs.stat(destPath);
                  const now = Date.now();

                  const birthtimeVal = destStat.birthtime ? destStat.birthtime.getTime() : (destStat.birthtimeMs || 0);
                  const ctimeVal = destStat.ctime ? destStat.ctime.getTime() : (destStat.ctimeMs || 0);
                  const isRecent = (now - birthtimeVal < 20000) || (now - ctimeVal < 20000);

                  let matches = false;
                  if (isDirectory && destStat.isDirectory()) {
                    matches = isRecent;
                  } else if (!isDirectory && !destStat.isDirectory()) {
                    matches = (destStat.size === srcStat.size) && isRecent;
                  }

                  if (matches) {
                    return destPath;
                  }
                } catch (e) { }
                return null;
              });

              const results = await Promise.all(checkPromises);
              const foundDestPath = results.find(p => p !== null);

              if (foundDestPath) {
                if (isDirectory) {
                  await fs.rm(srcPath, { recursive: true, force: true });
                } else {
                  await fs.unlink(srcPath);
                }
                filesMoved = true;
                console.log(`Same-drive move completed on delay ${delay}ms: ${srcPath} -> ${foundDestPath}`);
              }
            } catch (e) { }
          }

          if (filesMoved && !event.sender.isDestroyed()) {
            event.sender.send('backend-response', { type: 'REFRESH_LIST' });
          }
        });
        trackedChildProcs.add(child);
      }, delay);
      trackedTimers.add(timerId);
    });

  } catch (err) {
    console.error('Failed to start native drag:', err);
  }
});

// 最後にドラッグされたファイルパス一覧を返す
ipcMain.handle('GET_DRAGGED_FILES', () => {
  return currentDraggedFiles;
});

// ウィンドウの最大化・復元を切り替える
ipcMain.on('TOGGLE_MAXIMIZE', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});
