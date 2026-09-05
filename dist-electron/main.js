"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const settings_1 = require("./services/settings");
const auth_1 = require("./services/auth");
const version_manifest_1 = require("./services/version-manifest");
const downloader_1 = require("./services/downloader");
const java_runtime_1 = require("./services/java-runtime");
const launcher_1 = require("./services/launcher");
const modloader_1 = require("./services/modloader");
const mod_manager_1 = require("./services/mod-manager");
const curseforge_1 = require("./services/curseforge");
const updater_1 = require("./services/updater");
// Enable autoplay for video elements without user gesture
electron_1.app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
let mainWindow = null;
let splashWindow = null;
let isMainWindowReady = false;
let isSplashFinished = false;
function getSplashPath() {
    const packagedDist = path_1.default.join(__dirname, '../dist/splash.html');
    const devPublic = path_1.default.join(__dirname, '../public/splash.html');
    const srcRenderer = path_1.default.join(__dirname, '../src/renderer/splash.html');
    if (fs_1.default.existsSync(packagedDist))
        return packagedDist;
    if (fs_1.default.existsSync(devPublic))
        return devPublic;
    if (fs_1.default.existsSync(srcRenderer))
        return srcRenderer;
    return packagedDist;
}
function showMainWindowIfReady() {
    if (isMainWindowReady && isSplashFinished) {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    }
}
function createSplashWindow() {
    splashWindow = new electron_1.BrowserWindow({
        width: 800,
        height: 450,
        transparent: true,
        frame: false,
        resizable: false,
        center: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload-splash.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const splashFile = getSplashPath();
    splashWindow.loadFile(splashFile);
    splashWindow.on('closed', () => {
        splashWindow = null;
        isSplashFinished = true;
        showMainWindowIfReady();
    });
    // Safety fallback timeout after 8 seconds
    setTimeout(() => {
        if (!isSplashFinished) {
            isSplashFinished = true;
            showMainWindowIfReady();
        }
    }, 8000);
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 750,
        minWidth: 1000,
        minHeight: 650,
        frame: false, // Frameless modern window
        backgroundColor: '#090b10',
        titleBarStyle: 'hidden',
        show: false, // Hidden until splash intro finishes
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const isDev = !electron_1.app.isPackaged && process.env.NODE_ENV !== 'production';
    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    mainWindow.once('ready-to-show', () => {
        isMainWindowReady = true;
        showMainWindowIfReady();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// IPC signal from splash video
electron_1.ipcMain.on('splash:done', () => {
    isSplashFinished = true;
    showMainWindowIfReady();
});
// Process command line arguments for --workDir
const workDirArg = process.argv.find(arg => arg.startsWith('--workDir='));
let customWorkDir;
if (workDirArg) {
    customWorkDir = workDirArg.split('=')[1];
    // Resolve environment variables like %appdata% on Windows
    if (process.platform === 'win32') {
        customWorkDir = customWorkDir.replace(/%appdata%/gi, process.env.APPDATA || '');
        customWorkDir = customWorkDir.replace(/%localappdata%/gi, process.env.LOCALAPPDATA || '');
    }
}
// Initialize SettingsService with custom workDir if provided
const authService = new auth_1.AuthService();
const settingsService = customWorkDir
    ? new settings_1.SettingsService(customWorkDir)
    : new settings_1.SettingsService();
// Initialize services that depend on settingsService
const manifestService = new version_manifest_1.VersionManifestService(settingsService.getConfigDir());
const modInstanceService = new (require('./services/mod-instance').ModInstanceService)(settingsService.getConfigDir());
const downloaderService = new downloader_1.DownloaderService();
const javaRuntimeService = new java_runtime_1.JavaRuntimeService();
const launcherService = new launcher_1.LauncherService();
const updaterService = new updater_1.UpdaterService();
let currentLaunchStatus = { state: 'idle' };
// Ensure single instance lock
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', (_, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
        // Process --workDir from second instance
        const secondWorkDirArg = argv.find(arg => arg.startsWith('--workDir='));
        if (secondWorkDirArg) {
            const workDir = secondWorkDirArg.split('=')[1];
            if (process.platform === 'win32') {
                const resolved = workDir.replace(/%appdata%/gi, process.env.APPDATA || '');
                settingsService.saveSettings({ gameDir: resolved });
            }
            else {
                settingsService.saveSettings({ gameDir: workDir });
            }
        }
    });
    electron_1.app.whenReady().then(() => {
        createSplashWindow();
        createMainWindow();
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                createMainWindow();
                if (mainWindow)
                    mainWindow.show();
            }
        });
        // Auto-check for updates on startup (in background)
        setTimeout(async () => {
            try {
                const updateInfo = await updaterService.checkForUpdates();
                if (updateInfo.available) {
                    console.log(`[Radon Client] Update available: v${updateInfo.latestVersion}`);
                    if (mainWindow) {
                        mainWindow.webContents.send('updater:updateAvailable', updateInfo);
                    }
                }
            }
            catch (err) {
                console.warn('[Radon Client] Auto-update check failed:', err);
            }
        }, 5000);
    });
}
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// ==========================================
// IPC HANDLERS
// ==========================================
// Window Actions
electron_1.ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});
electron_1.ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    }
    else {
        mainWindow?.maximize();
    }
});
electron_1.ipcMain.handle('window:close', () => {
    mainWindow?.close();
});
// Auth Handlers
electron_1.ipcMain.handle('auth:loginWithMicrosoft', async () => {
    try {
        const account = await authService.loginWithMicrosoft();
        settingsService.saveAccount(account, true);
        return { success: true, account };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('auth:createOfflineAccount', (_event, username) => {
    try {
        const account = authService.createOfflineAccount(username);
        settingsService.saveAccount(account, true);
        return { success: true, account };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('auth:getAccounts', () => {
    return settingsService.getAccounts();
});
electron_1.ipcMain.handle('auth:setActiveAccount', (_event, id) => {
    settingsService.setActiveAccount(id);
    return { success: true };
});
electron_1.ipcMain.handle('auth:refreshAccount', async (_event, id) => {
    try {
        const allAccounts = settingsService.getAccounts().accounts;
        const targetAccount = id ? allAccounts.find(a => a.id === id) : settingsService.getActiveAccount();
        if (!targetAccount) {
            return { success: false, error: 'Account not found' };
        }
        if (targetAccount.type !== 'msa' || !targetAccount.refreshToken) {
            return { success: true, account: targetAccount };
        }
        const refreshed = await authService.refreshAccount(targetAccount);
        settingsService.saveAccount(refreshed, targetAccount.id === settingsService.getActiveAccount()?.id);
        return { success: true, account: refreshed };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('auth:removeAccount', (_event, id) => {
    settingsService.removeAccount(id);
    return { success: true };
});
// Versions Handlers
electron_1.ipcMain.handle('versions:getManifest', async (_event, force = false) => {
    try {
        const manifest = await manifestService.getManifest(force);
        return { success: true, manifest };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
electron_1.ipcMain.handle('versions:getInstalled', () => {
    const gameDir = settingsService.getSettings().gameDir;
    const versionsDir = path_1.default.join(gameDir, 'versions');
    if (!fs_1.default.existsSync(versionsDir))
        return [];
    try {
        const items = fs_1.default.readdirSync(versionsDir);
        const installed = [];
        for (const item of items) {
            const jarPath = path_1.default.join(versionsDir, item, `${item}.jar`);
            const jsonPath = path_1.default.join(versionsDir, item, `${item}.json`);
            if (fs_1.default.existsSync(jarPath) && fs_1.default.existsSync(jsonPath)) {
                installed.push(item);
            }
        }
        return installed;
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('versions:delete', (_event, id) => {
    const gameDir = settingsService.getSettings().gameDir;
    const versionDir = path_1.default.join(gameDir, 'versions', id);
    try {
        if (fs_1.default.existsSync(versionDir)) {
            fs_1.default.rmSync(versionDir, { recursive: true, force: true });
        }
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
});
// Settings & Mods Handlers
electron_1.ipcMain.handle('settings:getSettings', () => {
    return settingsService.getSettings();
});
electron_1.ipcMain.handle('settings:saveSettings', (_event, newSettings) => {
    return settingsService.saveSettings(newSettings);
});
electron_1.ipcMain.handle('settings:getMods', () => {
    return settingsService.getMods();
});
electron_1.ipcMain.handle('settings:saveMods', (_event, newMods) => {
    return settingsService.saveMods(newMods);
});
electron_1.ipcMain.handle('settings:selectDirectory', async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
electron_1.ipcMain.handle('settings:selectJavaFile', async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Java Executable', extensions: ['exe'] }],
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
// Servers Handlers
electron_1.ipcMain.handle('servers:getServers', () => {
    return settingsService.getServers();
});
electron_1.ipcMain.handle('servers:addServer', (_event, server) => {
    settingsService.addServer(server);
    return { success: true };
});
electron_1.ipcMain.handle('servers:removeServer', (_event, id) => {
    settingsService.removeServer(id);
    return { success: true };
});
electron_1.ipcMain.handle('system:openFolder', (_event, folderPath) => {
    if (fs_1.default.existsSync(folderPath)) {
        electron_1.shell.openPath(folderPath);
    }
});
electron_1.ipcMain.handle('mods:searchModrinth', async (_event, query, loader, gameVersion, category, index) => {
    return await mod_manager_1.ModManagerService.searchModrinth(query, loader, gameVersion, category, index);
});
electron_1.ipcMain.handle('mods:installMod', async (_event, projectId, loader, gameVersion, source, versionId) => {
    const gameDir = settingsService.getSettings().gameDir;
    return await mod_manager_1.ModManagerService.installMod(projectId, loader, gameVersion, gameDir, source || 'modrinth', versionId);
});
electron_1.ipcMain.handle('mods:installSpecificModVersion', async (_event, projectId, versionId) => {
    const gameDir = settingsService.getSettings().gameDir;
    return await mod_manager_1.ModManagerService.installSpecificModVersion(projectId, versionId, gameDir);
});
electron_1.ipcMain.handle('mods:getModVersions', async (_event, projectId, loader, gameVersion) => {
    return await mod_manager_1.ModManagerService.getModVersions(projectId, loader, gameVersion);
});
electron_1.ipcMain.handle('mods:openModPage', async (_event, source, projectId) => {
    mod_manager_1.ModManagerService.openModPage(source, projectId);
});
electron_1.ipcMain.handle('mods:checkForModUpdates', async (_event, loader, gameVersion) => {
    const gameDir = settingsService.getSettings().gameDir;
    return await mod_manager_1.ModManagerService.checkForModUpdates(gameDir, loader, gameVersion);
});
electron_1.ipcMain.handle('mods:updateMod', async (_event, projectId, loader, gameVersion, source) => {
    const gameDir = settingsService.getSettings().gameDir;
    return await mod_manager_1.ModManagerService.updateMod(projectId, loader, gameVersion, gameDir, source || 'modrinth');
});
electron_1.ipcMain.handle('mods:handleDroppedModFiles', async (_event, files) => {
    const gameDir = settingsService.getSettings().gameDir;
    return await mod_manager_1.ModManagerService.handleDroppedModFiles(files, gameDir);
});
// Mod Instances Handlers
electron_1.ipcMain.handle('modInstances:getInstances', () => {
    return modInstanceService.getInstances();
});
electron_1.ipcMain.handle('modInstances:getActiveInstance', () => {
    return modInstanceService.getActiveInstance();
});
electron_1.ipcMain.handle('modInstances:getInstanceById', (_event, id) => {
    return modInstanceService.getInstanceById(id);
});
electron_1.ipcMain.handle('modInstances:createInstance', (_event, name, mcVersion, modloader, modloaderVersion, description) => {
    return modInstanceService.createInstance(name, mcVersion, modloader, modloaderVersion, description);
});
electron_1.ipcMain.handle('modInstances:deleteInstance', (_event, id) => {
    return modInstanceService.deleteInstance(id);
});
electron_1.ipcMain.handle('modInstances:updateInstance', (_event, id, updates) => {
    return modInstanceService.updateInstance(id, updates);
});
electron_1.ipcMain.handle('modInstances:setActiveInstance', (_event, id) => {
    return modInstanceService.setActiveInstance(id);
});
electron_1.ipcMain.handle('modInstances:addModToInstance', (_event, instanceId, mod) => {
    return modInstanceService.addModToInstance(instanceId, mod);
});
electron_1.ipcMain.handle('modInstances:removeModFromInstance', (_event, instanceId, modId) => {
    return modInstanceService.removeModFromInstance(instanceId, modId);
});
electron_1.ipcMain.handle('modInstances:toggleModInInstance', (_event, instanceId, modId) => {
    return modInstanceService.toggleModInInstance(instanceId, modId);
});
electron_1.ipcMain.handle('modInstances:installInstanceMods', async (_event, instanceId) => {
    const settings = settingsService.getSettings();
    const instancePath = path_1.default.join(settings.gameDir, 'instances', instanceId);
    return await modInstanceService.installInstanceMods(instanceId, instancePath);
});
electron_1.ipcMain.handle('modInstances:getModloaderVersions', async (_event, modloader, mcVersion) => {
    return await require('./services/mod-instance').ModInstanceService.getAvailableModloaderVersions(modloader, mcVersion);
});
electron_1.ipcMain.handle('modInstances:searchModsForInstance', async (_event, query, modloader, mcVersion, source) => {
    return await require('./services/mod-instance').ModInstanceService.searchModsForInstance(query, modloader, mcVersion, source);
});
electron_1.ipcMain.handle('modInstances:getModVersionsForInstance', async (_event, instanceId, projectId) => {
    const instance = modInstanceService.getInstanceById(instanceId);
    if (!instance) {
        return [];
    }
    return await mod_manager_1.ModManagerService.getModVersions(projectId, instance.modloader, instance.minecraftVersion);
});
electron_1.ipcMain.handle('modInstances:updateInstanceMod', async (_event, instanceId, modId, versionId) => {
    return await modInstanceService.updateInstanceMod(instanceId, modId, versionId);
});
electron_1.ipcMain.handle('mods:searchCurseForge', async (_event, query, gameVersion, modLoader, categoryId, sortField, page) => {
    return await mod_manager_1.ModManagerService.searchCurseForge(query || '', gameVersion || '', modLoader || '', categoryId || 0, sortField || 5, page || 0);
});
electron_1.ipcMain.handle('mods:searchAll', async (_event, query, loader, gameVersion, source, category, index) => {
    return await mod_manager_1.ModManagerService.searchAll(query || '', loader || 'fabric', gameVersion || '1.20.4', source || 'all', category, index);
});
electron_1.ipcMain.handle('mods:getCurseForgeCategories', async () => {
    return await curseforge_1.CurseForgeService.getCategories();
});
electron_1.ipcMain.handle('mods:getModloaderVersions', async (_event, modloader, mcVersion) => {
    if (modloader === 'forge') {
        const versions = await modloader_1.ModloaderService.getForgeVersions(mcVersion || '1.20.4');
        return { success: true, versions };
    }
    else if (modloader === 'neoforge') {
        const versions = await modloader_1.ModloaderService.getNeoForgeVersions(mcVersion || '1.20.4');
        return { success: true, versions: versions.map(v => ({ version: v.version, stable: v.release })) };
    }
    return { success: true, versions: [] };
});
// Update Handlers
electron_1.ipcMain.handle('updater:check', async () => {
    return await updaterService.checkForUpdates();
});
electron_1.ipcMain.handle('updater:download', async (_event, downloadUrl) => {
    return await updaterService.installUpdate(downloadUrl);
});
electron_1.ipcMain.handle('updater:getCurrentVersion', () => {
    return updaterService.getLocalVersion();
});
electron_1.ipcMain.handle('updater:getLatestVersion', async () => {
    return await updaterService.getLatestVersion();
});
electron_1.ipcMain.handle('mods:getInstalled', () => {
    const gameDir = settingsService.getSettings().gameDir;
    return mod_manager_1.ModManagerService.getInstalledMods(gameDir);
});
electron_1.ipcMain.handle('mods:toggleMod', (_event, fileName) => {
    const gameDir = settingsService.getSettings().gameDir;
    return mod_manager_1.ModManagerService.toggleMod(fileName, gameDir);
});
electron_1.ipcMain.handle('mods:deleteMod', (_event, fileName) => {
    const gameDir = settingsService.getSettings().gameDir;
    return mod_manager_1.ModManagerService.deleteMod(fileName, gameDir);
});
electron_1.ipcMain.handle('mods:openModsFolder', () => {
    const gameDir = settingsService.getSettings().gameDir;
    mod_manager_1.ModManagerService.openModsFolder(gameDir);
    return { success: true };
});
// Launcher Handlers
electron_1.ipcMain.handle('launcher:killProcess', () => {
    const killed = launcherService.killProcess();
    if (killed) {
        currentLaunchStatus = { state: 'finished' };
        mainWindow?.webContents.send('launcher:status', currentLaunchStatus);
    }
    return { success: killed };
});
electron_1.ipcMain.handle('launcher:launch', async (_event, versionId, serverToJoin) => {
    try {
        const settings = settingsService.getSettings();
        let account = settingsService.getActiveAccount();
        if (!account) {
            throw new Error('No Minecraft profile selected. Please log in or create an offline profile.');
        }
        // Auto-refresh Microsoft Account if expired or expiring within 15 minutes
        if (account.type === 'msa' && account.refreshToken) {
            const isExpiringSoon = !account.expiresAt || (account.expiresAt - Date.now() < 15 * 60 * 1000);
            if (isExpiringSoon) {
                try {
                    console.log('[Radon Client] Refreshing Microsoft session before launch for Essential & Mojang auth...');
                    const refreshed = await authService.refreshAccount(account);
                    settingsService.saveAccount(refreshed, true);
                    account = refreshed;
                }
                catch (refreshErr) {
                    console.warn('[Radon Client] Warning: Failed to refresh MSA token before launch:', refreshErr);
                }
            }
        }
        // Synchronize launcher_accounts.json and launcher_profiles.json in game directory for Essential & mod compatibility
        auth_1.AuthService.syncLauncherAccounts(settings.gameDir, account, settingsService.getAccounts().accounts);
        currentLaunchStatus = { state: 'preparing' };
        mainWindow?.webContents.send('launcher:status', currentLaunchStatus);
        // 1. Fetch base version detail
        const baseVersionDetail = await manifestService.getVersionDetail(versionId, settings.gameDir);
        // 2. Resolve Modloader (Fabric / Quilt / Vanilla)
        const versionDetail = await modloader_1.ModloaderService.resolveModloaderVersion(baseVersionDetail, settings.modloader || 'vanilla', settings.gameDir);
        // 3. Download files (JAR, libraries, natives, assets)
        currentLaunchStatus = { state: 'downloading' };
        mainWindow?.webContents.send('launcher:status', currentLaunchStatus);
        await downloaderService.downloadVersion(versionDetail, settings.gameDir, (progress) => {
            mainWindow?.webContents.send('download:progress', progress);
        });
        // 4. Ensure Java Runtime
        const requiredJava = java_runtime_1.JavaRuntimeService.getRequiredComponent(versionDetail.javaVersion, baseVersionDetail.id);
        const javaPath = await javaRuntimeService.ensureJava(settings.gameDir, requiredJava.component, requiredJava.major, settings.customJavaPath, (progress) => {
            mainWindow?.webContents.send('download:progress', progress);
        });
        // 5. Launch Game
        await launcherService.launch(javaPath, versionDetail, account, settings, serverToJoin, (log) => {
            mainWindow?.webContents.send('launcher:log', log);
        }, (status) => {
            currentLaunchStatus = status;
            mainWindow?.webContents.send('launcher:status', status);
        });
        return { success: true };
    }
    catch (err) {
        console.error('Launch Error:', err);
        currentLaunchStatus = { state: 'crashed', error: err.message };
        mainWindow?.webContents.send('launcher:status', currentLaunchStatus);
        return { success: false, error: err.message };
    }
});
