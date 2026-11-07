import { contextBridge } from 'electron';

if (process.argv.includes('--disposabl-desktop-auth'))
  contextBridge.exposeInMainWorld('disposablDesktop', { authentication: true });
