"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  },
  // 获取窗口位置
  getWindowPosition: () => {
    return electron.ipcRenderer.invoke("get-window-position");
  },
  // 设置窗口位置
  moveWindow: (x, y) => {
    electron.ipcRenderer.send("move-window", x, y);
  }
  // You can expose other APTs you need here.
  // ...
});
