const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  sendCommand: (cmd) => ipcRenderer.send('send-command', cmd),
  onBackendResponse: (callback) => ipcRenderer.on('backend-response', (_event, data) => callback(data)),
  getSystemPaths: () => ipcRenderer.invoke('get-system-paths')
});
