const { app, BrowserWindow, ipcMain, Menu, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { pathToFileURL } = require('url');

// 高パフォーマンスなカスタムファイルプロトコルのスキーム登録（メモリリーク・ファイルサイズ制限の解消）
protocol.registerSchemesAsPrivileged([
  { scheme: 'orbiter-media', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

// パッケージ時は実行ファイルと同じ階層のdataフォルダをuserDataとして使用する（ポータブルモード）
if (app.isPackaged) {
  const localDataPath = path.join(path.dirname(app.getPath('exe')), 'data');
  app.setPath('userData', localDataPath);
}

const windows = new Map();

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
      nodeIntegration: false,
      plugins: true
    },
    show: false
  };

  // 既存のウィンドウがあれば位置を少しずらす
  const focusedWin = BrowserWindow.getFocusedWindow();
  if (focusedWin) {
    const bounds = focusedWin.getBounds();
    windowOptions.x = bounds.x + 30;
    windowOptions.y = bounds.y + 30;
  }

  const win = new BrowserWindow(windowOptions);

  // USBドライブ等の動的認識のためのウィンドウメッセージフック（Windows環境限定）
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

  win.webContents.on('did-finish-load', () => {
    state.isWindowReady = true;
    for (const msg of state.messageQueue) {
      win.webContents.send('backend-response', msg);
    }
    state.messageQueue = [];
  });

  win.on('closed', () => {
    if (state.previewWindow && !state.previewWindow.isDestroyed()) {
      state.previewWindow.close();
    }
    if (state.filerServer) {
      state.filerServer.kill();
    }
    windows.delete(winId);

    // すべての本アプリウィンドウ（メインウィンドウ）が閉じられたかチェック
    let mainWindowsCount = 0;
    for (const [id, wState] of windows.entries()) {
      if (!wState.isWallpaperSelectWindow) {
        mainWindowsCount++;
      }
    }

    // メインウィンドウが0になったら、残っている壁紙選択ウィンドウもすべて閉じる
    if (mainWindowsCount === 0) {
      for (const [id, wState] of windows.entries()) {
        if (wState.isWallpaperSelectWindow && wState.window && !wState.window.isDestroyed()) {
          wState.window.close();
        }
      }
    }
  });

  // 開発時以外でもF12でデバッグできるようにする（α版用）
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // マウスの戻る/進むボタン（XButton1/2）による
  // Electronデフォルトのページナビゲーションを抑制
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}

function startServerForWindow(winId) {
  const state = windows.get(winId);
  if (!state) return;

  let serverPath;
  let serverCwd;

  if (app.isPackaged) {
    // パッケージング後は resources フォルダ直下に配置される想定
    serverPath = path.join(process.resourcesPath, 'filer_server.exe');
    serverCwd = process.resourcesPath;
  } else {
    // 開発環境
    serverPath = path.join(__dirname, '..', 'filer_server.exe');
    serverCwd = path.join(__dirname, '..');
  }

  // サーバーの起動
  const filerServer = spawn(serverPath, [], {
    cwd: serverCwd
  });
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
          // If we have accumulated CMD_OUT, send them first
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

    // Final flush of batched content
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
  // カスタムメディアプロトコルのハンドラー登録
  protocol.handle('orbiter-media', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const fileName = parsedUrl.pathname.replace(/^\//, ''); // 先頭のスラッシュを除去
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

ipcMain.on('send-command', (event, command) => {
  if (!command) return;

  // PROP_NATIVE: VBScript経由でWindowsプロパティを開く
  // パスはコマンドライン引数で渡すことでVBSファイルを純ASCII化し
  // 文字コード問題（UTF-8 vs ANSI）を回避する
  if (command.startsWith('PROP_NATIVE|')) {
    const filePath = command.substring('PROP_NATIVE|'.length);
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    // VBSファイルはASCIIのみ、パスは引数経由で受け取る
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
    // UTF-16 LE with BOM: wscript.exeが確実に認識できる文字コード
    writeFileSync(tmpVbs, '\ufeff' + vbsContent, 'utf16le');

    const proc = spawn('wscript.exe', [tmpVbs, dir, fileName], {
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();

    setTimeout(() => { try { unlinkSync(tmpVbs); } catch (e) { } }, 130000);
    return;
  }

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


ipcMain.handle('GET_USER_THEMES', async () => {
  const themesPath = path.join(app.getPath('userData'), 'themes');
  const themesFile = path.join(themesPath, 'user_themes.json');

  try {
    await fs.mkdir(themesPath, { recursive: true });
    try {
      const data = await fs.readFile(themesFile, 'utf8');
      // コメント（// または /* */）を除去してからパース
      const cleanJson = data.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
      return JSON.parse(cleanJson);
    } catch (e) {
      // 初期ファイルを作成（コメント付きの文字列として作成）
      const initialContent = `[
  {
    "id": "user-emerald-night",
    "name": "エメラルド・ナイト",
    "colors": {
      "--bg-main": "#0b0f0e",       // メイン背景
      "--bg-side": "#121817",       // サイドバー背景
      "--accent-color": "#10b981",  // アクセント（エメラルド）
      "--text-main": "#ecfdf5",     // テキスト
      "--border-main": "#1e2927",   // 境界線
      "--icon-folder": "#10b981",   // フォルダアイコン
      "--icon-file": "#6ee7b7"      // ファイルアイコン
    }
  },
  {
    "id": "user-cyber-slate",
    "name": "サイバー・スレート",
    "colors": {
      "--bg-main": "#0f172a",       // メイン背景（ミッドナイトブルー）
      "--bg-side": "#1e293b",       // サイドバー背景
      "--accent-color": "#f97316",  // アクセント（オレンジ）
      "--text-main": "#f8fafc",     // テキスト
      "--border-main": "#334155",   // 境界線
      "--icon-folder": "#f97316",   // フォルダアイコン
      "--icon-file": "#94a3b8"      // ファイルアイコン
    }
  },
  {
    "id": "user-gilded-obsidian",
    "name": "ギルデッド・オブシディアン",
    "colors": {
      "--bg-main": "#0a0a0a",       // メイン背景（深い黒）
      "--bg-side": "#141414",       // サイドバー背景（わずかに明るい墨色）
      "--accent-color": "#d4af37",  // アクセント（ゴールド）
      "--text-main": "#f5f5f7",     // テキスト（オフホワイト）
      "--border-main": "#262626",   // 境界線（ダークグレー）
      "--icon-folder": "#d4af37",   // フォルダアイコン（ゴールド）
      "--icon-file": "#a3a3a3"      // ファイルアイコン（ミディアムグレー）
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

ipcMain.handle('OPEN_THEMES_FOLDER', () => {
  const themesPath = path.join(app.getPath('userData'), 'themes');
  createWindow(themesPath);
});

ipcMain.handle('OPEN_NEW_WINDOW', (event, targetPath) => {
  if (targetPath) {
    createWindow(targetPath);
  }
});

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

ipcMain.handle('OPEN_WALLPAPER_SELECT_WINDOW', () => {
  // 既に壁紙設定ウィンドウが開いているかチェック
  for (const [id, wState] of windows.entries()) {
    if (wState.isWallpaperSelectWindow && wState.window && !wState.window.isDestroyed()) {
      if (wState.window.isMinimized()) {
        wState.window.restore();
      }
      wState.window.focus();
      return;
    }
  }

  // 開いていなければ新しく作成する
  createWindow(null, true);
});

ipcMain.handle('CLOSE_WALLPAPER_SELECT_WINDOW', () => {
  // すべての壁紙設定ウィンドウを閉じる
  for (const [id, wState] of windows.entries()) {
    if (wState.isWallpaperSelectWindow && wState.window && !wState.window.isDestroyed()) {
      wState.window.close();
    }
  }
});

async function getWallpaperHistory() {
  const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
  await fs.mkdir(wallpapersDir, { recursive: true });

  const metadataPath = path.join(wallpapersDir, 'metadata.json');
  let historyData = [];
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    historyData = JSON.parse(raw);
  } catch (e) {
    // メタデータファイルが存在しないか破損している場合は新規生成
  }

  // 物理ファイルの存在チェックと同期
  const files = await fs.readdir(wallpapersDir);
  const wpFiles = files.filter(f => f.startsWith('wp_'));

  // 実際に存在する画像ファイルのみのメタデータに同期
  let syncedHistory = historyData.filter(item => wpFiles.includes(item.file));

  // 登録されていない物理画像ファイル（古いバージョン等のデータ）があれば補完
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
    } catch (e) {}
  }

  // タイムスタンプ降順（新しい順）にソート
  syncedHistory.sort((a, b) => b.timestamp - a.timestamp);

  // 上位5枚を保持し、それ以外を削除
  const keep = syncedHistory.slice(0, 5);
  const remove = syncedHistory.slice(5);

  for (const item of remove) {
    try {
      await fs.unlink(path.join(wallpapersDir, item.file));
    } catch (e) {
      console.error(`Failed to delete old wallpaper file: ${item.file}`, e);
    }
  }

  // メタデータファイルの更新書き出し
  try {
    await fs.writeFile(metadataPath, JSON.stringify(keep, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write wallpaper metadata:', e);
  }

  // レンダラープロセスに返す配列を生成（元ファイルの絶対パス originalPath を含む）
  return keep.map(item => ({
    id: item.id,
    dataUrl: item.dataUrl,
    originalPath: item.originalPath || ''
  }));
}

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

  // メタデータファイルにオリジナルの絶対パスを含めて記録
  const metadataPath = path.join(wallpapersDir, 'metadata.json');
  let historyData = [];
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    historyData = JSON.parse(raw);
  } catch (e) {}

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
  } catch (e) {}

  return await getWallpaperHistory();
});

ipcMain.handle('SET_WALLPAPER_BY_PATH', async (event, srcPath) => {
  if (!srcPath) return null;

  const wallpapersDir = path.join(app.getPath('userData'), 'wallpapers');
  await fs.mkdir(wallpapersDir, { recursive: true });

  const timestamp = Date.now();
  const ext = path.extname(srcPath);
  const destName = `wp_${timestamp}${ext}`;
  const destPath = path.join(wallpapersDir, destName);

  await fs.copyFile(srcPath, destPath);

  // メタデータファイルにオリジナルの絶対パスを含めて記録
  const metadataPath = path.join(wallpapersDir, 'metadata.json');
  let historyData = [];
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    historyData = JSON.parse(raw);
  } catch (e) {}

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
  } catch (e) {}

  return await getWallpaperHistory();
});

ipcMain.handle('GET_WALLPAPERS', async () => {
  return await getWallpaperHistory();
});

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

ipcMain.on('RENDERER_LOG', (event, ...args) => {
  console.log('[RENDERER]', ...args);
});

const os = require('os');

async function scanImages(dir, fileList = [], limit = 1000) {
  if (fileList.length >= limit) return fileList;
  
  // アプリフォルダの絶対パスを取得して小文字化
  const appDir = path.dirname(app.getAppPath()).toLowerCase();
  const execDir = path.dirname(process.execPath).toLowerCase();

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (fileList.length >= limit) break;
      
      const fullPath = path.join(dir, entry.name);
      const fullPathLower = fullPath.toLowerCase();

      // 現在実行中のアプリパッケージフォルダやソースコードは絶対に除外
      if (fullPathLower.startsWith(appDir) || fullPathLower.startsWith(execDir)) {
        continue;
      }
      
      // 除外フォルダ（大容量、システム、管理者権限が必要そうなフォルダ、およびアプリフォルダ名）
      const nameLower = entry.name.toLowerCase();
      if (entry.name.startsWith('.') || 
          nameLower.includes('orbiter') || // Orbiterフォルダの除外！
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
        } catch (e) {
          // 権限エラーなどはスキップ
        }
      } else if (entry.isFile()) {
        const nameLower = entry.name.toLowerCase();
        // アプリに含まれる3つのアイコン画像をデフォルトで除外
        if (['drag-icon.png', 'icon.png', 'icon_reencoded.png'].includes(nameLower)) {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
          fileList.push({
            path: fullPath,
            name: entry.name
          });
        }
      }
    }
  } catch (e) {
    // 権限エラーなどはスキップ
  }
  return fileList;
}

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

ipcMain.handle('READ_FILE_TEXT', async (event, filePath) => {
  try {
    // セキュリティ上の配慮として、一定サイズ以上の場合は先頭のみ読み込む等の制限を設けるのが望ましい
    const stats = await fs.stat(filePath);
    if (stats.size > 1024 * 1024) { // 1MB制限
      const buffer = Buffer.alloc(1024 * 10); // 10KB
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
    height: winHeight, // 16:9 ratio
    x: Math.round((screenWidth - winWidth) / 2 + 100),
    y: Math.round((screenHeight - winHeight) / 2 + 100),
    title: 'Preview',
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true
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

ipcMain.on('CLOSE_PREVIEW_WINDOW', (event) => {
  const state = windows.get(event.sender.id);
  if (state && state.previewWindow) {
    state.previewWindow.close();
  }
});

let currentDraggedFiles = [];

// 外部アプリへのドラッグ＆ドロップ
ipcMain.on('ondragstart', (event, files) => {
  currentDraggedFiles = files || [];
  try {
    if (!files || files.length === 0) return;

    // Electronのバージョンやプラットフォームにより引数の形式が異なる場合があるため
    // 互換性を考慮して単一ファイル(file)と複数ファイル(files)の両方を試みる
    const dragConfig = {
      files: files,
      file: files[0],
      icon: path.join(__dirname, 'drag-icon.png')
    };

    console.log('Native drag start disabled to prevent crash. Files:', files);
    // 致命的なクラッシュを防ぐため、一時的にネイティブのstartDragを無効化
    // event.sender.startDrag(dragConfig);
  } catch (err) {
    console.error('Failed to start native drag:', err);
  }
});

ipcMain.handle('GET_DRAGGED_FILES', () => {
  return currentDraggedFiles;
});
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
