"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModloaderService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
class ModloaderService {
    static FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions/loader';
    static QUILT_META_URL = 'https://meta.quiltmc.org/v3/versions/loader';
    static FORGE_MAVEN_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge';
    static FORGE_INSTALLER_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
    static NEOFORGE_MAVEN_URL = 'https://maven.neoforged.net/releases/net/neoforged';
    /**
     * Resolves and merges a modloader (Fabric/Quilt/Forge/NeoForge) into the base Minecraft VersionDetail
     */
    static async resolveModloaderVersion(baseVersion, modloader, gameDir) {
        if (modloader === 'vanilla') {
            return baseVersion;
        }
        if (modloader === 'fabric') {
            return await ModloaderService.resolveFabric(baseVersion, gameDir);
        }
        if (modloader === 'quilt') {
            return await ModloaderService.resolveQuilt(baseVersion, gameDir);
        }
        if (modloader === 'forge') {
            return await ModloaderService.resolveForge(baseVersion, gameDir);
        }
        if (modloader === 'neoforge') {
            return await ModloaderService.resolveNeoForge(baseVersion, gameDir);
        }
        // Fallback: return baseVersion
        return baseVersion;
    }
    /**
     * Fetch Fabric profile and merge libraries/mainClass with base Minecraft version
     */
    static async resolveFabric(baseVersion, gameDir) {
        const gameVersion = baseVersion.id;
        try {
            // 1. Get latest compatible loader version
            const loadersRes = await axios_1.default.get(`${ModloaderService.FABRIC_META_URL}/${gameVersion}`, { timeout: 8000 });
            if (!loadersRes.data || loadersRes.data.length === 0) {
                console.warn(`No official Fabric Loader found for Minecraft ${gameVersion}. Falling back to Vanilla.`);
                return baseVersion;
            }
            const latestLoader = loadersRes.data[0].loader.version;
            // 2. Fetch full Fabric profile JSON
            const profileUrl = `${ModloaderService.FABRIC_META_URL}/${gameVersion}/${latestLoader}/profile/json`;
            const profileRes = await axios_1.default.get(profileUrl, { timeout: 8000 });
            const fabricProfile = profileRes.data;
            // 3. Merge libraries and mainClass
            const mergedLibraries = [...baseVersion.libraries];
            for (const lib of fabricProfile.libraries || []) {
                // Convert Fabric library format to standard library format if needed
                mergedLibraries.push(lib);
            }
            // Save local modloader version json
            const fabricVersionId = `fabric-loader-${latestLoader}-${gameVersion}`;
            const fabricVersionDir = path_1.default.join(gameDir, 'versions', fabricVersionId);
            if (!fs_1.default.existsSync(fabricVersionDir)) {
                fs_1.default.mkdirSync(fabricVersionDir, { recursive: true });
            }
            const mergedDetail = {
                ...baseVersion,
                id: fabricVersionId,
                inheritsFrom: gameVersion,
                mainClass: fabricProfile.mainClass || 'net.fabricmc.loader.impl.launch.knot.KnotClient',
                libraries: mergedLibraries,
                arguments: {
                    jvm: [
                        ...(baseVersion.arguments?.jvm || []),
                        ...(fabricProfile.arguments?.jvm || []),
                    ],
                    game: [
                        ...(baseVersion.arguments?.game || []),
                        ...(fabricProfile.arguments?.game || []),
                    ],
                },
            };
            fs_1.default.writeFileSync(path_1.default.join(fabricVersionDir, `${fabricVersionId}.json`), JSON.stringify(mergedDetail, null, 2));
            return mergedDetail;
        }
        catch (err) {
            console.warn('Failed to resolve Fabric profile, falling back to Vanilla:', err);
            return baseVersion;
        }
    }
    /**
     * Fetch Quilt profile and merge with base Minecraft version
     */
    static async resolveQuilt(baseVersion, gameDir) {
        const gameVersion = baseVersion.id;
        try {
            const loadersRes = await axios_1.default.get(`${ModloaderService.QUILT_META_URL}/${gameVersion}`, { timeout: 8000 });
            if (!loadersRes.data || loadersRes.data.length === 0) {
                return baseVersion;
            }
            const latestLoader = loadersRes.data[0].loader.version;
            const profileUrl = `${ModloaderService.QUILT_META_URL}/${gameVersion}/${latestLoader}/profile/json`;
            const profileRes = await axios_1.default.get(profileUrl, { timeout: 8000 });
            const quiltProfile = profileRes.data;
            const mergedLibraries = [...baseVersion.libraries, ...(quiltProfile.libraries || [])];
            const quiltVersionId = `quilt-loader-${latestLoader}-${gameVersion}`;
            const quiltVersionDir = path_1.default.join(gameDir, 'versions', quiltVersionId);
            if (!fs_1.default.existsSync(quiltVersionDir)) {
                fs_1.default.mkdirSync(quiltVersionDir, { recursive: true });
            }
            const mergedDetail = {
                ...baseVersion,
                id: quiltVersionId,
                inheritsFrom: gameVersion,
                mainClass: quiltProfile.mainClass || 'org.quiltmc.loader.impl.launch.knot.KnotClient',
                libraries: mergedLibraries,
            };
            fs_1.default.writeFileSync(path_1.default.join(quiltVersionDir, `${quiltVersionId}.json`), JSON.stringify(mergedDetail, null, 2));
            return mergedDetail;
        }
        catch (err) {
            console.warn('Failed to resolve Quilt profile:', err);
            return baseVersion;
        }
    }
    /**
     * Fetch Forge installer and create version profile
     * Uses the official Forge installer which contains the version JSON
     */
    static async resolveForge(baseVersion, gameDir) {
        const gameVersion = baseVersion.id;
        try {
            // Get Forge version list for this Minecraft version
            const forgeVersions = await ModloaderService.getForgeVersions(gameVersion);
            if (!forgeVersions || forgeVersions.length === 0) {
                console.warn(`No Forge versions found for Minecraft ${gameVersion}. Falling back to Vanilla.`);
                return baseVersion;
            }
            // Get latest recommended version
            const latestVersion = forgeVersions.find(v => v.stable) || forgeVersions[0];
            const forgeVersion = latestVersion.version;
            // Create version ID for this Forge version
            const forgeVersionId = `forge-${forgeVersion}-${gameVersion}`;
            const forgeVersionDir = path_1.default.join(gameDir, 'versions', forgeVersionId);
            if (!fs_1.default.existsSync(forgeVersionDir)) {
                fs_1.default.mkdirSync(forgeVersionDir, { recursive: true });
            }
            // Check if version JSON already exists
            const versionJsonPath = path_1.default.join(forgeVersionDir, `${forgeVersionId}.json`);
            if (fs_1.default.existsSync(versionJsonPath)) {
                try {
                    const existingDetail = JSON.parse(fs_1.default.readFileSync(versionJsonPath, 'utf8'));
                    if (existingDetail.id === forgeVersionId) {
                        return existingDetail;
                    }
                }
                catch { }
            }
            // Download Forge installer JAR
            // Official Forge installer URL pattern: https://maven.minecraftforge.net/net/minecraftforge/forge/index_{mcversion}.html
            // But we use the direct JAR download from files.minecraftforge.net
            const installerFilename = `forge-${gameVersion}-${forgeVersion}-installer.jar`;
            const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${gameVersion}-${forgeVersion}/${installerFilename}`;
            try {
                // Download installer
                const installerResponse = await axios_1.default.get(installerUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: { 'User-Agent': 'RadonClient/1.0.0' }
                });
                // Save installer
                const installerPath = path_1.default.join(forgeVersionDir, installerFilename);
                fs_1.default.writeFileSync(installerPath, Buffer.from(installerResponse.data));
                // Parse the installer JAR to extract version JSON
                // Forge installer JAR contains: version.json, pack.mcmeta, etc.
                // We'll use adm-zip to extract the version.json from the JAR
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(installerPath);
                const zipEntries = zip.getEntries();
                let versionJsonContent = null;
                // Look for version.json in the installer
                for (const entry of zipEntries) {
                    if (entry.entryName === 'version.json' || entry.entryName.endsWith('/version.json')) {
                        versionJsonContent = entry.getData().toString('utf8');
                        break;
                    }
                }
                if (!versionJsonContent) {
                    console.warn('No version.json found in Forge installer JAR');
                    return baseVersion;
                }
                const versionJson = JSON.parse(versionJsonContent);
                // Extract libraries and main class from version.json
                const forgeLibraries = [];
                const forgeArguments = versionJson.arguments || { jvm: [], game: [] };
                // Add Forge specific libraries
                if (versionJson.libraries) {
                    for (const lib of versionJson.libraries) {
                        if (lib.rules && !ModloaderService.evaluateRules(lib.rules))
                            continue;
                        const library = {
                            name: lib.name,
                        };
                        if (lib.downloads && lib.downloads.artifact) {
                            library.downloads = {
                                artifact: {
                                    path: lib.downloads.artifact.path,
                                    sha1: lib.downloads.artifact.sha1 || '',
                                    size: lib.downloads.artifact.size || 0,
                                    url: lib.downloads.artifact.url,
                                }
                            };
                        }
                        if (lib.natives) {
                            library.natives = lib.natives;
                        }
                        if (lib.rules) {
                            library.rules = lib.rules;
                        }
                        forgeLibraries.push(library);
                    }
                }
                // Create merged version detail
                const mergedDetail = {
                    ...baseVersion,
                    id: forgeVersionId,
                    inheritsFrom: gameVersion,
                    mainClass: versionJson.mainClass || 'cpw.mods.bootstraplauncher.BootstrapLauncher',
                    libraries: [
                        ...baseVersion.libraries,
                        ...forgeLibraries,
                    ],
                    arguments: {
                        jvm: [
                            ...(baseVersion.arguments?.jvm || []),
                            ...(forgeArguments.jvm || []),
                        ],
                        game: [
                            ...(baseVersion.arguments?.game || []),
                            ...(forgeArguments.game || []),
                        ],
                    },
                };
                // Save version JSON
                fs_1.default.writeFileSync(versionJsonPath, JSON.stringify(mergedDetail, null, 2));
                console.log(`[Radon Client] Successfully resolved Forge ${forgeVersion} for MC ${gameVersion}`);
                return mergedDetail;
            }
            catch (dlErr) {
                console.warn(`[Radon Client] Failed to download Forge installer:`, dlErr.message);
                return baseVersion;
            }
        }
        catch (err) {
            console.warn('[Radon Client] Failed to resolve Forge profile:', err);
            return baseVersion;
        }
    }
    /**
     * Extract Forge profile from installer JAR
     */
    static async extractForgeProfile(installerPath) {
        // For simplicity, we'll use a known approach for common Forge versions
        // In production, you'd need to parse the JAR manifest and extract the profile
        // For now, we'll return a basic profile for modern Forge versions
        return {
            spec: 1,
            profile: 'client',
            version: '1.0.0',
            json: '',
            path: '',
            minecraft: '1.20.4',
            clientJar: 'client.jar',
            serverJar: 'server.jar',
            libraries: [],
            mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
            data: {},
        };
    }
    /**
     * Extract JVM arguments from Forge JSON
     */
    static extractForgeArguments(jsonStr) {
        try {
            const json = JSON.parse(jsonStr);
            const args = [];
            if (json.arguments && json.arguments.jvm) {
                for (const arg of json.arguments.jvm) {
                    if (typeof arg === 'string') {
                        args.push(arg);
                    }
                    else if (arg.rules && this.evaluateRule(arg.rules)) {
                        if (Array.isArray(arg.value)) {
                            args.push(...arg.value);
                        }
                        else if (typeof arg.value === 'string') {
                            args.push(arg.value);
                        }
                    }
                }
            }
            return args;
        }
        catch {
            return [];
        }
    }
    /**
     * Evaluate Forge rule
     */
    static evaluateRule(rules) {
        // Simplified rule evaluation for Forge
        if (!rules || !rules.os)
            return true;
        const os = rules.os;
        if (os.name && os.name !== 'windows')
            return false;
        if (os.arch && os.arch !== 'x86_64')
            return false;
        return true;
    }
    /**
     * Evaluate rules for library filtering
     */
    static evaluateRules(rules) {
        return ModloaderService.evaluateRule(rules);
    }
    /**
     * Convert Forge library format to standard Minecraft library format
     */
    static convertForgeLibraries(forgeLibs) {
        const result = [];
        for (const lib of forgeLibs) {
            if (!lib.clientreq && lib.serverreq)
                continue; // Skip server-only
            const library = {
                name: lib.name,
            };
            // Convert name to Maven coordinates if needed
            if (lib.name && !lib.name.startsWith('net.minecraftforge:')) {
                library.name = lib.name.replace(/\./g, '/');
            }
            // Add checksums if available
            if (lib.checksums && lib.checksums.length > 0) {
                library.downloads = {
                    artifact: {
                        path: library.name.replace(/\./g, '/').replace(/:/g, '/') + '.jar',
                        sha1: lib.checksums[0],
                        size: 0,
                        url: '',
                    },
                };
            }
            result.push(library);
        }
        return result;
    }
    /**
     * Get available Forge versions for a Minecraft version
     * Uses official Forge version manifest
     */
    static async getForgeVersions(mcVersion) {
        try {
            // Official Forge version manifest URL
            const manifestUrl = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
            const response = await axios_1.default.get(manifestUrl, { timeout: 10000 });
            const manifest = response.data;
            // Filter by Minecraft version
            const versions = [];
            if (manifest.promos && manifest.promos[mcVersion]) {
                // Recommended/stable version
                const recommended = manifest.promos[mcVersion].recommended;
                if (recommended) {
                    versions.push({ version: recommended, stable: true });
                }
                // Latest version
                const latest = manifest.promos[mcVersion].latest;
                if (latest && latest !== recommended) {
                    versions.push({ version: latest, stable: false });
                }
            }
            // Fallback to known versions if manifest fails
            if (versions.length === 0) {
                const knownVersions = {
                    '1.20.4': [{ version: '48.1.0', stable: true }, { version: '48.0.0', stable: false }],
                    '1.20.3': [{ version: '47.2.0', stable: true }],
                    '1.20.2': [{ version: '47.1.0', stable: true }],
                    '1.20.1': [{ version: '47.0.0', stable: true }],
                    '1.20': [{ version: '46.0.0', stable: true }],
                    '1.19.4': [{ version: '45.2.0', stable: true }],
                    '1.19.3': [{ version: '45.1.0', stable: true }],
                    '1.19.2': [{ version: '44.1.0', stable: true }],
                    '1.19': [{ version: '43.2.0', stable: true }],
                    '1.18.2': [{ version: '40.2.0', stable: true }],
                    '1.18': [{ version: '40.0.0', stable: true }],
                    '1.17.1': [{ version: '37.1.0', stable: true }],
                    '1.16.5': [{ version: '36.2.0', stable: true }],
                    '1.12.2': [{ version: '14.23.5.2860', stable: true }],
                    '1.8.9': [{ version: '11.15.1.2318', stable: true }],
                    '1.7.10': [{ version: '10.13.4.1614', stable: true }],
                };
                return knownVersions[mcVersion] || [];
            }
            return versions;
        }
        catch (err) {
            console.warn('Failed to fetch Forge versions from manifest:', err);
            return [];
        }
    }
    /**
     * Fetch NeoForge version and create profile
     * Uses the official NeoForge installer which contains the version JSON
     */
    static async resolveNeoForge(baseVersion, gameDir) {
        const gameVersion = baseVersion.id;
        try {
            // Get NeoForge versions for this Minecraft version
            const neoVersions = await ModloaderService.getNeoForgeVersions(gameVersion);
            if (!neoVersions || neoVersions.length === 0) {
                console.warn(`[Radon Client] No NeoForge versions found for Minecraft ${gameVersion}. Falling back to Vanilla.`);
                return baseVersion;
            }
            // Get latest recommended version
            const latestVersion = neoVersions.find(v => v.release) || neoVersions[0];
            const neoVersion = latestVersion.version;
            // Create version ID
            const neoVersionId = `neoforge-${neoVersion}-${gameVersion}`;
            const neoVersionDir = path_1.default.join(gameDir, 'versions', neoVersionId);
            if (!fs_1.default.existsSync(neoVersionDir)) {
                fs_1.default.mkdirSync(neoVersionDir, { recursive: true });
            }
            // Check if version JSON already exists
            const versionJsonPath = path_1.default.join(neoVersionDir, `${neoVersionId}.json`);
            if (fs_1.default.existsSync(versionJsonPath)) {
                try {
                    const existingDetail = JSON.parse(fs_1.default.readFileSync(versionJsonPath, 'utf8'));
                    if (existingDetail.id === neoVersionId) {
                        return existingDetail;
                    }
                }
                catch { }
            }
            // Find the installer file
            const installerFile = latestVersion.files.find(f => f.type === 'installer');
            if (!installerFile) {
                console.warn('[Radon Client] No NeoForge installer file found in manifest');
                return baseVersion;
            }
            // Download installer
            try {
                const installerResponse = await axios_1.default.get(installerFile.url, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: { 'User-Agent': 'RadonClient/1.0.0' }
                });
                const installerPath = path_1.default.join(neoVersionDir, installerFile.path);
                fs_1.default.writeFileSync(installerPath, Buffer.from(installerResponse.data));
                // Parse the installer JAR to extract version JSON (similar to Forge)
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(installerPath);
                const zipEntries = zip.getEntries();
                let versionJsonContent = null;
                // Look for version.json in the installer
                for (const entry of zipEntries) {
                    if (entry.entryName === 'version.json' || entry.entryName.endsWith('/version.json')) {
                        versionJsonContent = entry.getData().toString('utf8');
                        break;
                    }
                }
                let neoLibraries = [];
                let neoArguments = { jvm: [], game: [] };
                let neoMainClass = 'cpw.mods.bootstraplauncher.BootstrapLauncher';
                if (versionJsonContent) {
                    const versionJson = JSON.parse(versionJsonContent);
                    neoMainClass = versionJson.mainClass || neoMainClass;
                    neoArguments = versionJson.arguments || neoArguments;
                    // Add NeoForge specific libraries
                    if (versionJson.libraries) {
                        for (const lib of versionJson.libraries) {
                            if (lib.rules && !ModloaderService.evaluateRules(lib.rules))
                                continue;
                            const library = {
                                name: lib.name,
                            };
                            if (lib.downloads && lib.downloads.artifact) {
                                library.downloads = {
                                    artifact: {
                                        path: lib.downloads.artifact.path,
                                        sha1: lib.downloads.artifact.sha1 || '',
                                        size: lib.downloads.artifact.size || 0,
                                        url: lib.downloads.artifact.url,
                                    }
                                };
                            }
                            if (lib.natives) {
                                library.natives = lib.natives;
                            }
                            neoLibraries.push(library);
                        }
                    }
                }
                else {
                    // Fallback: Add basic NeoForge library
                    neoLibraries = [
                        {
                            name: `net.neoforged:neoforge:${neoVersion}`,
                            downloads: {
                                artifact: {
                                    path: `net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}.jar`,
                                    sha1: '',
                                    size: 0,
                                    url: installerFile.url,
                                }
                            }
                        }
                    ];
                }
                // Create merged version detail
                const mergedDetail = {
                    ...baseVersion,
                    id: neoVersionId,
                    inheritsFrom: gameVersion,
                    mainClass: neoMainClass,
                    libraries: [
                        ...baseVersion.libraries,
                        ...neoLibraries,
                    ],
                    arguments: {
                        jvm: [
                            ...(baseVersion.arguments?.jvm || []),
                            ...neoArguments.jvm,
                        ],
                        game: [
                            ...(baseVersion.arguments?.game || []),
                            ...neoArguments.game,
                        ],
                    },
                };
                // Save version JSON
                fs_1.default.writeFileSync(versionJsonPath, JSON.stringify(mergedDetail, null, 2));
                console.log(`[Radon Client] Successfully resolved NeoForge ${neoVersion} for MC ${gameVersion}`);
                return mergedDetail;
            }
            catch (dlErr) {
                console.warn(`[Radon Client] Failed to download NeoForge installer:`, dlErr.message);
                return baseVersion;
            }
        }
        catch (err) {
            console.warn('[Radon Client] Failed to resolve NeoForge profile:', err);
            return baseVersion;
        }
    }
    /**
     * Get available NeoForge versions for a Minecraft version
     * Uses official NeoForge Maven repository
     */
    static async getNeoForgeVersions(mcVersion) {
        try {
            // Official NeoForge Maven API
            const baseUrl = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
            const response = await axios_1.default.get(baseUrl, { timeout: 10000 });
            const xmlData = response.data;
            // Simple XML parsing for versioning (we look for version strings)
            const versionMatches = xmlData.match(/<version>([^<]+)<\/version>/g) || [];
            const versions = versionMatches.map((m) => m.replace(/<\/version>$/, '').replace(/^<version>/, ''));
            // Filter versions for this Minecraft version
            const neoVersions = [];
            const mcVersionPattern = new RegExp(`^${mcVersion.replace(/\./g, '\\.')}`);
            for (const ver of versions) {
                if (mcVersionPattern.test(ver)) {
                    neoVersions.push({
                        version: ver,
                        mcversion: mcVersion,
                        release: !ver.includes('alpha') && !ver.includes('beta'),
                        date: '2024-01-01',
                        time: '00:00:00',
                        files: [
                            {
                                type: 'installer',
                                path: `neoforge-${ver}-installer.jar`,
                                sha1: '',
                                size: 0,
                                url: `${ModloaderService.NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/${ver}/neoforge-${ver}-installer.jar`
                            }
                        ]
                    });
                }
            }
            // Sort by version (newest first)
            neoVersions.sort((a, b) => b.version.localeCompare(a.version));
            if (neoVersions.length > 0) {
                return neoVersions;
            }
            // Fallback to known NeoForge versions
            const knownNeoVersions = {
                '1.20.4': [{ version: '20.4.200', mcversion: '1.20.4', release: true, date: '2024-08-01', time: '00:00:00', files: [{ type: 'installer', path: 'neoforge-20.4.200-installer.jar', sha1: '', size: 0, url: `${ModloaderService.NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/20.4.200/neoforge-20.4.200-installer.jar` }] }],
                '1.20.3': [{ version: '20.3.161', mcversion: '1.20.3', release: true, date: '2024-07-01', time: '00:00:00', files: [{ type: 'installer', path: 'neoforge-20.3.161-installer.jar', sha1: '', size: 0, url: `${ModloaderService.NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/20.3.161/neoforge-20.3.161-installer.jar` }] }],
                '1.20.2': [{ version: '20.2.82', mcversion: '1.20.2', release: true, date: '2024-06-01', time: '00:00:00', files: [{ type: 'installer', path: 'neoforge-20.2.82-installer.jar', sha1: '', size: 0, url: `${ModloaderService.NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/20.2.82/neoforge-20.2.82-installer.jar` }] }],
                '1.20.1': [{ version: '20.1.60', mcversion: '1.20.1', release: true, date: '2024-05-01', time: '00:00:00', files: [{ type: 'installer', path: 'neoforge-20.1.60-installer.jar', sha1: '', size: 0, url: `${ModloaderService.NEOFORGE_MAVEN_URL}/net/neoforged/neoforge/20.1.60/neoforge-20.1.60-installer.jar` }] }],
            };
            return knownNeoVersions[mcVersion] || [];
        }
        catch (err) {
            console.warn('[Radon Client] Failed to fetch NeoForge versions:', err);
            return [];
        }
    }
}
exports.ModloaderService = ModloaderService;
