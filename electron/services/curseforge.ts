import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { CurseForgeSearchResult, CurseForgeModInfo, CurseForgeFile } from '../types';

// CurseForge API v1
export class CurseForgeService {
  private static API_BASE_URL = 'https://addons-ecs.forgesvc.net/api/v2';
  private static CF_API_URL = 'https://curseforge-api.forgesvc.net/api';
  private static CURSEFORGE_API_KEY = ''; // Can be added if needed
  
  // Minecraft game ID on CurseForge
  private static MINECRAFT_GAME_ID = 432;

  /**
   * Searches CurseForge for Minecraft mods
   */
  public static async searchMods(
    query: string = '',
    gameVersion: string = '',
    modLoader: string = '',
    categoryId: number = 0,
    sortField: number = 1, // 1 = popularity, 2 = last updated, 3 = name, 4 = author, 5 = total downloads, 6 = category
    sortOrder: string = 'desc',
    pageSize: number = 24,
    page: number = 0
  ): Promise<CurseForgeSearchResult[]> {
    try {
      const params: Record<string, any> = {
        gameId: CurseForgeService.MINECRAFT_GAME_ID,
        sectionId: 6, // Mods section
        pageSize: pageSize,
        pageIndex: page,
        sortField: sortField,
        sortOrder: sortOrder,
      };

      if (query.trim()) {
        params.searchFilter = query.trim();
      }

      if (gameVersion) {
        params.gameVersion = gameVersion;
      }

      if (modLoader && modLoader !== 'vanilla') {
        // Map modloader to CurseForge mod loader type
        const cfModLoader = this.mapModLoaderToCurseForge(modLoader);
        if (cfModLoader) {
          params.modLoaderType = cfModLoader;
        }
      }

      if (categoryId > 0) {
        params.categoryId = categoryId;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'RadonClient/1.0.0',
        'Accept': 'application/json',
      };

      // If API key is configured, add it
      if (CurseForgeService.CURSEFORGE_API_KEY) {
        headers['x-api-key'] = CurseForgeService.CURSEFORGE_API_KEY;
      }

      const response = await axios.get(`${CurseForgeService.API_BASE_URL}/addon/search`, {
        params,
        headers,
        timeout: 10000,
      });

      const results: CurseForgeSearchResult[] = [];
      const addons = response.data?.data || [];

      for (const addon of addons) {
        const latestFiles = addon.latestFiles || [];
        const gameVersions = addon.latestFilesIndexed || [];
        
        results.push({
          id: addon.id,
          name: addon.name,
          slug: addon.slug,
          authors: addon.authors || [{ name: 'Unknown', id: 0 }],
          shortDescription: addon.summary,
          description: addon.description,
          categories: addon.categories || [],
          logo: addon.logo,
          screenshots: addon.screenshots || [],
          downloadCount: addon.downloadCount || 0,
          likeCount: addon.likeCount || 0,
          dateCreated: addon.dateCreated,
          dateModified: addon.dateModified,
          dateReleased: addon.dateReleased,
          gameVersions: Object.keys(gameVersions),
          latestFiles: latestFiles.map((f: any) => ({
            id: f.id,
            displayName: f.displayName,
            fileName: f.fileName,
            fileDate: f.fileDate,
            fileLength: f.fileLength,
            downloadCount: f.downloadCount || 0,
            downloadUrl: f.downloadUrl,
            gameVersions: f.gameVersions || [],
            modLoaders: f.modLoaders || [],
            isPrimary: f.isPrimary || false,
            alternateFileId: f.alternateFileId,
            dependencies: f.dependencies || [],
            modules: f.modules || [],
          })),
          modLoaders: addon.latestFiles?.reduce((acc: string[], f: any) => {
            if (f.modLoaders && f.modLoaders.length > 0) {
              acc.push(...f.modLoaders);
            }
            return acc;
          }, []),
        });
      }

      return results;
    } catch (err: any) {
      console.error('Failed to search CurseForge:', err.message);
      console.error('Error details:', err.response?.data || err.stack);
      return [];
    }
  }

  /**
   * Gets information about a specific mod by its slug or ID
   */
  public static async getModInfo(slugOrId: string): Promise<CurseForgeModInfo | null> {
    try {
      const isNumeric = !isNaN(parseInt(slugOrId));
      const id = isNumeric ? parseInt(slugOrId) : 0;

      let response;
      if (id > 0) {
        // Get by ID
        response = await axios.get(`${CurseForgeService.API_BASE_URL}/addon/${id}`, {
          headers: { 'User-Agent': 'RadonClient/1.0.0' },
          timeout: 10000,
        });
      } else {
        // Get by slug
        response = await axios.get(`${CurseForgeService.API_BASE_URL}/addon/slug/${slugOrId}`, {
          headers: { 'User-Agent': 'RadonClient/1.0.0' },
          timeout: 10000,
        });
      }

      const addon = response.data?.data;
      if (!addon) {
        return null;
      }

      return {
        id: addon.id,
        name: addon.name,
        slug: addon.slug,
        authors: addon.authors || [{ name: 'Unknown' }],
        shortDescription: addon.summary,
        description: addon.description,
        categories: addon.categories || [],
        logo: addon.logo || { thumbnailUrl: '' },
        downloadCount: addon.downloadCount || 0,
        latestFiles: addon.latestFiles || [],
        modLoaders: addon.latestFiles?.reduce((acc: string[], f: any) => {
          if (f.modLoaders && f.modLoaders.length > 0) {
            acc.push(...f.modLoaders);
          }
          return acc;
        }, []),
        gameVersions: Object.keys(addon.latestFilesIndexed || {}),
      };
    } catch (err: any) {
      console.error('Failed to get mod info:', err.message);
      return null;
    }
  }

