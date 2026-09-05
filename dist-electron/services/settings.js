"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class SettingsService {
    configDir;
    settingsFile;
    accountsFile;
    serversFile;
    settings;
    mods;
    accounts = [];
    activeAccountId = null;
    servers = [];
    constructor(customConfigDir) {
        this.configDir = customConfigDir || path_1.default.join(os_1.default.homedir(), '.radonclient');
        if (!fs_1.default.existsSync(this.configDir)) {
            fs_1.default.mkdirSync(this.configDir, { recursive: true });
        }
        this.settingsFile = path_1.default.join(this.configDir, 'settings.json');
        this.accountsFile = path_1.default.join(this.configDir, 'accounts.json');
        this.serversFile = path_1.default.join(this.configDir, 'servers.json');
        // Default settings
        // Use the global Minecraft directory for the current platform
        const getGlobalMinecraftDir = () => {
            const homedir = os_1.default.homedir();
            switch (process.platform) {
                case 'win32':
                    return path_1.default.join(homedir, 'AppData', 'Roaming', '.minecraft');
                case 'darwin': // macOS
                    return path_1.default.join(homedir, 'Library', 'Application Support', 'minecraft');
                case 'linux':
                default:
                    return path_1.default.join(homedir, '.minecraft');
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
    getConfigDir() {
        return this.configDir;
    }
    getSettings() {
        return { ...this.settings };
    }
    saveSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        try {
            fs_1.default.writeFileSync(this.settingsFile, JSON.stringify({ settings: this.settings, mods: this.mods }, null, 2));
        }
        catch (err) {
            console.error('Failed to save settings:', err);
        }
        return this.settings;
    }
    getMods() {
        return { ...this.mods };
    }
    saveMods(newMods) {
        this.mods = { ...this.mods, ...newMods };
        try {
            fs_1.default.writeFileSync(this.settingsFile, JSON.stringify({ settings: this.settings, mods: this.mods }, null, 2));
        }
        catch (err) {
            console.error('Failed to save mods:', err);
        }
        return this.mods;
    }
    getAccounts() {
        return { accounts: [...this.accounts], activeAccountId: this.activeAccountId };
    }
    getActiveAccount() {
        if (!this.activeAccountId) {
            return this.accounts[0] || null;
        }
        return this.accounts.find(a => a.id === this.activeAccountId) || this.accounts[0] || null;
    }
    saveAccount(account, setActive = true) {
        const existingIndex = this.accounts.findIndex(a => a.id === account.id || a.uuid === account.uuid);
        if (existingIndex >= 0) {
            this.accounts[existingIndex] = account;
        }
        else {
            this.accounts.push(account);
        }
        if (setActive) {
            this.activeAccountId = account.id;
        }
        this.saveAccountsToFile();
    }
    removeAccount(id) {
        this.accounts = this.accounts.filter(a => a.id !== id);
        if (this.activeAccountId === id) {
            this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].id : null;
        }
        this.saveAccountsToFile();
    }
    setActiveAccount(id) {
        if (this.accounts.some(a => a.id === id)) {
            this.activeAccountId = id;
            this.saveAccountsToFile();
        }
    }
    getServers() {
        return [...this.servers];
    }
    addServer(server) {
        this.servers.push(server);
        this.saveServersToFile();
    }
    removeServer(id) {
        this.servers = this.servers.filter(s => s.id !== id);
        this.saveServersToFile();
    }
    loadAll() {
        // Load Settings & Mods
        if (fs_1.default.existsSync(this.settingsFile)) {
            try {
                const data = JSON.parse(fs_1.default.readFileSync(this.settingsFile, 'utf8'));
                if (data.settings)
                    this.settings = { ...this.settings, ...data.settings };
                if (data.mods)
                    this.mods = { ...this.mods, ...data.mods };
            }
            catch (err) {
                console.warn('Failed to parse settings.json, resetting to defaults', err);
            }
        }
        // Load Accounts
        if (fs_1.default.existsSync(this.accountsFile)) {
            try {
                const data = JSON.parse(fs_1.default.readFileSync(this.accountsFile, 'utf8'));
                if (Array.isArray(data.accounts))
                    this.accounts = data.accounts;
                if (data.activeAccountId)
                    this.activeAccountId = data.activeAccountId;
            }
            catch (err) {
                console.warn('Failed to parse accounts.json', err);
            }
        }
        // Default accounts if none exist (provide a default Dev/Offline account)
        if (this.accounts.length === 0) {
            const defaultAccount = {
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
        if (fs_1.default.existsSync(this.serversFile)) {
            try {
                this.servers = JSON.parse(fs_1.default.readFileSync(this.serversFile, 'utf8'));
            }
            catch (err) {
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
    saveAccountsToFile() {
        try {
            fs_1.default.writeFileSync(this.accountsFile, JSON.stringify({ accounts: this.accounts, activeAccountId: this.activeAccountId }, null, 2));
        }
        catch (err) {
            console.error('Failed to save accounts:', err);
        }
    }
    saveServersToFile() {
        try {
            fs_1.default.writeFileSync(this.serversFile, JSON.stringify(this.servers, null, 2));
        }
        catch (err) {
            console.error('Failed to save servers:', err);
        }
    }
}
exports.SettingsService = SettingsService;
