const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onUpdateStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, payload) => callback(payload));
  },
  requestQuitAndInstall: () => ipcRenderer.invoke("request-quit-and-install"),
  /** JSON array de CardTemplate (usuario). Vacío si no hay archivo. */
  readCardTemplatesSync: () => ipcRenderer.sendSync("card-templates:read-sync"),
  /** Persiste el JSON completo de plantillas de usuario. */
  writeCardTemplatesSync: (json) => ipcRenderer.sendSync("card-templates:write-sync", json),
});
