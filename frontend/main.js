const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');

// パッケージ時は実行ファイルと同じ階層のdataフォルダをuserDataとして使用する（ポータブルモード）
if (app.isPackaged) {
  const localDataPath = path.join(path.dirname(app.getPath('exe')), 'data');
  app.setPath('userData', localDataPath);
}


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
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false // 準備ができるまで表示しない
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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
  
  // サーバーとウィンドウを並列で起動開始
  startServer();
  createWindow();

  // 開発時以外でもF12でデバッグできるようにする（α版用）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // マウスの戻る/進むボタン（XButton1/2）による
  // Electronデフォルトのページナビゲーションを抑制
  // （ナビゲーション処理はrenderer.js側のmousedownイベントで行う）
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (filerServer) filerServer.kill();
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

    setTimeout(() => { try { unlinkSync(tmpVbs); } catch (e) {} }, 130000);
    return;
  }

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
    icon: path.join(__dirname, 'build', 'icon.ico'),
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
