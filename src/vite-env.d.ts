/// <reference types="vite/client" />

import type { TagFlowApi } from "./lib/types";

declare global {
  interface Window {
    tagFlow: TagFlowApi;
  }
}

export {};
