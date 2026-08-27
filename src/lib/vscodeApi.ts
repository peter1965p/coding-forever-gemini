// src/lib/vscodeApi.ts
declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

export const vscode = acquireVsCodeApi();