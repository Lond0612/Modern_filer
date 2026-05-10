const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');

let mainWindow;
let filerServer;
const decoder = new StringDecoder('utf8');
let serverBuffer = '';
let batchedCmdOut = '';
let messageQueue = [];
let isWindowReady = false;
let previewWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', () => {
    isWindowReady = true;
    for (const msg of messageQueue) {
      mainWindow.webContents.send('backend-response', msg);
    }
    messageQueue = [];
  });
  mainWindow.on('closed', () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }
  });
}

function startServer() {
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

  filerServer = spawn(serverPath, [], {
    cwd: serverCwd
  });

  filerServer.stdout.on('data', (data) => {
    serverBuffer += decoder.write(data);
    let lines = serverBuffer.split('\n');
    serverBuffer = lines.pop();

    for (let line of lines) {
      if (!line.includes('{')) continue;
      try {
        const obj = JSON.parse(line);

        if (!isWindowReady) {
          messageQueue.push(obj);
          continue;
        }

        if (obj.type === 'CMD_OUT') {
          batchedCmdOut += obj.content;
        } else {
          // If we have accumulated CMD_OUT, send them first
          if (batchedCmdOut) {
            mainWindow.webContents.send('backend-response', { type: 'CMD_OUT', content: batchedCmdOut });
            batchedCmdOut = '';
          }
          mainWindow.webContents.send('backend-response', obj);
        }
      } catch (e) {
        console.error('Failed to parse JSON:', line, e);
      }
    }

    // Final flush of batched content
    if (batchedCmdOut && isWindowReady) {
      mainWindow.webContents.send('backend-response', { type: 'CMD_OUT', content: batchedCmdOut });
      batchedCmdOut = '';
    }
  });

  filerServer.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });

  filerServer.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    app.quit();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  // 開発時以外でもF12でデバッグできるようにする（α版用）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  startServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (filerServer) filerServer.kill();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('send-command', (event, command) => {
  if (command.startsWith('OPEN|')) {
    const filePath = command.substring(5);
    shell.openPath(filePath).then((error) => {
      if (error) console.error("Failed to open file:", error);
    });
    return;
  }

  if (filerServer && !filerServer.killed) {
    filerServer.stdin.write(command + '\n');
  }
});

ipcMain.handle('get-system-paths', () => {
  return {
    desktop: app.getPath('desktop'),
    documents: app.getPath('documents'),
    downloads: app.getPath('downloads'),
    music: app.getPath('music'),
    pictures: app.getPath('pictures'),
    videos: app.getPath('videos'),
    home: app.getPath('home')
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
    "id": "user-sample-dark",
    "name": "サンプル・ネオン",
    "colors": {
      "--bg-main": "#050505",       // メインの背景色
      "--bg-side": "#0a0a0a",       // サイドバーの背景色
      "--accent-color": "#ff00ff",  // アクセントカラー（選択時など）
      "--text-main": "#00ffff",     // メインの文字色
      "--border-main": "#ff00ff",   // 境界線の色
      "--icon-folder": "#ff00ff",   // フォルダアイコンの色
      "--icon-file": "#00ffff"      // ファイルアイコンの色
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
  shell.openPath(themesPath).catch(err => console.error('Failed to open themes folder:', err));
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
  if (previewWindow) {
    previewWindow.show();
    previewWindow.webContents.send('backend-response', { type: 'UPDATE_PREVIEW', file: data.file });
    return;
  }

  const mainBounds = mainWindow.getBounds();

  previewWindow = new BrowserWindow({
    width: 600,
    height: 338, // 16:9 ratio
    x: mainBounds.x + mainBounds.width - 400, // メインウィンドウの右側に寄せる
    y: mainBounds.y + mainBounds.height - 330, // メインウィンドウの下側に寄せる
    title: 'Preview',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  previewWindow.loadFile('preview.html');

  previewWindow.webContents.on('did-finish-load', () => {
    previewWindow.webContents.send('backend-response', { type: 'UPDATE_PREVIEW', file: data.file });
    previewWindow.webContents.send('backend-response', {
      type: 'APPLY_THEME',
      theme: data.theme,
      isDark: data.isDark,
      highContrast: data.highContrast
    });
  });

  previewWindow.on('closed', () => {
    previewWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend-response', { type: 'PREVIEW_WINDOW_CLOSED' });
    }
  });
});

ipcMain.on('CLOSE_PREVIEW_WINDOW', () => {
  if (previewWindow) {
    previewWindow.close();
  }
});

// 外部アプリへのドラッグ＆ドロップ
ipcMain.on('ondragstart', (event, files) => {
  try {
    if (!files || files.length === 0) return;

    // Electronのバージョンやプラットフォームにより引数の形式が異なる場合があるため
    // 互換性を考慮して単一ファイル(file)と複数ファイル(files)の両方を試みる
    const dragConfig = {
      files: files, 
      file: files[0],
      icon: path.join(__dirname, 'drag-icon.png')
    };

    console.log('Native drag start:', files);
    event.sender.startDrag(dragConfig);
  } catch (err) {
    console.error('Failed to start native drag:', err);
  }
});
