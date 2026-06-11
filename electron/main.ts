import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BaseWindow,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { analyzeFiles, getLookupCapabilities, runManualSearch } from "./file-service";
import { applyTagsToFile } from "./tag-service";
import { IPC_CHANNELS } from "../src/lib/types";
import type { TagFlowMenuAction } from "../src/lib/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devIconPath = path.join(process.cwd(), "build", "TagFlow.ico");
const readmePath = path.join(process.cwd(), "README.md");

function dispatchMenuAction(
  action: TagFlowMenuAction,
  browserWindow?: BaseWindow | BrowserWindow | null,
): void {
  const target =
    browserWindow && "webContents" in browserWindow
      ? browserWindow
      : BrowserWindow.getFocusedWindow();
  target?.webContents.send(IPC_CHANNELS.menuAction, action);
}

function createApplicationMenu(): void {
  const capabilities = getLookupCapabilities();
  const template: MenuItemConstructorOptions[] = [
    {
      label: "&File",
      submenu: [
        {
          label: "&Open Files...",
          accelerator: "Ctrl+O",
          click: (_item, browserWindow) => dispatchMenuAction("file:open", browserWindow),
        },
        {
          label: "&Save Tag",
          accelerator: "Ctrl+S",
          click: (_item, browserWindow) =>
            dispatchMenuAction("file:apply-selected", browserWindow),
        },
        {
          label: "Save All High &Confidence",
          accelerator: "Ctrl+Shift+S",
          click: (_item, browserWindow) =>
            dispatchMenuAction("file:apply-high-confidence", browserWindow),
        },
        {
          type: "separator",
        },
        {
          role: "quit",
          label: "E&xit",
        },
      ],
    },
    {
      label: "&Edit",
      submenu: [
        {
          role: "undo",
        },
        {
          role: "redo",
        },
        {
          type: "separator",
        },
        {
          role: "cut",
        },
        {
          role: "copy",
        },
        {
          role: "paste",
        },
        {
          type: "separator",
        },
        {
          role: "selectAll",
        },
      ],
    },
    {
      label: "&View",
      submenu: [
        {
          label: "&Filter",
          accelerator: "F3",
          click: (_item, browserWindow) =>
            dispatchMenuAction("view:toggle-filter", browserWindow),
        },
        {
          label: "&Tag Panel",
          click: (_item, browserWindow) =>
            dispatchMenuAction("view:toggle-tag-panel", browserWindow),
        },
        {
          label: "&Toggle Theme",
          click: (_item, browserWindow) =>
            dispatchMenuAction("view:toggle-theme", browserWindow),
        },
      ],
    },
    {
      label: "&Convert",
      submenu: [
        {
          label: "&Tag - Filename",
          enabled: false,
        },
        {
          label: "&Filename - Tag",
          enabled: false,
        },
        {
          label: "F&ilename - Filename",
          enabled: false,
        },
      ],
    },
    {
      label: "&Actions",
      submenu: [
        {
          label: "Search &Manually...",
          accelerator: "Ctrl+M",
          click: (_item, browserWindow) =>
            dispatchMenuAction("actions:manual-search", browserWindow),
        },
        {
          label: "&Skip Selected",
          accelerator: "Delete",
          click: (_item, browserWindow) =>
            dispatchMenuAction("actions:skip-selected", browserWindow),
        },
      ],
    },
    {
      label: "&Tag Sources",
      submenu: [
        {
          label: "&Auto Lookup",
          accelerator: "Ctrl+I",
          click: (_item, browserWindow) => dispatchMenuAction("tags:auto", browserWindow),
        },
        {
          label: "&Apple Music / iTunes",
          click: (_item, browserWindow) => dispatchMenuAction("tags:apple", browserWindow),
        },
        {
          label: "&Spotify",
          enabled: capabilities.spotifyLookup,
          click: (_item, browserWindow) =>
            dispatchMenuAction("tags:spotify", browserWindow),
        },
      ],
    },
    {
      label: "&Tools",
      submenu: [
        {
          label: "Spotify Lookup Ready",
          enabled: false,
          visible: capabilities.spotifyLookup,
        },
        {
          label: "Apple Lookup Only",
          enabled: false,
          visible: !capabilities.spotifyLookup,
        },
      ],
    },
    {
      label: "&Help",
      submenu: [
        {
          label: "&Project README",
          click: async () => {
            await shell.openPath(readmePath);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#0f1115",
    icon: app.isPackaged ? undefined : devIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.openFileDialog);
  ipcMain.removeHandler(IPC_CHANNELS.analyzeFiles);
  ipcMain.removeHandler(IPC_CHANNELS.manualSearch);
  ipcMain.removeHandler(IPC_CHANNELS.applyTags);
  ipcMain.removeHandler(IPC_CHANNELS.getCapabilities);
  ipcMain.removeHandler(IPC_CHANNELS.openReadme);

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

  ipcMain.handle(IPC_CHANNELS.getCapabilities, async () => {
    return getLookupCapabilities();
  });

  ipcMain.handle(IPC_CHANNELS.openReadme, async () => {
    await shell.openPath(readmePath);
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
  createApplicationMenu();
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
