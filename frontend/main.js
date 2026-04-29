const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let filerServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden', // Make it look modern like a native app
    titleBarOverlay: {
      color: '#1a1b1e',
      symbolColor: '#ffffff',
    }
  });

  mainWindow.loadFile('index.html');

  // Start the C backend server
  const serverPath = path.join(__dirname, '..', 'filer_server.exe');
  filerServer = spawn(serverPath);

  const { StringDecoder } = require('string_decoder');
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  
  filerServer.stdout.on('data', (data) => {
    buffer += decoder.write(data);
    let lines = buffer.split('\n');
    buffer = lines.pop();
    
    lines.forEach(line => {
      if (!line) return;
      
      if (line.startsWith('START_LIST')) {
        mainWindow.webContents.send('backend-response', { type: 'START_LIST' });
      } else if (line.startsWith('END_LIST')) {
        mainWindow.webContents.send('backend-response', { type: 'END_LIST' });
      } else if (line.startsWith('START_DRIVES')) {
        mainWindow.webContents.send('backend-response', { type: 'START_DRIVES' });
      } else if (line.startsWith('END_DRIVES')) {
        mainWindow.webContents.send('backend-response', { type: 'END_DRIVES' });
      } else if (line.startsWith('F|') || line.startsWith('D|') || /^[A-Z]:\\$/.test(line.trim())) {
        mainWindow.webContents.send('backend-response', { type: 'DATA', line: line.trim() });
      } else if (line.startsWith('CMD_OUT|')) {
        mainWindow.webContents.send('backend-response', { type: 'CMD_OUT', line: line.substring(8) });
      } else if (line.startsWith('MOVE_OK')) {
        mainWindow.webContents.send('backend-response', { type: 'MOVE_OK' });
      } else if (line.startsWith('DELETE_OK')) {
        mainWindow.webContents.send('backend-response', { type: 'DELETE_OK' });
      } else if (line.startsWith('OPEN_OK')) {
        mainWindow.webContents.send('backend-response', { type: 'OPEN_OK' });
      } else if (line.startsWith('SYNC_PATH|')) {
        mainWindow.webContents.send('backend-response', { type: 'SYNC_PATH', path: line.substring(10).trim() });
      } else if (line.startsWith('ERROR|')) {
        mainWindow.webContents.send('backend-response', { type: 'ERROR', line: line.substring(6) });
      }
    });
  });

  filerServer.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });

  filerServer.on('close', (code) => {
    console.log(`Backend exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (filerServer) {
      filerServer.stdin.write('QUIT\n');
      filerServer.kill();
    }
    app.quit();
  }
});

// IPC handers from renderer to backend
ipcMain.on('send-command', (event, cmd) => {
  if (filerServer && filerServer.stdin.writable) {
    filerServer.stdin.write(cmd + '\n');
  }
});
