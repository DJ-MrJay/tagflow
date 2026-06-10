import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { analyzeFiles, runManualSearch } from "./file-service";
import { applyTagsToFile } from "./tag-service";
import { IPC_CHANNELS } from "../src/lib/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  window.loadFile(path.join(__dirname, "../dist/index.html"));
}

function registerIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.openFileDialog);
  ipcMain.removeHandler(IPC_CHANNELS.analyzeFiles);
  ipcMain.removeHandler(IPC_CHANNELS.manualSearch);
  ipcMain.removeHandler(IPC_CHANNELS.applyTags);

  ipcMain.handle(IPC_CHANNELS.openFileDialog, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Audio Files",
          extensions: ["mp3", "m4a", "flac"],
        },
      ],
    });

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC_CHANNELS.analyzeFiles, async (_event, paths: string[]) => {
    return analyzeFiles(paths);
  });

  ipcMain.handle(IPC_CHANNELS.manualSearch, async (_event, file, input) => {
    return runManualSearch(file, input);
  });

  ipcMain.handle(IPC_CHANNELS.applyTags, async (_event, file, suggestion) => {
    return applyTagsToFile(file, suggestion);
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
