import { contextBridge, ipcRenderer } from 'electron';
import { LaunchSettings, ModSettings, MinecraftAccount, ServerEntry, DownloadProgress, LogMessage, LaunchStatus, ModSourceType, ModloaderType, UpdateInfo, VersionInfo, ModInstance, ModInstanceMod, ModInstanceSettings, ModVersionInfo, ModUpdateInfo } from './types';

export const API = {
  // Window Controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // Authentication
  auth: {
    loginWithMicrosoft: () => ipcRenderer.invoke('auth:loginWithMicrosoft'),
    createOfflineAccount: (username: string) => ipcRenderer.invoke('auth:createOfflineAccount', username),
    getAccounts: () => ipcRenderer.invoke('auth:getAccounts'),
    setActiveAccount: (id: string) => ipcRenderer.invoke('auth:setActiveAccount', id),
    removeAccount: (id: string) => ipcRenderer.invoke('auth:removeAccount', id),
    refreshAccount: (id?: string) => ipcRenderer.invoke('auth:refreshAccount', id),
  },

  // Versions & Manifest
  versions: {
    getManifest: (force = false) => ipcRenderer.invoke('versions:getManifest', force),
    getInstalledVersions: () => ipcRenderer.invoke('versions:getInstalled'),
    deleteVersion: (id: string) => ipcRenderer.invoke('versions:delete', id),
  },

  // Launch & Process
  launcher: {
    launch: (versionId: string, serverToJoin?: { address: string }) =>
      ipcRenderer.invoke('launcher:launch', versionId, serverToJoin),
    killProcess: () => ipcRenderer.invoke('launcher:killProcess'),
  },

  // Settings & Mods
  settings: {
    getSettings: () => ipcRenderer.invoke('settings:getSettings'),
    saveSettings: (settings: Partial<LaunchSettings>) => ipcRenderer.invoke('settings:saveSettings', settings),
    getMods: () => ipcRenderer.invoke('settings:getMods'),
    saveMods: (mods: Partial<ModSettings>) => ipcRenderer.invoke('settings:saveMods', mods),
    selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory'),
    selectJavaFile: () => ipcRenderer.invoke('settings:selectJavaFile'),
  },

  // Servers
  servers: {
    getServers: () => ipcRenderer.invoke('servers:getServers'),
    addServer: (server: ServerEntry) => ipcRenderer.invoke('servers:addServer', server),
    removeServer: (id: string) => ipcRenderer.invoke('servers:removeServer', id),
  },

  // Modloader & Mod Management
  modsManager: {
    searchModrinth: (query: string, loader?: string, gameVersion?: string, category?: string, index?: string) =>
      ipcRenderer.invoke('mods:searchModrinth', query, loader, gameVersion, category, index),
    searchCurseForge: (query?: string, gameVersion?: string, modLoader?: string, categoryId?: number, sortField?: number, page?: number) =>
      ipcRenderer.invoke('mods:searchCurseForge', query, gameVersion, modLoader, categoryId, sortField, page),
    searchAll: (query?: string, loader?: string, gameVersion?: string, source?: ModSourceType | 'all', category?: string, index?: string) =>
      ipcRenderer.invoke('mods:searchAll', query, loader, gameVersion, source, category, index),
    installMod: (projectId: string, loader: string, gameVersion: string, source?: ModSourceType, versionId?: string) =>
      ipcRenderer.invoke('mods:installMod', projectId, loader, gameVersion, source, versionId),
    installSpecificModVersion: (projectId: string, versionId: string) =>
      ipcRenderer.invoke('mods:installSpecificModVersion', projectId, versionId),
    getModVersions: (projectId: string, loader?: string, gameVersion?: string) =>
      ipcRenderer.invoke('mods:getModVersions', projectId, loader, gameVersion),
    getInstalledMods: () => ipcRenderer.invoke('mods:getInstalled'),
    toggleMod: (fileName: string) => ipcRenderer.invoke('mods:toggleMod', fileName),
    deleteMod: (fileName: string) => ipcRenderer.invoke('mods:deleteMod', fileName),
    openModsFolder: () => ipcRenderer.invoke('mods:openModsFolder'),
    openModPage: (source: ModSourceType, projectId: string) =>
      ipcRenderer.invoke('mods:openModPage', source, projectId),
    getCurseForgeCategories: () => ipcRenderer.invoke('mods:getCurseForgeCategories'),
    getModloaderVersions: (modloader: ModloaderType, mcVersion?: string) =>
      ipcRenderer.invoke('mods:getModloaderVersions', modloader, mcVersion),
    checkForModUpdates: (loader: string, gameVersion: string) =>
      ipcRenderer.invoke('mods:checkForModUpdates', loader, gameVersion),
    updateMod: (projectId: string, loader: string, gameVersion: string, source?: ModSourceType) =>
      ipcRenderer.invoke('mods:updateMod', projectId, loader, gameVersion, source),
    handleDroppedModFiles: (files: string[]) =>
      ipcRenderer.invoke('mods:handleDroppedModFiles', files),
  },

  // Mod Instances
  modInstances: {
    getInstances: () => ipcRenderer.invoke('modInstances:getInstances'),
    getActiveInstance: () => ipcRenderer.invoke('modInstances:getActiveInstance'),
    getInstanceById: (id: string) => ipcRenderer.invoke('modInstances:getInstanceById', id),
    createInstance: (name: string, mcVersion: string, modloader: ModloaderType, modloaderVersion?: string, description?: string) =>
      ipcRenderer.invoke('modInstances:createInstance', name, mcVersion, modloader, modloaderVersion, description),
    deleteInstance: (id: string) => ipcRenderer.invoke('modInstances:deleteInstance', id),
    updateInstance: (id: string, updates: Partial<ModInstance>) =>
      ipcRenderer.invoke('modInstances:updateInstance', id, updates),
    setActiveInstance: (id: string) => ipcRenderer.invoke('modInstances:setActiveInstance', id),
    addModToInstance: (instanceId: string, mod: Omit<ModInstanceMod, 'id'>) =>
      ipcRenderer.invoke('modInstances:addModToInstance', instanceId, mod),
    removeModFromInstance: (instanceId: string, modId: string) =>
      ipcRenderer.invoke('modInstances:removeModFromInstance', instanceId, modId),
    toggleModInInstance: (instanceId: string, modId: string) =>
      ipcRenderer.invoke('modInstances:toggleModInInstance', instanceId, modId),
    installInstanceMods: (instanceId: string) =>
      ipcRenderer.invoke('modInstances:installInstanceMods', instanceId),
    getModloaderVersions: (modloader: ModloaderType, mcVersion: string) =>
      ipcRenderer.invoke('modInstances:getModloaderVersions', modloader, mcVersion),
    searchModsForInstance: (query: string, modloader: ModloaderType, mcVersion: string, source?: ModSourceType | 'all') =>
      ipcRenderer.invoke('modInstances:searchModsForInstance', query, modloader, mcVersion, source || 'all'),
    getModVersionsForInstance: (instanceId: string, projectId: string) =>
      ipcRenderer.invoke('modInstances:getModVersionsForInstance', instanceId, projectId),
    updateInstanceMod: (instanceId: string, modId: string, versionId: string) =>
      ipcRenderer.invoke('modInstances:updateInstanceMod', instanceId, modId, versionId),
  },

  // Auto-Updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: (downloadUrl: string) => ipcRenderer.invoke('updater:download', downloadUrl),
    getCurrentVersion: () => ipcRenderer.invoke('updater:getCurrentVersion'),
    getLatestVersion: () => ipcRenderer.invoke('updater:getLatestVersion'),
    onUpdateAvailable: (callback: (updateInfo: UpdateInfo) => void) => {
      const subscription = (_event: any, data: UpdateInfo) => callback(data);
      ipcRenderer.on('updater:updateAvailable', subscription);
      return () => ipcRenderer.removeListener('updater:updateAvailable', subscription);
    },
  },

  // System & Files
  system: {
    openFolder: (folderPath: string) => ipcRenderer.invoke('system:openFolder', folderPath),
  },

  // Event Listeners from Main process
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const subscription = (_event: any, data: DownloadProgress) => callback(data);
    ipcRenderer.on('download:progress', subscription);
    return () => ipcRenderer.removeListener('download:progress', subscription);
  },

  onLogMessage: (callback: (log: LogMessage) => void) => {
    const subscription = (_event: any, data: LogMessage) => callback(data);
    ipcRenderer.on('launcher:log', subscription);
    return () => ipcRenderer.removeListener('launcher:log', subscription);
  },

  onLaunchStatus: (callback: (status: LaunchStatus) => void) => {
    const subscription = (_event: any, data: LaunchStatus) => callback(data);
    ipcRenderer.on('launcher:status', subscription);
    return () => ipcRenderer.removeListener('launcher:status', subscription);
  },
};

contextBridge.exposeInMainWorld('radon', API);

export type RadonAPI = typeof API;

