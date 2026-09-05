"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdaterService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
class UpdaterService {
    static GITHUB_REPO = 'RadonClient/Radon-Client'; // Ändere dies zu deinem Repository
    static VERSION_FILE_URL = `https://raw.githubusercontent.com/${UpdaterService.GITHUB_REPO}/main/version.json`;
    static RELEASES_API_URL = `https://api.github.com/repos/${UpdaterService.GITHUB_REPO}/releases/latest`;
    versionFile;
    currentVersion;
    constructor() {
        this.versionFile = path_1.default.join(__dirname, '../../version.json');
        this.currentVersion = this.getCurrentVersion();
    }
    /**
     * Gets the current version from package.json
     */
    getCurrentVersion() {
        try {
            const packageJsonPath = path_1.default.join(__dirname, '../../package.json');
            const packageJson = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf8'));
            return packageJson.version || '1.0.0';
        }
        catch {
            return '1.0.0';
        }
    }
    /**
     * Gets the latest version from package.json (local version.json or remote)
     */
    async getLatestVersion() {
        try {
            // Try to read local version.json first
            if (fs_1.default.existsSync(this.versionFile)) {
                const localVersion = JSON.parse(fs_1.default.readFileSync(this.versionFile, 'utf8'));
                if (localVersion.version) {
                    return {
                        version: localVersion.version,
                        downloadUrl: localVersion.downloadUrl || '',
                        releaseNotes: localVersion.releaseNotes || '',
                        releaseDate: localVersion.releaseDate || '',
                        isPrerelease: localVersion.isPrerelease || false,
                    };
                }
            }
            // Try to fetch from GitHub releases
            const response = await axios_1.default.get(UpdaterService.RELEASES_API_URL, {
                timeout: 10000,
                headers: { 'User-Agent': 'RadonClient/1.0.0' }
            });
            const release = response.data;
            return {
                version: release.tag_name.replace(/^v/, ''),
                downloadUrl: release.assets?.[0]?.browser_download_url || '',
                releaseNotes: release.body || '',
                releaseDate: release.published_at || '',
                isPrerelease: release.prerelease || false,
            };
        }
        catch (err) {
            console.warn('[Radon Client] Failed to fetch latest version:', err);
            return null;
        }
    }
    /**
     * Checks if an update is available
     */
    async checkForUpdates() {
        const latest = await this.getLatestVersion();
        if (!latest) {
            return {
                currentVersion: this.currentVersion,
                latestVersion: this.currentVersion,
                available: false,
                downloadUrl: '',
                releaseNotes: '',
                isPrerelease: false,
            };
        }
        const isNewer = this.compareVersions(latest.version, this.currentVersion) > 0;
        return {
            currentVersion: this.currentVersion,
            latestVersion: latest.version,
            available: isNewer,
            downloadUrl: latest.downloadUrl,
            releaseNotes: latest.releaseNotes,
            isPrerelease: latest.isPrerelease,
        };
    }
    /**
     * Compares two version strings
     * Returns 1 if a > b, -1 if a < b, 0 if equal
     */
    compareVersions(a, b) {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aVal = aParts[i] || 0;
            const bVal = bParts[i] || 0;
            if (aVal > bVal)
                return 1;
            if (aVal < bVal)
                return -1;
        }
        return 0;
    }
    /**
     * Downloads and installs the update
     */
    async installUpdate(downloadUrl) {
        try {
            // Determine the platform
            const platform = process.platform;
            const arch = process.arch;
            // Create temp directory
            const tempDir = path_1.default.join(__dirname, '../../temp_update');
            if (!fs_1.default.existsSync(tempDir)) {
                fs_1.default.mkdirSync(tempDir, { recursive: true });
            }
            // Download the update
            const response = await axios_1.default.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: { 'User-Agent': 'RadonClient/1.0.0' }
            });
            const updateFile = path_1.default.join(tempDir, `radon-client-update.${downloadUrl.split('.').pop() || 'exe'}`);
            fs_1.default.writeFileSync(updateFile, Buffer.from(response.data));
            return { success: true };
        }
        catch (err) {
            console.error('[Radon Client] Failed to download update:', err.message);
            return { success: false, error: err.message };
        }
    }
    /**
     * Gets the version from a local version.json file
     */
    getLocalVersion() {
        try {
            if (fs_1.default.existsSync(this.versionFile)) {
                const versionData = JSON.parse(fs_1.default.readFileSync(this.versionFile, 'utf8'));
                return versionData.version || this.currentVersion;
            }
            return this.currentVersion;
        }
        catch {
            return this.currentVersion;
        }
    }
    /**
     * Creates a version.json file for the current build
     */
    static createVersionFile(outputDir, version = '1.0.0') {
        const versionFile = path_1.default.join(outputDir, 'version.json');
        const versionData = {
            version: version,
            buildDate: new Date().toISOString(),
            productName: 'Radon Client',
            downloadUrl: 'https://github.com/RadonClient/Radon-Client/releases/latest',
            releaseNotes: 'Initial release of Radon Client',
            isPrerelease: false,
        };
        fs_1.default.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
    }
}
exports.UpdaterService = UpdaterService;
