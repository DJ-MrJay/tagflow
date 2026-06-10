import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../src/lib/types";
import type { TagFlowApi } from "../src/lib/types";

const api: TagFlowApi = {
  openFileDialog: () => ipcRenderer.invoke(IPC_CHANNELS.openFileDialog),
  analyzeFiles: (paths) => ipcRenderer.invoke(IPC_CHANNELS.analyzeFiles, paths),
  manualSearch: (file, input) => ipcRenderer.invoke(IPC_CHANNELS.manualSearch, file, input),
  applyTags: (file, suggestion) => ipcRenderer.invoke(IPC_CHANNELS.applyTags, file, suggestion),
};

contextBridge.exposeInMainWorld("tagFlow", api);
