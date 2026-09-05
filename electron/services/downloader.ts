import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { VersionDetail, DownloadProgress } from '../types';
import { VersionManifestService } from './version-manifest';

export type ProgressCallback = (progress: DownloadProgress) => void;

interface DownloadTask {
  url: string;
  destPath: string;
  sha1?: string;
  size?: number;
  isNative?: boolean;
  extractExcludes?: string[];
}

export class DownloaderService {
  private concurrency = 16; // Fast parallel downloads

  /**
   * Validates file existence and SHA1 integrity
   */
  private static isFileValid(filePath: string, expectedSha1?: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    if (!expectedSha1) return true; // If no sha1 provided, assume valid if exists and size > 0

    try {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) return false;

      const fileBuffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha1').update(fileBuffer).digest('hex');
      return hash.toLowerCase() === expectedSha1.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Downloads a single file with retry mechanism
   */
  private async downloadSingleFile(url: string, destPath: string, expectedSha1?: string, retries = 3): Promise<void> {
    const parentDir = path.dirname(destPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (DownloaderService.isFileValid(destPath, expectedSha1)) {
      return;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 20000,
        });

        const buffer = Buffer.from(response.data);

        // Verify hash if provided
        if (expectedSha1) {
          const hash = crypto.createHash('sha1').update(buffer).digest('hex');
          if (hash.toLowerCase() !== expectedSha1.toLowerCase()) {
            throw new Error(`SHA1 mismatch for ${url}: expected ${expectedSha1}, got ${hash}`);
          }
        }

        fs.writeFileSync(destPath, buffer);
        return;
      } catch (err) {
        if (attempt === retries) {
          throw new Error(`Failed to download ${url} after ${retries} attempts: ${(err as Error).message}`);
        }
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }

  /**
   * Executes batch download tasks in parallel with progress tracking
   */
  private async executeDownloadBatch(
    tasks: DownloadTask[],
    phase: DownloadProgress['phase'],
    onProgress?: ProgressCallback
  ): Promise<void> {
    const totalFiles = tasks.length;
    let completedFiles = 0;
    let completedBytes = 0;
    let totalBytes = tasks.reduce((acc, t) => acc + (t.size || 0), 0);

    const startTime = Date.now();

    const report = (currentFileName = '') => {
      if (!onProgress) return;
      const elapsedSeconds = Math.max((Date.now() - startTime) / 1000, 0.1);
      const speedMBs = (completedBytes / (1024 * 1024) / elapsedSeconds).toFixed(1);
      const percent = totalFiles > 0 ? Math.floor((completedFiles / totalFiles) * 100) : 100;

      onProgress({
        phase,
        currentFile: currentFileName,
        totalFiles,
        completedFiles,
        totalBytes,
        completedBytes,
        percent,
        speed: `${speedMBs} MB/s`,
      });
    };

    report('Checking existing files...');

    // Filter out already valid files
    const pendingTasks: DownloadTask[] = [];
    for (const task of tasks) {
      if (DownloaderService.isFileValid(task.destPath, task.sha1)) {
        completedFiles++;
        completedBytes += task.size || 0;
      } else {
        pendingTasks.push(task);
      }
    }

    report('Downloading...');

    // Parallel queue worker
    let currentIndex = 0;
    const runWorker = async () => {
      while (currentIndex < pendingTasks.length) {
        const task = pendingTasks[currentIndex++];
        const fileName = path.basename(task.destPath);
        try {
          await this.downloadSingleFile(task.url, task.destPath, task.sha1);
          completedFiles++;
          completedBytes += task.size || 0;
          report(fileName);
        } catch (err) {
          console.error(`Error downloading ${task.url}:`, err);
          throw err;
        }
      }
    };

    const workers = Array.from({ length: Math.min(this.concurrency, pendingTasks.length || 1) }, () => runWorker());
    await Promise.all(workers);
    report('Completed batch.');
  }

  /**
   * Downloads all required game assets, libraries, client JAR, and extracts natives
   */
  public async downloadVersion(
    versionDetail: VersionDetail,
    gameDir: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const versionId = versionDetail.id;
    const versionDir = path.join(gameDir, 'versions', versionId);
    const librariesDir = path.join(gameDir, 'libraries');
    const assetsDir = path.join(gameDir, 'assets');
    const nativesDir = path.join(versionDir, 'natives-windows');

    if (!fs.existsSync(nativesDir)) {
      fs.mkdirSync(nativesDir, { recursive: true });
    }

    // 1. Download Client JAR
    if (versionDetail.downloads && versionDetail.downloads.client) {
      const clientDl = versionDetail.downloads.client;
      const clientJarPath = path.join(versionDir, `${versionId}.jar`);

      onProgress?.({
        phase: 'client',
        currentFile: `${versionId}.jar`,
        totalFiles: 1,
        completedFiles: 0,
        totalBytes: clientDl.size,
        completedBytes: 0,
        percent: 0,
        speed: '0 MB/s',
      });

      await this.downloadSingleFile(clientDl.url, clientJarPath, clientDl.sha1);

      onProgress?.({
        phase: 'client',
        currentFile: `${versionId}.jar`,
        totalFiles: 1,
        completedFiles: 1,
        totalBytes: clientDl.size,
        completedBytes: clientDl.size,
        percent: 100,
        speed: 'Done',
      });
    }

    // 2. Download Libraries & Natives
    const libraryTasks: DownloadTask[] = [];
    const nativeJarsToExtract: Array<{ jarPath: string; excludes?: string[] }> = [];

    for (const lib of versionDetail.libraries) {
      const downloadInfo = VersionManifestService.getLibraryDownloadInfo(lib);
      if (!downloadInfo) continue;

      const destPath = path.join(librariesDir, downloadInfo.path);
      libraryTasks.push({
        url: downloadInfo.url,
        destPath,
        sha1: downloadInfo.sha1,
        size: downloadInfo.size,
        isNative: downloadInfo.isNative,
      });

      if (downloadInfo.isNative) {
        nativeJarsToExtract.push({
          jarPath: destPath,
          excludes: lib.extract?.exclude,
        });
      }
    }

    await this.executeDownloadBatch(libraryTasks, 'libraries', onProgress);

    // 3. Extract Natives to natives-windows
    onProgress?.({
      phase: 'natives',
      currentFile: 'Extracting Windows DLLs...',
      totalFiles: nativeJarsToExtract.length,
      completedFiles: 0,
      totalBytes: 0,
      completedBytes: 0,
      percent: 0,
      speed: 'Local',
    });

    for (let i = 0; i < nativeJarsToExtract.length; i++) {
      const { jarPath, excludes } = nativeJarsToExtract[i];
      if (fs.existsSync(jarPath)) {
        try {
          const zip = new AdmZip(jarPath);
          const zipEntries = zip.getEntries();

          for (const entry of zipEntries) {
            if (entry.isDirectory) continue;

            const entryName = entry.entryName;
            // Check excludes (e.g. META-INF/)
            if (excludes && excludes.some(ex => entryName.startsWith(ex))) {
              continue;
            }
            if (entryName.startsWith('META-INF/')) {
              continue;
            }

            // Only extract DLLs or native libraries
            if (entryName.endsWith('.dll') || entryName.endsWith('.so') || entryName.endsWith('.dylib')) {
              const fileName = path.basename(entryName);
              const data = entry.getData();
              
              // Base directory
              fs.writeFileSync(path.join(nativesDir, fileName), data);

              // Subdirectories used by modern version JVM args
              for (const sub of ['lwjgl', 'java', 'jna', 'netty']) {
                const subDir = path.join(nativesDir, sub);
                if (!fs.existsSync(subDir)) {
                  fs.mkdirSync(subDir, { recursive: true });
                }
                fs.writeFileSync(path.join(subDir, fileName), data);
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to extract native jar ${jarPath}:`, err);
        }
      }
    }

    // 4. Download Assets Index & Objects
    if (versionDetail.assetIndex) {
      const indexInfo = versionDetail.assetIndex;
      const indexFilePath = path.join(assetsDir, 'indexes', `${indexInfo.id}.json`);

      // Download index json
      await this.downloadSingleFile(indexInfo.url, indexFilePath, indexInfo.sha1);

      // Parse asset index objects
      if (fs.existsSync(indexFilePath)) {
        try {
          const indexJson = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
          const objects = indexJson.objects || {};
          const assetTasks: DownloadTask[] = [];

          for (const assetKey of Object.keys(objects)) {
            const asset = objects[assetKey];
            const hash = asset.hash;
            const prefix = hash.substring(0, 2);
            const assetUrl = `https://resources.download.minecraft.net/${prefix}/${hash}`;
            const destPath = path.join(assetsDir, 'objects', prefix, hash);

            assetTasks.push({
              url: assetUrl,
              destPath,
              sha1: hash,
              size: asset.size,
            });
          }

          await this.executeDownloadBatch(assetTasks, 'assets', onProgress);
        } catch (err) {
          console.warn('Failed to download full asset index, continuing:', err);
        }
      }
    }

    onProgress?.({
      phase: 'ready',
      currentFile: 'All files verified.',
      totalFiles: 1,
      completedFiles: 1,
      totalBytes: 1,
      completedBytes: 1,
      percent: 100,
      speed: 'Ready',
    });
  }
}

