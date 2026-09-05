import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { SettingsService } from './services/settings';
import { AuthService } from './services/auth';
import { VersionManifestService } from './services/version-manifest';
import { DownloaderService } from './services/downloader';
import { JavaRuntimeService } from './services/java-runtime';
import { LauncherService } from './services/launcher';
import { LaunchStatus, ModSourceType, ModloaderType } from './types';
import { ModloaderService } from './services/modloader';
import { ModManagerService } from './services/mod-manager';
import { CurseForgeService } from './services/curseforge';
import { UpdaterService } from './services/updater';

// Enable autoplay for video elements without user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let isMainWindowReady = false;
let isSplashFinished = false;

function getSplashPath(): string {
  const packagedDist = path.join(__dirname, '../dist/splash.html');
  const devPublic = path.join(__dirname, '../public/splash.html');
  const srcRenderer = path.join(__dirname, '../src/renderer/splash.html');

  if (fs.existsSync(packagedDist)) return packagedDist;
  if (fs.existsSync(devPublic)) return devPublic;
  if (fs.existsSync(srcRenderer)) return srcRenderer;
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
  splashWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'preload-splash.js'),
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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    frame: false, // Frameless modern window
    backgroundColor: '#090b10',
    titleBarStyle: 'hidden',
    show: false, // Hidden until splash intro finishes
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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
ipcMain.on('splash:done', () => {
  isSplashFinished = true;
  showMainWindowIfReady();
});

// Process command line arguments for --workDir
const workDirArg = process.argv.find(arg => arg.startsWith('--workDir='));
let customWorkDir: string | undefined;
if (workDirArg) {
  customWorkDir = workDirArg.split('=')[1];
  // Resolve environment variables like %appdata% on Windows
  if (process.platform === 'win32') {
    customWorkDir = customWorkDir.replace(/%appdata%/gi, process.env.APPDATA || '');
    customWorkDir = customWorkDir.replace(/%localappdata%/gi, process.env.LOCALAPPDATA || '');
  }
}

// Initialize SettingsService with custom workDir if provided
const authService = new AuthService();
const settingsService: SettingsService = customWorkDir 
  ? new SettingsService(customWorkDir)
  : new SettingsService();

// Initialize services that depend on settingsService
const manifestService = new VersionManifestService(settingsService.getConfigDir());
const modInstanceService = new (require('./services/mod-instance').ModInstanceService)(settingsService.getConfigDir());
const downloaderService = new DownloaderService();
const javaRuntimeService = new JavaRuntimeService();
const launcherService = new LauncherService();
const updaterService = new UpdaterService();

let currentLaunchStatus: LaunchStatus = { state: 'idle' };

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Process --workDir from second instance
    const secondWorkDirArg = argv.find(arg => arg.startsWith('--workDir='));
    if (secondWorkDirArg) {
      const workDir = secondWorkDirArg.split('=')[1];
      if (process.platform === 'win32') {
        const resolved = workDir.replace(/%appdata%/gi, process.env.APPDATA || '');
        settingsService.saveSettings({ gameDir: resolved });
      } else {
        settingsService.saveSettings({ gameDir: workDir });
      }
    }
  });

  app.whenReady().then(() => {
    createSplashWindow();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        if (mainWindow) mainWindow.show();
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
      } catch (err) {
        console.warn('[Radon Client] Auto-update check failed:', err);
      }
    }, 5000);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC HANDLERS
// ==========================================

// Window Actions
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

