"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModInstanceService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mod_manager_1 = require("./mod-manager");
class ModInstanceService {
    configDir;
    instancesFile;
    instances = [];
    activeInstanceId = null;
    constructor(configDir) {
        this.configDir = configDir;
        this.instancesFile = path_1.default.join(this.configDir, 'mod-instances.json');
        this.loadInstances();
    }
    /**
     * Load mod instances from file
     */
    loadInstances() {
        if (fs_1.default.existsSync(this.instancesFile)) {
            try {
                const data = JSON.parse(fs_1.default.readFileSync(this.instancesFile, 'utf8'));
                this.instances = data.instances || [];
                this.activeInstanceId = data.activeInstanceId || null;
            }
            catch (err) {
                console.warn('Failed to load mod instances, using defaults:', err);
                this.instances = [];
                this.activeInstanceId = null;
            }
        }
        else {
            this.instances = [];
            this.activeInstanceId = null;
            this.saveInstances();
        }
    }
    /**
     * Save mod instances to file
     */
    saveInstances() {
        try {
            if (!fs_1.default.existsSync(this.configDir)) {
                fs_1.default.mkdirSync(this.configDir, { recursive: true });
            }
            fs_1.default.writeFileSync(this.instancesFile, JSON.stringify({ instances: this.instances, activeInstanceId: this.activeInstanceId }, null, 2));
        }
        catch (err) {
            console.error('Failed to save mod instances:', err);
        }
    }
    /**
     * Get all mod instances
     */
    getInstances() {
        return [...this.instances];
    }
    /**
     * Get active mod instance
     */
    getActiveInstance() {
        if (!this.activeInstanceId) {
            return this.instances[0] || null;
        }
        return this.instances.find(i => i.id === this.activeInstanceId) || this.instances[0] || null;
    }
    /**
     * Get mod instance by ID
     */
    getInstanceById(id) {
        return this.instances.find(i => i.id === id) || null;
    }
    /**
     * Create a new mod instance
     */
    createInstance(name, minecraftVersion, modloader, modloaderVersion, description) {
        const newInstance = {
            id: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            minecraftVersion,
            modloader,
            modloaderVersion,
            mods: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            description,
        };
        this.instances.push(newInstance);
        this.activeInstanceId = newInstance.id;
        this.saveInstances();
        return newInstance;
    }
    /**
     * Delete a mod instance
     */
    deleteInstance(id) {
        const index = this.instances.findIndex(i => i.id === id);
        if (index === -1) {
            return false;
        }
        this.instances.splice(index, 1);
        if (this.activeInstanceId === id) {
            this.activeInstanceId = this.instances.length > 0 ? this.instances[0].id : null;
        }
        this.saveInstances();
        return true;
    }
    /**
     * Update a mod instance
     */
    updateInstance(id, updates) {
        const instance = this.instances.find(i => i.id === id);
        if (!instance) {
            return null;
        }
        Object.assign(instance, updates, { updatedAt: Date.now() });
        this.saveInstances();
        return instance;
    }
    /**
     * Set active mod instance
     */
    setActiveInstance(id) {
        if (this.instances.some(i => i.id === id)) {
            this.activeInstanceId = id;
            this.saveInstances();
            return true;
        }
        return false;
    }
    /**
     * Add a mod to an instance
     */
    addModToInstance(instanceId, mod) {
        const instance = this.instances.find(i => i.id === instanceId);
        if (!instance) {
            return null;
        }
        const newMod = {
            ...mod,
            id: `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            installed: false,
            enabled: true,
        };
        instance.mods.push(newMod);
        instance.updatedAt = Date.now();
        this.saveInstances();
        return newMod;
    }
    /**
     * Remove a mod from an instance
     */
    removeModFromInstance(instanceId, modId) {
        const instance = this.instances.find(i => i.id === instanceId);
        if (!instance) {
            return false;
        }
        const modIndex = instance.mods.findIndex(m => m.id === modId);
        if (modIndex === -1) {
            return false;
        }
        instance.mods.splice(modIndex, 1);
        instance.updatedAt = Date.now();
        this.saveInstances();
        return true;
    }
    /**
     * Toggle mod enabled state in an instance
     */
    toggleModInInstance(instanceId, modId) {
        const instance = this.instances.find(i => i.id === instanceId);
        if (!instance) {
            return false;
        }
        const mod = instance.mods.find(m => m.id === modId);
        if (!mod) {
            return false;
        }
        mod.enabled = !mod.enabled;
        instance.updatedAt = Date.now();
        this.saveInstances();
        return true;
    }
    /**
     * Install all mods in an instance
     */
    async installInstanceMods(instanceId, gameDir) {
        const instance = this.instances.find(i => i.id === instanceId);
        if (!instance) {
            return { success: false, installedCount: 0, errors: ['Instance not found'] };
        }
        const modsToInstall = instance.mods.filter(m => m.enabled && !m.installed);
        const total = modsToInstall.length;
        let installedCount = 0;
        const errors = [];
        for (let i = 0; i < modsToInstall.length; i++) {
            const mod = modsToInstall[i];
            try {
                const result = await mod_manager_1.ModManagerService.installMod(mod.projectId, instance.modloader, instance.minecraftVersion, gameDir, mod.source, mod.versionId);
                if (result.success) {
                    mod.installed = true;
                    mod.fileName = result.fileName;
                    if (result.versionName) {
                        mod.versionName = result.versionName;
                    }
                    installedCount++;
                }
                else {
                    errors.push(`${mod.name}: ${result.error || 'Installation failed'}`);
                }
            }
            catch (err) {
                errors.push(`${mod.name}: ${err.message || 'Unknown error'}`);
            }
        }
        instance.updatedAt = Date.now();
        this.saveInstances();
        return {
            success: errors.length === 0,
            installedCount,
            errors,
        };
    }
    /**
     * Updates a specific mod in an instance to a new version
     */
    async updateInstanceMod(instanceId, modId, versionId) {
        const instance = this.instances.find(i => i.id === instanceId);
        if (!instance) {
            return { success: false, error: 'Instance not found' };
        }
        const mod = instance.mods.find(m => m.id === modId);
        if (!mod) {
            return { success: false, error: 'Mod not found in instance' };
        }
        try {
            const settings = new (require('../services/settings').SettingsService)();
            const gameDir = settings.getSettings().gameDir;
            const instancePath = path_1.default.join(gameDir, 'instances', instanceId);
            const result = await mod_manager_1.ModManagerService.installSpecificModVersion(mod.projectId, versionId, instancePath);
            if (result.success) {
                mod.versionId = versionId;
                mod.versionName = result.versionName || versionId;
                mod.installed = true;
                mod.fileName = result.fileName;
                instance.updatedAt = Date.now();
                this.saveInstances();
                return { success: true, versionName: result.versionName };
            }
            else {
                return { success: false, error: result.error };
            }
        }
        catch (err) {
            return { success: false, error: err.message || 'Update failed' };
        }
    }
    /**
     * Get available modloader versions for a specific Minecraft version
     */
    static async getAvailableModloaderVersions(modloader, mcVersion) {
        // This is a simplified version - in a full implementation, you'd fetch from each modloader's API
        const mockVersions = {
            fabric: {
                '1.20.4': ['0.15.3', '0.15.2', '0.15.1', '0.15.0'],
                '1.20.3': ['0.14.22', '0.14.21'],
                '1.20.2': ['0.14.22'],
                '1.20.1': ['0.14.22'],
                '1.20': ['0.14.22'],
                '1.19.4': ['0.14.22'],
                '1.19': ['0.14.10'],
                '1.18.2': ['0.14.10'],
                '1.18': ['0.14.9'],
                '1.17.1': ['0.14.9'],
                '1.16.5': ['0.14.9'],
            },
            forge: {
                '1.20.4': ['48.1.0', '48.0.0'],
                '1.20.3': ['47.2.0'],
                '1.20.2': ['47.1.0'],
                '1.20.1': ['47.0.0'],
                '1.20': ['46.0.0'],
                '1.19.4': ['45.2.0'],
                '1.19': ['43.2.0'],
                '1.18.2': ['40.2.0'],
                '1.18': ['40.0.0'],
                '1.17.1': ['37.1.0'],
                '1.16.5': ['36.2.0'],
                '1.12.2': ['14.23.5.2860'],
                '1.8.9': ['11.15.1.2318'],
                '1.7.10': ['10.13.4.1614'],
            },
            neoforge: {
                '1.20.4': ['20.4.200', '20.4.199'],
                '1.20.3': ['20.3.161'],
                '1.20.2': ['20.2.82'],
                '1.20.1': ['20.1.60'],
            },
            quilt: {
                '1.20.4': ['0.10.0', '0.9.0'],
                '1.20.3': ['0.9.0'],
                '1.20.2': ['0.9.0'],
            },
            vanilla: {},
        };
        return mockVersions[modloader]?.[mcVersion] || [];
    }
    /**
     * Search for mods compatible with a specific modloader and version
     */
    static async searchModsForInstance(query, modloader, mcVersion, source = 'all') {
        const loaderParam = modloader === 'vanilla' ? 'fabric' : modloader;
        if (source === 'modrinth') {
            const modrinthResults = await mod_manager_1.ModManagerService.searchModrinth(query, loaderParam, mcVersion);
            return { modrinth: modrinthResults, curseforge: [] };
        }
        if (source === 'curseforge') {
            const curseforgeResults = await mod_manager_1.ModManagerService.searchCurseForge(query, mcVersion, loaderParam);
            return { modrinth: [], curseforge: curseforgeResults };
        }
        // source === 'all' or default
        const [modrinthResults, curseforgeResults] = await Promise.all([
            mod_manager_1.ModManagerService.searchModrinth(query, loaderParam, mcVersion),
            mod_manager_1.ModManagerService.searchCurseForge(query, mcVersion, loaderParam)
        ]);
        return { modrinth: modrinthResults, curseforge: curseforgeResults };
    }
}
exports.ModInstanceService = ModInstanceService;
