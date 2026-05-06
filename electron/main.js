const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const http = require("http");
const fs = require("fs");
const url = require("url");

const OUT_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "out")
  : path.join(__dirname, "..", "out");

const TEMPLATES_FILE = "card-templates.json";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

let mainWindow = null;
let server = null;

const isDev = !app.isPackaged;

function createStaticServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let pathname = url.parse(req.url).pathname || "/";
      if (pathname === "/") pathname = "/index.html";
      if (!pathname.startsWith("/")) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const filePath = path.join(OUT_DIR, pathname.replace(/^\//, ""));
      const resolved = path.normalize(filePath);
      if (!resolved.startsWith(OUT_DIR)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          if (err.code === "ENOENT") {
            res.statusCode = 404;
            res.end("Not found");
          } else {
            res.statusCode = 500;
            res.end("Error");
          }
          return;
        }
        const ext = path.extname(filePath);
        res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Icono de la ventana (usa el PNG generado desde Next/public)
    icon: path.join(OUT_DIR, "icon-512.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // El servidor estático usa un puerto distinto en cada arranque (listen(0)); sin esto,
      // cada URL sería un origen nuevo y localStorage (p. ej. plantillas Grid Maker) no persistiría.
      partition: "persist:photo-printer",
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sendStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status", payload);
  }
}

/** Persistencia de plantillas Grid Maker en disco (userData), independiente del puerto/origen de la página. */
function registerCardTemplatesIpc() {
  ipcMain.on("card-templates:read-sync", (event) => {
    try {
      const filePath = path.join(app.getPath("userData"), TEMPLATES_FILE);
      if (!fs.existsSync(filePath)) {
        event.returnValue = "";
        return;
      }
      event.returnValue = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      console.error("card-templates read:", e);
      event.returnValue = "";
    }
  });
  ipcMain.on("card-templates:write-sync", (event, json) => {
    try {
      if (typeof json !== "string") {
        event.returnValue = false;
        return;
      }
      const filePath = path.join(app.getPath("userData"), TEMPLATES_FILE);
      fs.writeFileSync(filePath, json, "utf8");
      event.returnValue = true;
    } catch (e) {
      console.error("card-templates write:", e);
      event.returnValue = false;
    }
  });
}

function setupAutoUpdate() {
  if (isDev) return;

  ipcMain.handle("request-quit-and-install", () => {
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on("checking-for-update", () => {
    sendStatus({ status: "checking", message: "Buscando actualizaciones..." });
  });

  autoUpdater.on("update-not-available", () => {
    sendStatus({ status: "upToDate", message: "La app está actualizada" });
  });

  autoUpdater.on("update-available", () => {
    sendStatus({
      status: "available",
      message: "Nueva versión disponible. Descargando...",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendStatus({
      status: "downloading",
      message: `Descargando... ${Math.round(progress.percent)}%`,
      progress: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendStatus({
      status: "ready",
      message: "Actualización lista. Reinicia la app para instalar.",
    });
  });

  autoUpdater.on("error", (error) => {
    console.error("Error en el auto-updater:", error);
    sendStatus({
      status: "error",
      message: error.message || "Error al buscar actualizaciones",
    });
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(async () => {
  registerCardTemplatesIpc();
  if (!fs.existsSync(OUT_DIR)) {
    console.error("Carpeta 'out' no encontrada. Ejecuta 'npm run build' primero.");
    app.quit();
    return;
  }
  const port = await createStaticServer();
  createWindow(port);
  setupAutoUpdate();
});

app.on("window-all-closed", () => {
  if (server) server.close();
  app.quit();
});