// Auth Handlers
ipcMain.handle('auth:loginWithMicrosoft', async () => {
  try {
    const account = await authService.loginWithMicrosoft();
    settingsService.saveAccount(account, true);
    return { success: true, account };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:createOfflineAccount', (_event, username: string) => {
  try {
    const account = authService.createOfflineAccount(username);
    settingsService.saveAccount(account, true);
    return { success: true, account };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:getAccounts', () => {
  return settingsService.getAccounts();
});

ipcMain.handle('auth:setActiveAccount', (_event, id: string) => {
  settingsService.setActiveAccount(id);
  return { success: true };
});

ipcMain.handle('auth:refreshAccount', async (_event, id?: string) => {
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
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:removeAccount', (_event, id: string) => {
  settingsService.removeAccount(id);
  return { success: true };
});

// Versions Handlers
ipcMain.handle('versions:getManifest', async (_event, force = false) => {
  try {
    const manifest = await manifestService.getManifest(force);
    return { success: true, manifest };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('versions:getInstalled', () => {
  const gameDir = settingsService.getSettings().gameDir;
  const versionsDir = path.join(gameDir, 'versions');
  if (!fs.existsSync(versionsDir)) return [];

  try {
    const items = fs.readdirSync(versionsDir);
    const installed: string[] = [];
    for (const item of items) {
      const jarPath = path.join(versionsDir, item, `${item}.jar`);
      const jsonPath = path.join(versionsDir, item, `${item}.json`);
      if (fs.existsSync(jarPath) && fs.existsSync(jsonPath)) {
        installed.push(item);
      }
    }
    return installed;
  } catch {
    return [];
  }
});

ipcMain.handle('versions:delete', (_event, id: string) => {
  const gameDir = settingsService.getSettings().gameDir;
  const versionDir = path.join(gameDir, 'versions', id);
  try {
    if (fs.existsSync(versionDir)) {
      fs.rmSync(versionDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Settings & Mods Handlers
ipcMain.handle('settings:getSettings', () => {
  return settingsService.getSettings();
});

ipcMain.handle('settings:saveSettings', (_event, newSettings) => {
  return settingsService.saveSettings(newSettings);
});

ipcMain.handle('settings:getMods', () => {
  return settingsService.getMods();
});

ipcMain.handle('settings:saveMods', (_event, newMods) => {
  return settingsService.saveMods(newMods);
});

ipcMain.handle('settings:selectDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('settings:selectJavaFile', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Java Executable', extensions: ['exe'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Servers Handlers
ipcMain.handle('servers:getServers', () => {
  return settingsService.getServers();
});

ipcMain.handle('servers:addServer', (_event, server) => {
  settingsService.addServer(server);
  return { success: true };
});

ipcMain.handle('servers:removeServer', (_event, id: string) => {
  settingsService.removeServer(id);
  return { success: true };
});

ipcMain.handle('system:openFolder', (_event, folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

ipcMain.handle('mods:searchModrinth', async (_event, query?: string, loader?: string, gameVersion?: string, category?: string, index?: string) => {
  return await ModManagerService.searchModrinth(query, loader, gameVersion, category, index);
});

ipcMain.handle('mods:installMod', async (_event, projectId: string, loader: string, gameVersion: string, source?: ModSourceType, versionId?: string) => {
  const gameDir = settingsService.getSettings().gameDir;
  return await ModManagerService.installMod(projectId, loader, gameVersion, gameDir, source || 'modrinth', versionId);
});

ipcMain.handle('mods:installSpecificModVersion', async (_event, projectId: string, versionId: string) => {
  const gameDir = settingsService.getSettings().gameDir;
  return await ModManagerService.installSpecificModVersion(projectId, versionId, gameDir);
});

ipcMain.handle('mods:getModVersions', async (_event, projectId: string, loader?: string, gameVersion?: string) => {
  return await ModManagerService.getModVersions(projectId, loader, gameVersion);
});

ipcMain.handle('mods:openModPage', async (_event, source: ModSourceType, projectId: string) => {
  ModManagerService.openModPage(source, projectId);
});

ipcMain.handle('mods:checkForModUpdates', async (_event, loader: string, gameVersion: string) => {
  const gameDir = settingsService.getSettings().gameDir;
  return await ModManagerService.checkForModUpdates(gameDir, loader, gameVersion);
});

ipcMain.handle('mods:updateMod', async (_event, projectId: string, loader: string, gameVersion: string, source?: ModSourceType) => {
  const gameDir = settingsService.getSettings().gameDir;
  return await ModManagerService.updateMod(projectId, loader, gameVersion, gameDir, source || 'modrinth');
});

ipcMain.handle('mods:handleDroppedModFiles', async (_event, files: string[]) => {
  const gameDir = settingsService.getSettings().gameDir;
  return await ModManagerService.handleDroppedModFiles(files, gameDir);
});

// Mod Instances Handlers
ipcMain.handle('modInstances:getInstances', () => {
  return modInstanceService.getInstances();
});

ipcMain.handle('modInstances:getActiveInstance', () => {
  return modInstanceService.getActiveInstance();
});

ipcMain.handle('modInstances:getInstanceById', (_event, id: string) => {
  return modInstanceService.getInstanceById(id);
});

ipcMain.handle('modInstances:createInstance', (_event, name: string, mcVersion: string, modloader: string, modloaderVersion?: string, description?: string) => {
  return modInstanceService.createInstance(name, mcVersion, modloader as any, modloaderVersion, description);
});

ipcMain.handle('modInstances:deleteInstance', (_event, id: string) => {
  return modInstanceService.deleteInstance(id);
});

ipcMain.handle('modInstances:updateInstance', (_event, id: string, updates: any) => {
  return modInstanceService.updateInstance(id, updates);
});

ipcMain.handle('modInstances:setActiveInstance', (_event, id: string) => {
  return modInstanceService.setActiveInstance(id);
});

ipcMain.handle('modInstances:addModToInstance', (_event, instanceId: string, mod: any) => {
  return modInstanceService.addModToInstance(instanceId, mod);
});

ipcMain.handle('modInstances:removeModFromInstance', (_event, instanceId: string, modId: string) => {
  return modInstanceService.removeModFromInstance(instanceId, modId);
});

ipcMain.handle('modInstances:toggleModInInstance', (_event, instanceId: string, modId: string) => {
  return modInstanceService.toggleModInInstance(instanceId, modId);
});

ipcMain.handle('modInstances:installInstanceMods', async (_event, instanceId: string) => {
  const settings = settingsService.getSettings();
  const instancePath = path.join(settings.gameDir, 'instances', instanceId);
  return await modInstanceService.installInstanceMods(instanceId, instancePath);
});

ipcMain.handle('modInstances:getModloaderVersions', async (_event, modloader: string, mcVersion: string) => {
  return await require('./services/mod-instance').ModInstanceService.getAvailableModloaderVersions(modloader as any, mcVersion);
});

ipcMain.handle('modInstances:searchModsForInstance', async (_event, query: string, modloader: string, mcVersion: string, source: string) => {
  return await require('./services/mod-instance').ModInstanceService.searchModsForInstance(query, modloader as any, mcVersion, source as any);
});

ipcMain.handle('modInstances:getModVersionsForInstance', async (_event, instanceId: string, projectId: string) => {
  const instance = modInstanceService.getInstanceById(instanceId);
  if (!instance) {
    return [];
  }
  return await ModManagerService.getModVersions(projectId, instance.modloader, instance.minecraftVersion);
});

ipcMain.handle('modInstances:updateInstanceMod', async (_event, instanceId: string, modId: string, versionId: string) => {
  return await modInstanceService.updateInstanceMod(instanceId, modId, versionId);
});

ipcMain.handle('mods:searchCurseForge', async (_event, query?: string, gameVersion?: string, modLoader?: string, categoryId?: number, sortField?: number, page?: number) => {
  return await ModManagerService.searchCurseForge(query || '', gameVersion || '', modLoader || '', categoryId || 0, sortField || 5, page || 0);
});

ipcMain.handle('mods:searchAll', async (_event, query?: string, loader?: string, gameVersion?: string, source?: ModSourceType | 'all', category?: string, index?: string) => {
  return await ModManagerService.searchAll(query || '', loader || 'fabric', gameVersion || '1.20.4', source || 'all', category, index);
});

ipcMain.handle('mods:getCurseForgeCategories', async () => {
  return await CurseForgeService.getCategories();
});

ipcMain.handle('mods:getModloaderVersions', async (_event, modloader: ModloaderType, mcVersion?: string) => {
  if (modloader === 'forge') {
    const versions = await ModloaderService.getForgeVersions(mcVersion || '1.20.4');
    return { success: true, versions };
  } else if (modloader === 'neoforge') {
    const versions = await ModloaderService.getNeoForgeVersions(mcVersion || '1.20.4');
    return { success: true, versions: versions.map(v => ({ version: v.version, stable: v.release })) };
  }
  return { success: true, versions: [] };
});

// Update Handlers
ipcMain.handle('updater:check', async () => {
  return await updaterService.checkForUpdates();
});

ipcMain.handle('updater:download', async (_event, downloadUrl: string) => {
  return await updaterService.installUpdate(downloadUrl);
});

ipcMain.handle('updater:getCurrentVersion', () => {
  return updaterService.getLocalVersion();
});

ipcMain.handle('updater:getLatestVersion', async () => {
  return await updaterService.getLatestVersion();
});

ipcMain.handle('mods:getInstalled', () => {
  const gameDir = settingsService.getSettings().gameDir;
  return ModManagerService.getInstalledMods(gameDir);
});

ipcMain.handle('mods:toggleMod', (_event, fileName: string) => {
  const gameDir = settingsService.getSettings().gameDir;
  return ModManagerService.toggleMod(fileName, gameDir);
});

ipcMain.handle('mods:deleteMod', (_event, fileName: string) => {
  const gameDir = settingsService.getSettings().gameDir;
  return ModManagerService.deleteMod(fileName, gameDir);
});

ipcMain.handle('mods:openModsFolder', () => {
  const gameDir = settingsService.getSettings().gameDir;
  ModManagerService.openModsFolder(gameDir);
  return { success: true };
});

// Launcher Handlers
ipcMain.handle('launcher:killProcess', () => {
  const killed = launcherService.killProcess();
  if (killed) {
    currentLaunchStatus = { state: 'finished' };
    mainWindow?.webContents.send('launcher:status', currentLaunchStatus);
  }
  return { success: killed };
});

ipcMain.handle('launcher:launch', async (_event, versionId: string, serverToJoin?: { address: string }) => {
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
        } catch (refreshErr) {
          console.warn('[Radon Client] Warning: Failed to refresh MSA token before launch:', refreshErr);
        }
      }
    }

    // Synchronize launcher_accounts.json and launcher_profiles.json in game directory for Essential & mod compatibility
    AuthService.syncLauncherAccounts(settings.gameDir, account, settingsService.getAccounts().accounts);

    currentLaunchStatus = { state: 'preparing' };
    mainWindow?.webContents.send('launcher:status', currentLaunchStatus);

    // 1. Fetch base version detail
    const baseVersionDetail = await manifestService.getVersionDetail(versionId, settings.gameDir);

    // 2. Resolve Modloader (Fabric / Quilt / Vanilla)
    const versionDetail = await ModloaderService.resolveModloaderVersion(
      baseVersionDetail,
      settings.modloader || 'vanilla',
      settings.gameDir
    );

    // 3. Download files (JAR, libraries, natives, assets)
    currentLaunchStatus = { state: 'downloading' };
    mainWindow?.webContents.send('launcher:status', currentLaunchStatus);

    await downloaderService.downloadVersion(versionDetail, settings.gameDir, (progress) => {
      mainWindow?.webContents.send('download:progress', progress);
    });

    // 4. Ensure Java Runtime
    const requiredJava = JavaRuntimeService.getRequiredComponent(versionDetail.javaVersion, baseVersionDetail.id);
    const javaPath = await javaRuntimeService.ensureJava(
      settings.gameDir,
      requiredJava.component,
      requiredJava.major,
      settings.customJavaPath,
      (progress) => {
        mainWindow?.webContents.send('download:progress', progress);
      }
    );

    // 5. Launch Game
    await launcherService.launch(
      javaPath,
      versionDetail,
      account,
      settings,
      serverToJoin,
      (log) => {
        mainWindow?.webContents.send('launcher:log', log);
      },
      (status) => {
        currentLaunchStatus = status;
        mainWindow?.webContents.send('launcher:status', status);
      }
    );

    return { success: true };
  } catch (err: any) {
    console.error('Launch Error:', err);
    currentLaunchStatus = { state: 'crashed', error: err.message };
    mainWindow?.webContents.send('launcher:status', currentLaunchStatus);
    return { success: false, error: err.message };
  }
});
