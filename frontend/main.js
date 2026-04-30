const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');

let mainWindow;
let filerServer;
const decoder = new StringDecoder('utf8');
let serverBuffer = '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

function startServer() {
  const serverPath = path.join(__dirname, '..', 'filer_server.exe');
  filerServer = spawn(serverPath, [], {
    cwd: path.join(__dirname, '..')
  });

  filerServer.stdout.on('data', (data) => {
    serverBuffer += decoder.write(data);
    let lines = serverBuffer.split('\n');
    serverBuffer = lines.pop();

    let batchedCmdOut = '';
    
    for (let line of lines) {
      if (!line.includes('{')) continue;
      try {
        const obj = JSON.parse(line);
        
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
    if (batchedCmdOut) {
      mainWindow.webContents.send('backend-response', { type: 'CMD_OUT', content: batchedCmdOut });
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
  createWindow();
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
  if (filerServer && !filerServer.killed) {
    filerServer.stdin.write(command + '\n');
  }
});
