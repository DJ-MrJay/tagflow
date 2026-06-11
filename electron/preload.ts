import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNELS } from "../src/lib/types";
import type { TagFlowApi, TagFlowMenuAction } from "../src/lib/types";

const api: TagFlowApi = {
  openFileDialog: () => ipcRenderer.invoke(IPC_CHANNELS.openFileDialog),
  openReadme: () => ipcRenderer.invoke(IPC_CHANNELS.openReadme),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  analyzeFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.analyzeFiles, paths),
  getCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.getCapabilities),
  onMenuAction: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, action: TagFlowMenuAction) => {
      listener(action);
    };

    ipcRenderer.on(IPC_CHANNELS.menuAction, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.menuAction, handler);
    };
  },
  manualSearch: (file, input) => ipcRenderer.invoke(IPC_CHANNELS.manualSearch, file, input),
  applyTags: (file, suggestion) => ipcRenderer.invoke(IPC_CHANNELS.applyTags, file, suggestion),
};

contextBridge.exposeInMainWorld("tagFlow", api);
