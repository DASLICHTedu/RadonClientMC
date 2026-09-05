"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DownloaderService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const version_manifest_1 = require("./version-manifest");
class DownloaderService {
    concurrency = 16; // Fast parallel downloads
    /**
     * Validates file existence and SHA1 integrity
     */
    static isFileValid(filePath, expectedSha1) {
        if (!fs_1.default.existsSync(filePath))
            return false;
        if (!expectedSha1)
            return true; // If no sha1 provided, assume valid if exists and size > 0
        try {
            const stats = fs_1.default.statSync(filePath);
            if (stats.size === 0)
                return false;
            const fileBuffer = fs_1.default.readFileSync(filePath);
            const hash = crypto_1.default.createHash('sha1').update(fileBuffer).digest('hex');
            return hash.toLowerCase() === expectedSha1.toLowerCase();
        }
        catch {
            return false;
        }
    }
    /**
     * Downloads a single file with retry mechanism
     */
    async downloadSingleFile(url, destPath, expectedSha1, retries = 3) {
        const parentDir = path_1.default.dirname(destPath);
        if (!fs_1.default.existsSync(parentDir)) {
            fs_1.default.mkdirSync(parentDir, { recursive: true });
        }
        if (DownloaderService.isFileValid(destPath, expectedSha1)) {
            return;
        }
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios_1.default.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 20000,
                });
                const buffer = Buffer.from(response.data);
                // Verify hash if provided
                if (expectedSha1) {
                    const hash = crypto_1.default.createHash('sha1').update(buffer).digest('hex');
                    if (hash.toLowerCase() !== expectedSha1.toLowerCase()) {
                        throw new Error(`SHA1 mismatch for ${url}: expected ${expectedSha1}, got ${hash}`);
                    }
                }
                fs_1.default.writeFileSync(destPath, buffer);
                return;
            }
            catch (err) {
                if (attempt === retries) {
                    throw new Error(`Failed to download ${url} after ${retries} attempts: ${err.message}`);
                }
                await new Promise(r => setTimeout(r, 500 * attempt));
            }
        }
    }
    /**
     * Executes batch download tasks in parallel with progress tracking
     */
    async executeDownloadBatch(tasks, phase, onProgress) {
        const totalFiles = tasks.length;
        let completedFiles = 0;
        let completedBytes = 0;
        let totalBytes = tasks.reduce((acc, t) => acc + (t.size || 0), 0);
        const startTime = Date.now();
        const report = (currentFileName = '') => {
            if (!onProgress)
                return;
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
        const pendingTasks = [];
        for (const task of tasks) {
            if (DownloaderService.isFileValid(task.destPath, task.sha1)) {
                completedFiles++;
                completedBytes += task.size || 0;
            }
            else {
                pendingTasks.push(task);
            }
        }
        report('Downloading...');
        // Parallel queue worker
        let currentIndex = 0;
        const runWorker = async () => {
            while (currentIndex < pendingTasks.length) {
                const task = pendingTasks[currentIndex++];
                const fileName = path_1.default.basename(task.destPath);
                try {
                    await this.downloadSingleFile(task.url, task.destPath, task.sha1);
                    completedFiles++;
                    completedBytes += task.size || 0;
                    report(fileName);
                }
                catch (err) {
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
    async downloadVersion(versionDetail, gameDir, onProgress) {
        const versionId = versionDetail.id;
        const versionDir = path_1.default.join(gameDir, 'versions', versionId);
        const librariesDir = path_1.default.join(gameDir, 'libraries');
        const assetsDir = path_1.default.join(gameDir, 'assets');
        const nativesDir = path_1.default.join(versionDir, 'natives-windows');
        if (!fs_1.default.existsSync(nativesDir)) {
            fs_1.default.mkdirSync(nativesDir, { recursive: true });
        }
        // 1. Download Client JAR
        if (versionDetail.downloads && versionDetail.downloads.client) {
            const clientDl = versionDetail.downloads.client;
            const clientJarPath = path_1.default.join(versionDir, `${versionId}.jar`);
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
        const libraryTasks = [];
        const nativeJarsToExtract = [];
        for (const lib of versionDetail.libraries) {
            const downloadInfo = version_manifest_1.VersionManifestService.getLibraryDownloadInfo(lib);
            if (!downloadInfo)
                continue;
            const destPath = path_1.default.join(librariesDir, downloadInfo.path);
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
            if (fs_1.default.existsSync(jarPath)) {
                try {
                    const zip = new adm_zip_1.default(jarPath);
                    const zipEntries = zip.getEntries();
                    for (const entry of zipEntries) {
                        if (entry.isDirectory)
                            continue;
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
                            const fileName = path_1.default.basename(entryName);
                            const data = entry.getData();
                            // Base directory
                            fs_1.default.writeFileSync(path_1.default.join(nativesDir, fileName), data);
                            // Subdirectories used by modern version JVM args
                            for (const sub of ['lwjgl', 'java', 'jna', 'netty']) {
                                const subDir = path_1.default.join(nativesDir, sub);
                                if (!fs_1.default.existsSync(subDir)) {
                                    fs_1.default.mkdirSync(subDir, { recursive: true });
                                }
                                fs_1.default.writeFileSync(path_1.default.join(subDir, fileName), data);
                            }
                        }
                    }
                }
                catch (err) {
                    console.warn(`Failed to extract native jar ${jarPath}:`, err);
                }
            }
        }
        // 4. Download Assets Index & Objects
        if (versionDetail.assetIndex) {
            const indexInfo = versionDetail.assetIndex;
            const indexFilePath = path_1.default.join(assetsDir, 'indexes', `${indexInfo.id}.json`);
            // Download index json
            await this.downloadSingleFile(indexInfo.url, indexFilePath, indexInfo.sha1);
            // Parse asset index objects
            if (fs_1.default.existsSync(indexFilePath)) {
                try {
                    const indexJson = JSON.parse(fs_1.default.readFileSync(indexFilePath, 'utf8'));
                    const objects = indexJson.objects || {};
                    const assetTasks = [];
                    for (const assetKey of Object.keys(objects)) {
                        const asset = objects[assetKey];
                        const hash = asset.hash;
                        const prefix = hash.substring(0, 2);
                        const assetUrl = `https://resources.download.minecraft.net/${prefix}/${hash}`;
                        const destPath = path_1.default.join(assetsDir, 'objects', prefix, hash);
                        assetTasks.push({
                            url: assetUrl,
                            destPath,
                            sha1: hash,
                            size: asset.size,
                        });
                    }
                    await this.executeDownloadBatch(assetTasks, 'assets', onProgress);
                }
                catch (err) {
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
exports.DownloaderService = DownloaderService;
