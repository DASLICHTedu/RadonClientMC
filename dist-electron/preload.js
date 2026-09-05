"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API = void 0;
const electron_1 = require("electron");
exports.API = {
    // Window Controls
    window: {
        minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
        maximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
        close: () => electron_1.ipcRenderer.invoke('window:close'),
    },
    // Authentication
    auth: {
        loginWithMicrosoft: () => electron_1.ipcRenderer.invoke('auth:loginWithMicrosoft'),
        createOfflineAccount: (username) => electron_1.ipcRenderer.invoke('auth:createOfflineAccount', username),
        getAccounts: () => electron_1.ipcRenderer.invoke('auth:getAccounts'),
        setActiveAccount: (id) => electron_1.ipcRenderer.invoke('auth:setActiveAccount', id),
        removeAccount: (id) => electron_1.ipcRenderer.invoke('auth:removeAccount', id),
        refreshAccount: (id) => electron_1.ipcRenderer.invoke('auth:refreshAccount', id),
    },
    // Versions & Manifest
    versions: {
        getManifest: (force = false) => electron_1.ipcRenderer.invoke('versions:getManifest', force),
        getInstalledVersions: () => electron_1.ipcRenderer.invoke('versions:getInstalled'),
        deleteVersion: (id) => electron_1.ipcRenderer.invoke('versions:delete', id),
    },
    // Launch & Process
    launcher: {
        launch: (versionId, serverToJoin) => electron_1.ipcRenderer.invoke('launcher:launch', versionId, serverToJoin),
        killProcess: () => electron_1.ipcRenderer.invoke('launcher:killProcess'),
    },
    // Settings & Mods
    settings: {
        getSettings: () => electron_1.ipcRenderer.invoke('settings:getSettings'),
        saveSettings: (settings) => electron_1.ipcRenderer.invoke('settings:saveSettings', settings),
        getMods: () => electron_1.ipcRenderer.invoke('settings:getMods'),
        saveMods: (mods) => electron_1.ipcRenderer.invoke('settings:saveMods', mods),
        selectDirectory: () => electron_1.ipcRenderer.invoke('settings:selectDirectory'),
        selectJavaFile: () => electron_1.ipcRenderer.invoke('settings:selectJavaFile'),
    },
    // Servers
    servers: {
        getServers: () => electron_1.ipcRenderer.invoke('servers:getServers'),
        addServer: (server) => electron_1.ipcRenderer.invoke('servers:addServer', server),
        removeServer: (id) => electron_1.ipcRenderer.invoke('servers:removeServer', id),
    },
    // Modloader & Mod Management
    modsManager: {
        searchModrinth: (query, loader, gameVersion, category, index) => electron_1.ipcRenderer.invoke('mods:searchModrinth', query, loader, gameVersion, category, index),
        searchCurseForge: (query, gameVersion, modLoader, categoryId, sortField, page) => electron_1.ipcRenderer.invoke('mods:searchCurseForge', query, gameVersion, modLoader, categoryId, sortField, page),
        searchAll: (query, loader, gameVersion, source, category, index) => electron_1.ipcRenderer.invoke('mods:searchAll', query, loader, gameVersion, source, category, index),
        installMod: (projectId, loader, gameVersion, source, versionId) => electron_1.ipcRenderer.invoke('mods:installMod', projectId, loader, gameVersion, source, versionId),
        installSpecificModVersion: (projectId, versionId) => electron_1.ipcRenderer.invoke('mods:installSpecificModVersion', projectId, versionId),
        getModVersions: (projectId, loader, gameVersion) => electron_1.ipcRenderer.invoke('mods:getModVersions', projectId, loader, gameVersion),
        getInstalledMods: () => electron_1.ipcRenderer.invoke('mods:getInstalled'),
        toggleMod: (fileName) => electron_1.ipcRenderer.invoke('mods:toggleMod', fileName),
        deleteMod: (fileName) => electron_1.ipcRenderer.invoke('mods:deleteMod', fileName),
        openModsFolder: () => electron_1.ipcRenderer.invoke('mods:openModsFolder'),
        openModPage: (source, projectId) => electron_1.ipcRenderer.invoke('mods:openModPage', source, projectId),
        getCurseForgeCategories: () => electron_1.ipcRenderer.invoke('mods:getCurseForgeCategories'),
        getModloaderVersions: (modloader, mcVersion) => electron_1.ipcRenderer.invoke('mods:getModloaderVersions', modloader, mcVersion),
        checkForModUpdates: (loader, gameVersion) => electron_1.ipcRenderer.invoke('mods:checkForModUpdates', loader, gameVersion),
        updateMod: (projectId, loader, gameVersion, source) => electron_1.ipcRenderer.invoke('mods:updateMod', projectId, loader, gameVersion, source),
        handleDroppedModFiles: (files) => electron_1.ipcRenderer.invoke('mods:handleDroppedModFiles', files),
    },
    // Mod Instances
    modInstances: {
        getInstances: () => electron_1.ipcRenderer.invoke('modInstances:getInstances'),
        getActiveInstance: () => electron_1.ipcRenderer.invoke('modInstances:getActiveInstance'),
        getInstanceById: (id) => electron_1.ipcRenderer.invoke('modInstances:getInstanceById', id),
        createInstance: (name, mcVersion, modloader, modloaderVersion, description) => electron_1.ipcRenderer.invoke('modInstances:createInstance', name, mcVersion, modloader, modloaderVersion, description),
        deleteInstance: (id) => electron_1.ipcRenderer.invoke('modInstances:deleteInstance', id),
        updateInstance: (id, updates) => electron_1.ipcRenderer.invoke('modInstances:updateInstance', id, updates),
        setActiveInstance: (id) => electron_1.ipcRenderer.invoke('modInstances:setActiveInstance', id),
        addModToInstance: (instanceId, mod) => electron_1.ipcRenderer.invoke('modInstances:addModToInstance', instanceId, mod),
        removeModFromInstance: (instanceId, modId) => electron_1.ipcRenderer.invoke('modInstances:removeModFromInstance', instanceId, modId),
        toggleModInInstance: (instanceId, modId) => electron_1.ipcRenderer.invoke('modInstances:toggleModInInstance', instanceId, modId),
        installInstanceMods: (instanceId) => electron_1.ipcRenderer.invoke('modInstances:installInstanceMods', instanceId),
        getModloaderVersions: (modloader, mcVersion) => electron_1.ipcRenderer.invoke('modInstances:getModloaderVersions', modloader, mcVersion),
        searchModsForInstance: (query, modloader, mcVersion, source) => electron_1.ipcRenderer.invoke('modInstances:searchModsForInstance', query, modloader, mcVersion, source || 'all'),
        getModVersionsForInstance: (instanceId, projectId) => electron_1.ipcRenderer.invoke('modInstances:getModVersionsForInstance', instanceId, projectId),
        updateInstanceMod: (instanceId, modId, versionId) => electron_1.ipcRenderer.invoke('modInstances:updateInstanceMod', instanceId, modId, versionId),
    },
    // Auto-Updater
    updater: {
        check: () => electron_1.ipcRenderer.invoke('updater:check'),
        download: (downloadUrl) => electron_1.ipcRenderer.invoke('updater:download', downloadUrl),
        getCurrentVersion: () => electron_1.ipcRenderer.invoke('updater:getCurrentVersion'),
        getLatestVersion: () => electron_1.ipcRenderer.invoke('updater:getLatestVersion'),
        onUpdateAvailable: (callback) => {
            const subscription = (_event, data) => callback(data);
            electron_1.ipcRenderer.on('updater:updateAvailable', subscription);
            return () => electron_1.ipcRenderer.removeListener('updater:updateAvailable', subscription);
        },
    },
    // System & Files
    system: {
        openFolder: (folderPath) => electron_1.ipcRenderer.invoke('system:openFolder', folderPath),
    },
    // Event Listeners from Main process
    onDownloadProgress: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('download:progress', subscription);
        return () => electron_1.ipcRenderer.removeListener('download:progress', subscription);
    },
    onLogMessage: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('launcher:log', subscription);
        return () => electron_1.ipcRenderer.removeListener('launcher:log', subscription);
    },
    onLaunchStatus: (callback) => {
        const subscription = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('launcher:status', subscription);
        return () => electron_1.ipcRenderer.removeListener('launcher:status', subscription);
    },
};
electron_1.contextBridge.exposeInMainWorld('radon', exports.API);
