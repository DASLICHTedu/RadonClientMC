import fs from 'fs';
import path from 'path';
import os from 'os';
import { LaunchSettings, ModSettings, MinecraftAccount, ServerEntry } from '../types';

export class SettingsService {
  private configDir: string;
  private settingsFile: string;
  private accountsFile: string;
  private serversFile: string;

  private settings: LaunchSettings;
  private mods: ModSettings;
  private accounts: MinecraftAccount[] = [];
  private activeAccountId: string | null = null;
  private servers: ServerEntry[] = [];

  constructor(customConfigDir?: string) {
    this.configDir = customConfigDir || path.join(os.homedir(), '.radonclient');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    this.settingsFile = path.join(this.configDir, 'settings.json');
    this.accountsFile = path.join(this.configDir, 'accounts.json');
    this.serversFile = path.join(this.configDir, 'servers.json');

    // Default settings
    // Use the global Minecraft directory for the current platform
    const getGlobalMinecraftDir = (): string => {
      const homedir = os.homedir();
      switch (process.platform) {
        case 'win32':
          return path.join(homedir, 'AppData', 'Roaming', '.minecraft');
        case 'darwin': // macOS
          return path.join(homedir, 'Library', 'Application Support', 'minecraft');
        case 'linux':
        default:
          return path.join(homedir, '.minecraft');
      }
    };

    this.settings = {
      ramMin: 1024,
      ramMax: 4096,
      resolutionWidth: 1280,
      resolutionHeight: 720,
      fullscreen: false,
      customJavaPath: '',
      jvmArgs: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
      gameDir: getGlobalMinecraftDir(),
      modloader: 'vanilla',
    };

    // Default Lunar-style mods
    this.mods = {
      cpsCounter: true,
      fpsDisplay: true,
      keystrokes: true,
      armorStatus: true,
      directionHud: false,
      fullbright: false,
      reachDisplay: false,
      customCrosshair: false,
      pingDisplay: true,
      motionBlur: false,
      timeChanger: false,
    };

    this.loadAll();
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getSettings(): LaunchSettings {
    return { ...this.settings };
  }

  public saveSettings(newSettings: Partial<LaunchSettings>): LaunchSettings {
    this.settings = { ...this.settings, ...newSettings };
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify({ settings: this.settings, mods: this.mods }, null, 2));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
    return this.settings;
  }

  public getMods(): ModSettings {
    return { ...this.mods };
  }

  public saveMods(newMods: Partial<ModSettings>): ModSettings {
    this.mods = { ...this.mods, ...newMods };
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify({ settings: this.settings, mods: this.mods }, null, 2));
    } catch (err) {
      console.error('Failed to save mods:', err);
    }
    return this.mods;
  }

  public getAccounts(): { accounts: MinecraftAccount[]; activeAccountId: string | null } {
    return { accounts: [...this.accounts], activeAccountId: this.activeAccountId };
  }

  public getActiveAccount(): MinecraftAccount | null {
    if (!this.activeAccountId) {
      return this.accounts[0] || null;
    }
    return this.accounts.find(a => a.id === this.activeAccountId) || this.accounts[0] || null;
  }

  public saveAccount(account: MinecraftAccount, setActive = true): void {
    const existingIndex = this.accounts.findIndex(a => a.id === account.id || a.uuid === account.uuid);
    if (existingIndex >= 0) {
      this.accounts[existingIndex] = account;
    } else {
      this.accounts.push(account);
    }
    if (setActive) {
      this.activeAccountId = account.id;
    }
    this.saveAccountsToFile();
  }

  public removeAccount(id: string): void {
    this.accounts = this.accounts.filter(a => a.id !== id);
    if (this.activeAccountId === id) {
      this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].id : null;
    }
    this.saveAccountsToFile();
  }

  public setActiveAccount(id: string): void {
    if (this.accounts.some(a => a.id === id)) {
      this.activeAccountId = id;
      this.saveAccountsToFile();
    }
  }

  public getServers(): ServerEntry[] {
    return [...this.servers];
  }

  public addServer(server: ServerEntry): void {
    this.servers.push(server);
    this.saveServersToFile();
  }

  public removeServer(id: string): void {
    this.servers = this.servers.filter(s => s.id !== id);
    this.saveServersToFile();
  }

  private loadAll(): void {
    // Load Settings & Mods
    if (fs.existsSync(this.settingsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
        if (data.settings) this.settings = { ...this.settings, ...data.settings };
        if (data.mods) this.mods = { ...this.mods, ...data.mods };
      } catch (err) {
        console.warn('Failed to parse settings.json, resetting to defaults', err);
      }
    }

    // Load Accounts
    if (fs.existsSync(this.accountsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.accountsFile, 'utf8'));
        if (Array.isArray(data.accounts)) this.accounts = data.accounts;
        if (data.activeAccountId) this.activeAccountId = data.activeAccountId;
      } catch (err) {
        console.warn('Failed to parse accounts.json', err);
      }
    }

    // Default accounts if none exist (provide a default Dev/Offline account)
    if (this.accounts.length === 0) {
      const defaultAccount: MinecraftAccount = {
        id: 'offline_steve',
        username: 'RadonPlayer',
        uuid: '00000000-0000-0000-0000-000000000000',
        accessToken: 'radon_offline_token',
        type: 'offline',
        skinUrl: 'https://minotar.net/skin/MHF_Steve',
      };
      this.accounts.push(defaultAccount);
      this.activeAccountId = defaultAccount.id;
      this.saveAccountsToFile();
    }

    // Load Servers
    if (fs.existsSync(this.serversFile)) {
      try {
        this.servers = JSON.parse(fs.readFileSync(this.serversFile, 'utf8'));
      } catch (err) {
        console.warn('Failed to parse servers.json', err);
      }
    }

    if (this.servers.length === 0) {
      this.servers = [
        { id: 'hypixel', name: 'Hypixel Network', address: 'mc.hypixel.net', featured: true, version: '1.8.9+' },
        { id: 'lunar', name: 'Lunar Network', address: 'lunar.gg', featured: true, version: '1.8.9' },
        { id: 'pvpland', name: 'PvP Land', address: 'pvp.land', featured: true, version: '1.8.9' },
        { id: 'gommehd', name: 'GommeHD.net', address: 'gommehd.net', featured: true, version: '1.8 - 1.21' },
        { id: 'minemen', name: 'Minemen Club', address: 'minemen.club', featured: true, version: '1.8.9' },
        { id: 'cubecraft', name: 'CubeCraft Games', address: 'play.cubecraft.net', featured: true, version: '1.20+' },
      ];
      this.saveServersToFile();
    }
  }

  private saveAccountsToFile(): void {
    try {
      fs.writeFileSync(
        this.accountsFile,
        JSON.stringify({ accounts: this.accounts, activeAccountId: this.activeAccountId }, null, 2)
      );
    } catch (err) {
      console.error('Failed to save accounts:', err);
    }
  }

  private saveServersToFile(): void {
    try {
      fs.writeFileSync(this.serversFile, JSON.stringify(this.servers, null, 2));
    } catch (err) {
      console.error('Failed to save servers:', err);
    }
  }
}

