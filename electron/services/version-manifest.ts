import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { VersionManifestResponse, VersionEntry, VersionDetail, Rule } from '../types';

const PISTON_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export class VersionManifestService {
  private cacheDir: string;
  private manifestCacheFile: string;
  private manifestData: VersionManifestResponse | null = null;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
    this.manifestCacheFile = path.join(this.cacheDir, 'version_manifest_v2.json');
  }

  /**
   * Fetches full Mojang version manifest (or loads from cache if offline)
   */
  public async getManifest(forceRefresh = false): Promise<VersionManifestResponse> {
    if (!forceRefresh && this.manifestData) {
      return this.manifestData;
    }

    try {
      const response = await axios.get<VersionManifestResponse>(PISTON_MANIFEST_URL, { timeout: 10000 });
      this.manifestData = response.data;
      fs.writeFileSync(this.manifestCacheFile, JSON.stringify(this.manifestData, null, 2));
      return this.manifestData;
    } catch (err) {
      if (fs.existsSync(this.manifestCacheFile)) {
        try {
          this.manifestData = JSON.parse(fs.readFileSync(this.manifestCacheFile, 'utf8'));
          return this.manifestData!;
        } catch {
          // ignore
        }
      }
      throw new Error(`Failed to fetch Minecraft version manifest: ${(err as Error).message}`);
    }
  }

  /**
   * Fetches specific version details (e.g. 1.8.9.json or 1.21.1.json)
   */
  public async getVersionDetail(versionId: string, gameDir: string): Promise<VersionDetail> {
    const localVersionFile = path.join(gameDir, 'versions', versionId, `${versionId}.json`);

    // If already downloaded and exists locally, return local copy
    if (fs.existsSync(localVersionFile)) {
      try {
        const localDetail: VersionDetail = JSON.parse(fs.readFileSync(localVersionFile, 'utf8'));
        if (localDetail && localDetail.id === versionId) {
          return localDetail;
        }
      } catch {
        // proceed to fetch
      }
    }

    const manifest = await this.getManifest();
    const entry = manifest.versions.find(v => v.id === versionId);

    if (!entry) {
      throw new Error(`Minecraft version "${versionId}" not found in Mojang manifest.`);
    }

    const res = await axios.get<VersionDetail>(entry.url);
    const detail = res.data;

    // Ensure version folder exists and save json
    const versionDir = path.join(gameDir, 'versions', versionId);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }
    fs.writeFileSync(localVersionFile, JSON.stringify(detail, null, 2));

    return detail;
  }

  /**
   * Checks whether a rule allows or disallows a library/argument on the current OS (Windows)
   */
  public static evaluateRules(rules?: Rule[]): boolean {
    if (!rules || rules.length === 0) return true;

    const currentOs = 'windows';
    const currentArch = process.arch === 'x64' ? 'x64' : 'x86';

    let allowed = false;

    for (const rule of rules) {
      let ruleMatches = true;

      if (rule.os) {
        if (rule.os.name && rule.os.name !== currentOs) {
          ruleMatches = false;
        }
        if (rule.os.arch && rule.os.arch !== currentArch) {
          ruleMatches = false;
        }
      }

      if (rule.features) {
        // We don't enable experimental demo/custom user features by default
        ruleMatches = false;
      }

      if (ruleMatches) {
        allowed = rule.action === 'allow';
      }
    }

    return allowed;
  }

  /**
   * Checks if a library is applicable for Windows and returns its artifact / classifier path
   */
  public static getLibraryDownloadInfo(library: any): { path: string; url: string; sha1: string; size: number; isNative: boolean } | null {
    if (!VersionManifestService.evaluateRules(library.rules)) {
      return null;
    }

    const is64Bit = process.arch === 'x64';
    const windowsNativeKey = is64Bit ? 'natives-windows' : 'natives-windows-32';

    // 1. Check for native classifier first if it has natives for windows
    if (library.natives && library.natives.windows) {
      let classifierKey = library.natives.windows.replace('${arch}', is64Bit ? '64' : '32');
      if (library.downloads && library.downloads.classifiers && library.downloads.classifiers[classifierKey]) {
        const artifact = library.downloads.classifiers[classifierKey];
        return {
          path: artifact.path,
          url: artifact.url,
          sha1: artifact.sha1,
          size: artifact.size,
          isNative: true,
        };
      }
    }

    // 2. Standard artifact
    if (library.downloads && library.downloads.artifact) {
      const artifact = library.downloads.artifact;
      return {
        path: artifact.path,
        url: artifact.url,
        sha1: artifact.sha1,
        size: artifact.size,
        isNative: false,
      };
    }

    // 3. Fallback for older legacy libraries where downloads object is missing (calculate path from maven coordinates)
    if (library.name) {
      const parts = library.name.split(':');
      if (parts.length >= 3) {
        const group = parts[0].replace(/\./g, '/');
        const artifact = parts[1];
        const version = parts[2];
        const classifier = parts[3] ? `-${parts[3]}` : '';
        const relPath = `${group}/${artifact}/${version}/${artifact}-${version}${classifier}.jar`;
        const defaultBaseUrl = library.url || 'https://libraries.minecraft.net/';
        return {
          path: relPath,
          url: `${defaultBaseUrl.replace(/\/$/, '')}/${relPath}`,
          sha1: '',
          size: 0,
          isNative: !!library.natives,
        };
      }
    }

    return null;
  }
}