  /**
   * Gets the download URL for a specific mod file
   */
  public static async getFileDownloadUrl(fileId: number): Promise<string | null> {
    try {
      const response = await axios.get(`${CurseForgeService.API_BASE_URL}/addon/file/${fileId}/download-url`, {
        headers: { 'User-Agent': 'RadonClient/1.0.0' },
        timeout: 10000,
      });

      return response.data?.data || null;
    } catch (err: any) {
      console.error('Failed to get file download URL:', err.message);
      return null;
    }
  }

  /**
   * Downloads and installs a mod from CurseForge
   */
  public static async installMod(
    projectId: string | number,
    gameVersion: string,
    modLoader: string,
    gameDir: string
  ): Promise<{ success: boolean; fileName?: string; error?: string }> {
    try {
      const modsDir = path.join(gameDir, 'mods');
      if (!fs.existsSync(modsDir)) {
        fs.mkdirSync(modsDir, { recursive: true });
      }

      // Get mod info
      const modInfo = await CurseForgeService.getModInfo(projectId.toString());
      if (!modInfo) {
        return { success: false, error: `Mod not found: ${projectId}` };
      }

      // Find compatible file
      const compatibleFile = this.findCompatibleFile(modInfo.latestFiles, gameVersion, modLoader);
      if (!compatibleFile) {
        return { 
          success: false, 
          error: `No compatible file found for ${modLoader} ${gameVersion}.` 
        };
      }

      // Get download URL
      let downloadUrl = compatibleFile.downloadUrl;
      if (!downloadUrl) {
        // Try to get URL from file ID
        const url = await CurseForgeService.getFileDownloadUrl(compatibleFile.id);
        if (!url) {
          return { success: false, error: 'Could not retrieve download URL' };
        }
        downloadUrl = url;
      }

      // Download the file
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'RadonClient/1.0.0' },
      });

      const destPath = path.join(modsDir, compatibleFile.fileName);
      fs.writeFileSync(destPath, Buffer.from(response.data));

      return { success: true, fileName: compatibleFile.fileName };
    } catch (err: any) {
      console.error('Failed to install CurseForge mod:', err.message);
      return { success: false, error: err.message || 'Download failed' };
    }
  }

  /**
   * Finds a compatible file from the list of latest files
   */
  private static findCompatibleFile(
    files: CurseForgeFile[],
    gameVersion: string,
    modLoader: string
  ): CurseForgeFile | null {
    const cfModLoader = this.mapModLoaderToCurseForge(modLoader);
    
    // Try to find exact match
    for (const file of files) {
      if (!file.isPrimary) continue;
      
      const versionMatch = file.gameVersions.some(v => v === gameVersion);
      const loaderMatch = file.modLoaders.some(l => l.toLowerCase() === cfModLoader?.toLowerCase());
      
      if (versionMatch && loaderMatch) {
        return file;
      }
    }

    // Try without loader filter
    for (const file of files) {
      if (!file.isPrimary) continue;
      
      const versionMatch = file.gameVersions.some(v => v === gameVersion);
      if (versionMatch) {
        return file;
      }
    }

    // Return first primary file as fallback
    return files.find(f => f.isPrimary) || files[0] || null;
  }

  /**
   * Maps our modloader type to CurseForge mod loader type
   */
  private static mapModLoaderToCurseForge(modLoader: string): string | null {
    const mapping: Record<string, string> = {
      'fabric': 'fabric',
      'forge': 'forge',
      'neoforge': 'neoforge',
      'quilt': 'quilt',
      'vanilla': 'vanilla',
    };
    return mapping[modLoader.toLowerCase()] || null;
  }

  /**
   * Get CurseForge categories for Minecraft mods
   */
  public static async getCategories(): Promise<Array<{ id: number; name: string; slug: string }>> {
    try {
      const response = await axios.get(`${CurseForgeService.API_BASE_URL}/category/game/${CurseForgeService.MINECRAFT_GAME_ID}`, {
        headers: { 'User-Agent': 'RadonClient/1.0.0' },
        timeout: 10000,
      });

      const categories = response.data?.data?.classes || [];
      const filtered = categories.filter((c: any) => c.parentCategoryId === 6); // Filter mod categories
      
      return filtered.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      }));
    } catch (err: any) {
      console.error('Failed to get CurseForge categories:', err.message);
      // Return default categories
      return [
        { id: 0, name: 'All', slug: 'all' },
        { id: 6, name: 'Mods', slug: 'mods' },
        { id: 12, name: 'Worlds', slug: 'worlds' },
        { id: 17, name: 'Resource Packs', slug: 'resource-packs' },
        { id: 22, name: 'Shaders', slug: 'shaders' },
        { id: 4471, name: 'Data Packs', slug: 'data-packs' },
      ];
    }
  }
}
