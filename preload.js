const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  selectSaveDirectory: (defaultPath) => ipcRenderer.invoke('dialog:selectSaveDirectory', defaultPath),
  checkAdmin: () => ipcRenderer.invoke('system:checkAdmin'),
  listLinks: () => ipcRenderer.invoke('links:list'),
  createLink: (options) => ipcRenderer.invoke('links:create', options),
  deleteLink: (linkPath, isDirectory) => ipcRenderer.invoke('links:delete', linkPath, isDirectory),
  modifyLink: (options) => ipcRenderer.invoke('links:modify', options),
  openInExplorer: (filePath) => ipcRenderer.invoke('shell:openInExplorer', filePath),
  openTarget: (targetPath) => ipcRenderer.invoke('shell:openTarget', targetPath)
});
