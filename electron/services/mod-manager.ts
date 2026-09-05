import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { shell } from 'electron';
import { ModrinthSearchResult, ModrinthVersion, InstalledMod, CurseForgeSearchResult, CurseForgeModInfo, CurseForgeFile, ModSourceType } from '../types';
import { CurseForgeService } from './curseforge';

export class ModManagerService {
  private static MODRINTH_API = 'https://api.modrinth.com/v2';
  private static MAX_RETRIES = 3;
  private static RETRY_DELAY_MS = 2000;

  /**
   * Searches Modrinth API for Minecraft mods / shaders filtered by category, modloader and game version
   */
  public static async searchModrinth(
    query = '',
    loader = 'fabric',
    gameVersion = '1.20.4',
    category = 'all',
    index = 'downloads',
    limit = 36
  ): Promise<ModrinthSearchResult[]> {
    try {
      const facets: string[][] = [];

      // 1. Category / Project type facets
      switch (category) {
        case 'shaders':
          // Match shaderpacks & shader mods (Iris, Oculus, OptiFine, Canvas)
          facets.push(['project_type:mod', 'project_type:shader']);
          facets.push(['categories:iris', 'categories:optifine', 'categories:shaders', 'categories:canvas']);
          break;
        case 'optimization':
          facets.push(['project_type:mod']);
          facets.push(['categories:optimization']);
          break;
        case 'utility':
          facets.push(['project_type:mod']);
          facets.push(['categories:utility']);
          break;
        case 'equipment':
          facets.push(['project_type:mod']);
          facets.push(['categories:equipment', 'categories:game-mechanics']);
          break;
        case 'worldgen':
          facets.push(['project_type:mod']);
          facets.push(['categories:worldgen']);
          break;
        case 'technology':
          facets.push(['project_type:mod']);
          facets.push(['categories:technology', 'categories:storage']);
          break;
        case 'magic':
          facets.push(['project_type:mod']);
          facets.push(['categories:magic']);
          break;
        case 'adventure':
          facets.push(['project_type:mod']);
          facets.push(['categories:adventure']);
          break;
        case 'decoration':
          facets.push(['project_type:mod']);
          facets.push(['categories:decoration']);
          break;
        case 'food':
          facets.push(['project_type:mod']);
          facets.push(['categories:food']);
          break;
        case 'all':
        default:
          facets.push(['project_type:mod', 'project_type:shader']);
          break;
      }

      // 2. Modloader facet (if not shaders-only and not vanilla)
      if (category !== 'shaders' && loader && loader !== 'vanilla') {
        facets.push([`categories:${loader}`]);
      }

      // 3. Game version facet
      if (gameVersion && gameVersion !== 'all') {
        facets.push([`versions:${gameVersion}`]);
      }

      const params: Record<string, any> = {
        limit: Math.min(limit, 100),
        index: index || 'downloads',
      };

      if (query.trim()) {
        params.query = query.trim();
      }

      if (facets.length > 0) {
        params.facets = JSON.stringify(facets);
      }

      let res = await axios.get(`${ModManagerService.MODRINTH_API}/search`, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)',
        },
      });

      // Fallback: If 0 hits and gameVersion was specified, try without strict gameVersion
      if ((!res.data.hits || res.data.hits.length === 0) && gameVersion && gameVersion !== 'all') {
        const fallbackFacets = facets.filter(f => !f.some(val => val.startsWith('versions:')));
        params.facets = JSON.stringify(fallbackFacets);
        res = await axios.get(`${ModManagerService.MODRINTH_API}/search`, {
          params,
          timeout: 10000,
          headers: {
            'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)',
          },
        });
      }

      return res.data.hits || [];
    } catch (err: any) {
      console.error('Failed to search Modrinth:', err.message);
      return [];
    }
  }

  /**
   * Searches CurseForge API for Minecraft mods
   */
  public static async searchCurseForge(
    query: string = '',
    gameVersion: string = '',
    modLoader: string = '',
    categoryId: number = 0,
    sortField: number = 5, // Sort by total downloads
    page: number = 0,
    pageSize: number = 24
  ): Promise<CurseForgeSearchResult[]> {
    return CurseForgeService.searchMods(query, gameVersion, modLoader, categoryId, sortField, 'desc', pageSize, page);
  }

  /**
   * Combined search across both Modrinth and CurseForge
   */
  public static async searchAll(
    query: string = '',
    loader: string = 'fabric',
    gameVersion: string = '1.20.4',
    source: ModSourceType | 'all' = 'all',
    category: string = 'all',
    index: string = 'downloads'
  ): Promise<{
    modrinth: ModrinthSearchResult[];
    curseforge: CurseForgeSearchResult[];
  }> {
    const modrinthResults = source === 'curseforge' ? [] : await this.searchModrinth(query, loader, gameVersion, category, index);
    const curseforgeResults = source === 'modrinth' ? [] : await this.searchCurseForge(query, gameVersion, loader);
    
    return {
      modrinth: modrinthResults,
      curseforge: curseforgeResults,
    };
  }

  /**
   * Gets mod info from either Modrinth or CurseForge
   */
  public static async getModInfo(
    source: ModSourceType,
    projectId: string
  ): Promise<ModrinthSearchResult | CurseForgeModInfo | null> {
    if (source === 'modrinth') {
      // Get Modrinth project info
      try {
        const res = await axios.get(`${ModManagerService.MODRINTH_API}/project/${projectId}`, {
          timeout: 10000,
          headers: { 'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)' },
        });
        return res.data;
      } catch {
        return null;
      }
    } else {
      // Get CurseForge mod info
      return CurseForgeService.getModInfo(projectId);
    }
  }

  /**
   * Gets all available versions for a specific Modrinth mod
   */
  public static async getModVersions(
    projectId: string,
    loader?: string,
    gameVersion?: string
  ): Promise<ModrinthVersion[]> {
    try {
      const params: Record<string, any> = {};
      
      if (loader && loader !== 'vanilla') {
        params.loaders = JSON.stringify([loader]);
      }
      if (gameVersion && gameVersion !== 'all') {
        params.game_versions = JSON.stringify([gameVersion]);
      }

      let res = await axios.get<ModrinthVersion[]>(
        `${ModManagerService.MODRINTH_API}/project/${projectId}/version`,
        {
          params,
          timeout: 10000,
          headers: {
            'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)',
          },
        }
      );

      // If no versions found with strict game_version, try with loader only
      if ((!res.data || res.data.length === 0) && gameVersion) {
        delete params.game_versions;
        res = await axios.get<ModrinthVersion[]>(
          `${ModManagerService.MODRINTH_API}/project/${projectId}/version`,
          {
            params,
            timeout: 10000,
            headers: {
              'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)',
            },
          }
        );
      }

      // If still no versions found, try fetching all versions of this project
      if (!res.data || res.data.length === 0) {
        res = await axios.get<ModrinthVersion[]>(
          `${ModManagerService.MODRINTH_API}/project/${projectId}/version`,
          {
            timeout: 10000,
            headers: {
              'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)',
            },
          }
        );
      }

      // Sort by date_published descending (newest first)
      return (res.data || []).sort((a, b) => 
        new Date(b.date_published).getTime() - new Date(a.date_published).getTime()
      );
    } catch (err: any) {
      console.error(`Failed to get versions for mod ${projectId}:`, err.message);
      return [];
    }
  }

  /**
   * Opens the mod page in the default browser
   */
  public static openModPage(source: ModSourceType, projectId: string): void {
    let url = '';
    if (source === 'modrinth') {
      url = `https://modrinth.com/mod/${projectId}`;
    } else {
      url = `https://www.curseforge.com/minecraft/mc-mods/${projectId}`;
    }
    shell.openExternal(url);
  }

  /**
   * Downloads a file with retry logic and SHA1 verification
   */
  private static async downloadFileWithRetry(
    url: string,
    destPath: string,
    expectedSha1?: string,
    retries = ModManagerService.MAX_RETRIES
  ): Promise<{ success: boolean; error?: string; actualSha1?: string }> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const dlRes = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        const data = Buffer.from(dlRes.data);
        
        // Calculate actual SHA1
        const crypto = await import('crypto');
        const actualSha1 = crypto.createHash('sha1').update(data).digest('hex');
        
        // Verify SHA1 if provided
        if (expectedSha1 && expectedSha1.toLowerCase() !== actualSha1.toLowerCase()) {
          throw new Error(`SHA1 verification failed: expected ${expectedSha1}, got ${actualSha1}`);
        }
        
        // Ensure directory exists
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write file with exclusive flag to prevent partial writes
        fs.writeFileSync(destPath, data, { flag: 'wx' });
        
        return { success: true, actualSha1 };
      } catch (err: any) {
        lastError = err.message;
        console.warn(`Download attempt ${attempt} failed:`, err.message);
        
        // Don't retry on SHA1 mismatch - it's a data integrity issue
        if (expectedSha1 && err.message.includes('SHA1 verification failed')) {
          return { success: false, error: err.message };
        }
        
        // Wait before retry
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, ModManagerService.RETRY_DELAY_MS * attempt));
        }
      }
    }
    
    return { success: false, error: `Download failed after ${retries} attempts: ${lastError}` };
  }

  /**
   * Installs a mod from Modrinth or CurseForge
   */
  public static async installMod(
    projectId: string,
    loader: string,
    gameVersion: string,
    gameDir: string,
    source: ModSourceType = 'modrinth',
    versionId?: string
  ): Promise<{ success: boolean; fileName?: string; error?: string; versionId?: string; versionName?: string }> {
    if (source === 'modrinth') {
      return this.installModrinthMod(projectId, loader, gameVersion, gameDir, versionId);
    } else {
      return this.installCurseForgeMod(projectId, loader, gameVersion, gameDir);
    }
  }

  /**
   * Installs a specific version of a mod from Modrinth by version ID
   */
  public static async installSpecificModVersion(
    projectId: string,
    versionId: string,
    gameDir: string
  ): Promise<{ success: boolean; fileName?: string; error?: string; versionName?: string; destination?: string }> {
    try {
      const res = await axios.get<ModrinthVersion>(
        `${ModManagerService.MODRINTH_API}/version/${versionId}`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'RadonClient/1.0.0 (contact@radonclient.com)',
          },
        }
      );

      const version = res.data;
      const primaryFile = version.files.find(f => f.primary) || version.files[0];

      if (!primaryFile) {
        return { success: false, error: 'No downloadable file found in mod release.' };
      }

      const isZip = primaryFile.filename.toLowerCase().endsWith('.zip');
      const isShader = isZip && (
        primaryFile.filename.toLowerCase().includes('shader') ||
        (version.loaders && (version.loaders.includes('iris') || version.loaders.includes('optifine') || version.loaders.includes('canvas')))
      );

      const targetSubDir = isShader ? 'shaderpacks' : 'mods';
      const targetDir = path.join(gameDir, targetSubDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const destPath = path.join(targetDir, primaryFile.filename);

      const downloadResult = await this.downloadFileWithRetry(
        primaryFile.url,
        destPath,
        primaryFile.hashes?.sha1
      );

      if (!downloadResult.success) {
        return { success: false, error: downloadResult.error || 'Download failed' };
      }

      return { 
        success: true, 
        fileName: primaryFile.filename, 
        versionName: version.version_number,
        destination: targetSubDir
      };
    } catch (err: any) {
      console.error(`Failed to install specific mod version ${versionId}:`, err);
      return { success: false, error: err.message || 'Download failed' };
    }
  }

  /**
   * Installs a mod from Modrinth
   */
  private static async installModrinthMod(
    projectId: string,
    loader: string,
    gameVersion: string,
    gameDir: string,
    versionId?: string
  ): Promise<{ success: boolean; fileName?: string; error?: string; versionId?: string; versionName?: string; destination?: string }> {
    try {
      // Get all available versions (with automatic fallback)
      const versions = await this.getModVersions(projectId, loader, gameVersion);
      
      if (!versions || versions.length === 0) {
        return { success: false, error: `No downloadable version found for mod "${projectId}".` };
      }

      // Find the requested version or use the latest
      let versionToInstall: ModrinthVersion | undefined;
      
      if (versionId) {
        versionToInstall = versions.find(v => v.id === versionId || v.version_number === versionId);
      }
      
      if (!versionToInstall) {
        versionToInstall = versions[0];
      }

      if (!versionToInstall || !versionToInstall.files || versionToInstall.files.length === 0) {
        return { success: false, error: 'No downloadable files available in this release.' };
      }

      // Pick primary file or first available
      const primaryFile = versionToInstall.files.find(f => f.primary) || versionToInstall.files[0];

      if (!primaryFile) {
        return { success: false, error: 'No downloadable file found in mod release.' };
      }

      const isZip = primaryFile.filename.toLowerCase().endsWith('.zip');
      const isShader = isZip && (
        primaryFile.filename.toLowerCase().includes('shader') ||
        (versionToInstall.loaders && (versionToInstall.loaders.includes('iris') || versionToInstall.loaders.includes('optifine') || versionToInstall.loaders.includes('canvas')))
      );

      const targetSubDir = isShader ? 'shaderpacks' : 'mods';
      const targetDir = path.join(gameDir, targetSubDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const destPath = path.join(targetDir, primaryFile.filename);

      // Download with retry and SHA1 verification
      const downloadResult = await this.downloadFileWithRetry(
        primaryFile.url,
        destPath,
        primaryFile.hashes?.sha1
      );

      if (!downloadResult.success) {
        return { success: false, error: downloadResult.error || 'Download failed' };
      }

      return { 
        success: true, 
        fileName: primaryFile.filename,
        versionId: versionToInstall.id,
        versionName: versionToInstall.version_number,
        destination: targetSubDir
      };
    } catch (err: any) {
      console.error('Failed to install Modrinth mod:', err);
      return { success: false, error: err.message || 'Download failed', versionId };
    }
  }

  /**
   * Installs a mod from CurseForge
   */
  private static async installCurseForgeMod(
    projectId: string | number,
    loader: string,
    gameVersion: string,
    gameDir: string
  ): Promise<{ success: boolean; fileName?: string; error?: string }> {
    return CurseForgeService.installMod(projectId, gameVersion, loader, gameDir);
  }

  /**
   * Checks for updates for installed mods
   */
  public static async checkForModUpdates(
    gameDir: string,
    loader: string,
    gameVersion: string
  ): Promise<{ modFile: string; currentVersion?: string; latestVersion: string; modName: string; projectId: string; updateUrl: string }[]> {
    const modsDir = path.join(gameDir, 'mods');
    const updates: any[] = [];
    
    if (!fs.existsSync(modsDir)) {
      return updates;
    }

    try {
      const files = fs.readdirSync(modsDir);
      
      for (const file of files) {
        if (file.endsWith('.jar') && !file.endsWith('.disabled')) {
          try {
            const match = file.match(/([A-Za-z0-9_-]+)-\d+\.\d+/);
            if (match) {
              const potentialProjectId = match[1];
              
              const versions = await this.getModVersions(potentialProjectId, loader, gameVersion);
              if (versions && versions.length > 0) {
                const latestVersion = versions[0];
                const primaryFile = latestVersion.files.find(f => f.primary) || latestVersion.files[0];
                
                if (primaryFile && primaryFile.filename !== file) {
                  const modInfo = await this.getModInfo('modrinth', potentialProjectId);
                  if (modInfo && 'title' in modInfo) {
                    updates.push({
                      modFile: file,
                      currentVersion: file.replace(/\.jar$/, ''),
                      latestVersion: latestVersion.version_number,
                      modName: (modInfo as ModrinthSearchResult).title,
                      projectId: potentialProjectId,
                      updateUrl: primaryFile.url
                    });
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`Could not check for updates for ${file}:`, err);
          }
        }
      }
      
      return updates;
    } catch (err) {
      console.error('Failed to check for mod updates:', err);
      return updates;
    }
  }

  /**
   * Updates an installed mod to the latest version
   */
  public static async updateMod(
    projectId: string,
    loader: string,
    gameVersion: string,
    gameDir: string,
    source: ModSourceType = 'modrinth'
  ): Promise<{ success: boolean; fileName?: string; oldFileName?: string; error?: string; versionName?: string }> {
    try {
      const modsDir = path.join(gameDir, 'mods');
      if (!fs.existsSync(modsDir)) {
        return { success: false, error: 'Mods directory does not exist' };
      }

      const files = fs.readdirSync(modsDir);
      let oldFileName: string | undefined;
      
      for (const file of files) {
        if (file.includes(projectId) && file.endsWith('.jar')) {
          oldFileName = file;
          break;
        }
      }

      const result = await this.installMod(projectId, loader, gameVersion, gameDir, source);
      
      if (result.success && oldFileName) {
        try {
          const oldPath = path.join(modsDir, oldFileName);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        } catch (err) {
          console.warn(`Failed to delete old mod file ${oldFileName}:`, err);
        }
        
        return { 
          ...result, 
          oldFileName 
        };
      }
      
      return result;
    } catch (err: any) {
      console.error(`Failed to update mod ${projectId}:`, err);
      return { 
        success: false, 
        error: err.message || 'Update failed'
      };
    }
  }

  /**
   * Returns list of all installed mods in the .minecraft/mods folder
   */
  public static getInstalledMods(gameDir: string): InstalledMod[] {
    const modsDir = path.join(gameDir, 'mods');
    if (!fs.existsSync(modsDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(modsDir);
      const mods: InstalledMod[] = [];

      for (const file of files) {
        if (file.endsWith('.jar') || file.endsWith('.jar.disabled')) {
          const fullPath = path.join(modsDir, file);
          const stats = fs.statSync(fullPath);

          const isEnabled = file.endsWith('.jar');
          const cleanName = file.replace(/\.jar(\.disabled)?$/, '');

          mods.push({
            id: file,
            fileName: file,
            name: cleanName,
            enabled: isEnabled,
            size: stats.size,
            modifiedTime: stats.mtimeMs,
          });
        }
      }

      return mods.sort((a, b) => b.modifiedTime - a.modifiedTime);
    } catch (err) {
      console.error('Failed reading mods directory:', err);
      return [];
    }
  }

  /**
   * Toggles a mod between enabled (.jar) and disabled (.jar.disabled)
   */
  public static toggleMod(fileName: string, gameDir: string): { success: boolean; newFileName?: string } {
    const modsDir = path.join(gameDir, 'mods');
    const oldPath = path.join(modsDir, fileName);

    if (!fs.existsSync(oldPath)) {
      return { success: false };
    }

    let newFileName = fileName;
    if (fileName.endsWith('.jar')) {
      newFileName = `${fileName}.disabled`;
    } else if (fileName.endsWith('.jar.disabled')) {
      newFileName = fileName.replace(/\.disabled$/, '');
    }

    const newPath = path.join(modsDir, newFileName);
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true, newFileName };
    } catch (err) {
      console.error('Failed to rename mod file:', err);
      return { success: false };
    }
  }

  /**
   * Deletes a mod from the mods folder
   */
  public static deleteMod(fileName: string, gameDir: string): { success: boolean } {
    const filePath = path.join(gameDir, 'mods', fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { success: true };
    } catch (err) {
      console.error('Failed to delete mod file:', err);
      return { success: false };
    }
  }

  /**
   * Opens the .minecraft/mods folder in File Explorer
   */
  public static openModsFolder(gameDir: string): void {
    const modsDir = path.join(gameDir, 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }
    shell.openPath(modsDir);
  }

  /**
   * Handles dropped mod files - copies them to the mods folder
   * Accepts both file paths and file:// URIs
   */
  public static async handleDroppedModFiles(
    files: string[],
    gameDir: string
  ): Promise<{ success: boolean; copied: string[]; errors: string[] }> {
    const modsDir = path.join(gameDir, 'mods');
    
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }

    const copied: string[] = [];
    const errors: string[] = [];

    for (const fileOrUri of files) {
      try {
        // Handle file:// URIs (from Electron drag & drop)
        let filePath = fileOrUri;
        
        // Check if it's a file URI (starts with file:// or file:\/)
        if (fileOrUri.startsWith('file://')) {
          // Convert file:// URI to actual path
          // Windows: file:///C:/path/to/file.jar -> C:\path\to\file.jar
          // Mac/Linux: file:///path/to/file.jar -> /path/to/file.jar
          filePath = fileOrUri.replace(/^file:\/\//, '');
          // Windows specific: replace forward slashes with backslashes
          if (process.platform === 'win32') {
            filePath = filePath.replace(/\//g, '\\');
          }
        }
        
        // Decode URI encoded characters (spaces become %20, etc.)
        try {
          filePath = decodeURI(filePath);
        } catch (e) {
          // Ignore decode errors
        }

        const fileName = path.basename(filePath);
        
        // Only accept .jar and .zip files
        if (!fileName.toLowerCase().endsWith('.jar') && !fileName.toLowerCase().endsWith('.zip')) {
          errors.push(`${fileName}: Not a valid mod file (must be .jar or .zip)`);
          continue;
        }

        const destPath = path.join(modsDir, fileName);
        
        // Check if file already exists
        if (fs.existsSync(destPath)) {
          errors.push(`${fileName}: File already exists in mods folder`);
          continue;
        }

        // Check if source file exists
        if (!fs.existsSync(filePath)) {
          errors.push(`${fileName}: Source file not found at ${filePath}`);
          continue;
        }

        // Copy file
        fs.copyFileSync(filePath, destPath);
        copied.push(fileName);
      } catch (err: any) {
        errors.push(`${path.basename(fileOrUri)}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      copied,
      errors
    };
  }

  /**
   * Validates if a file is a valid mod file
   */
  public static isValidModFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return fileName.endsWith('.jar') || fileName.endsWith('.zip');
  }
}
