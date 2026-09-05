import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splashAPI', {
  done: () => {
    ipcRenderer.send('splash:done');
  },
});
