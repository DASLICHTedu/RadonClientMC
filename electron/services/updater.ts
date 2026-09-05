import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';

export interface VersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  releaseDate: string;
  isPrerelease: boolean;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  downloadUrl: string;
  releaseNotes: string;
  isPrerelease: boolean;
}

export class UpdaterService {
  private static GITHUB_REPO = 'RadonClient/Radon-Client'; // Ändere dies zu deinem Repository
  private static VERSION_FILE_URL = `https://raw.githubusercontent.com/${UpdaterService.GITHUB_REPO}/main/version.json`;
  private static RELEASES_API_URL = `https://api.github.com/repos/${UpdaterService.GITHUB_REPO}/releases/latest`;
  
  private versionFile: string;
  private currentVersion: string;

  constructor() {
    this.versionFile = path.join(__dirname, '../../version.json');
    this.currentVersion = this.getCurrentVersion();
  }

  /**
   * Gets the current version from package.json
   */
  private getCurrentVersion(): string {
    try {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  /**
   * Gets the latest version from package.json (local version.json or remote)
   */
  public async getLatestVersion(): Promise<VersionInfo | null> {
    try {
      // Try to read local version.json first
      if (fs.existsSync(this.versionFile)) {
        const localVersion = JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
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
      const response = await axios.get(UpdaterService.RELEASES_API_URL, {
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
    } catch (err) {
      console.warn('[Radon Client] Failed to fetch latest version:', err);
      return null;
    }
  }

  /**
   * Checks if an update is available
   */
  public async checkForUpdates(): Promise<UpdateInfo> {
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
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    
    return 0;
  }

  /**
   * Downloads and installs the update
   */
  public async installUpdate(downloadUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Determine the platform
      const platform = process.platform;
      const arch = process.arch;
      
      // Create temp directory
      const tempDir = path.join(__dirname, '../../temp_update');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Download the update
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: { 'User-Agent': 'RadonClient/1.0.0' }
      });

      const updateFile = path.join(tempDir, `radon-client-update.${downloadUrl.split('.').pop() || 'exe'}`);
      fs.writeFileSync(updateFile, Buffer.from(response.data));

      return { success: true };
    } catch (err: any) {
      console.error('[Radon Client] Failed to download update:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Gets the version from a local version.json file
   */
  public getLocalVersion(): string {
    try {
      if (fs.existsSync(this.versionFile)) {
        const versionData = JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
        return versionData.version || this.currentVersion;
      }
      return this.currentVersion;
    } catch {
      return this.currentVersion;
    }
  }

  /**
   * Creates a version.json file for the current build
   */
  public static createVersionFile(outputDir: string, version: string = '1.0.0'): void {
    const versionFile = path.join(outputDir, 'version.json');
    const versionData = {
      version: version,
      buildDate: new Date().toISOString(),
      productName: 'Radon Client',
      downloadUrl: 'https://github.com/RadonClient/Radon-Client/releases/latest',
      releaseNotes: 'Initial release of Radon Client',
      isPrerelease: false,
    };
    
    fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
  }
}
