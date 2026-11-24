/* eslint @typescript-eslint/no-require-imports: "off" */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dynarockDesktop", {
    notify: (input) => ipcRenderer.invoke("dynarock:notify", input),
});
