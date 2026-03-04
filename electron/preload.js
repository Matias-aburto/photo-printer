const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onUpdateStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, payload) => callback(payload));
  },
  requestQuitAndInstall: () => ipcRenderer.invoke("request-quit-and-install"),
});
