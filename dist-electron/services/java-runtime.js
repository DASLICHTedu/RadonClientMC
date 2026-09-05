"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JavaRuntimeService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const MOJANG_JAVA_MANIFEST = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
class JavaRuntimeService {
    /**
     * Detects the major version of a java/javaw executable (e.g. 8, 17, 21, 24, 25)
     */
    static getBinaryVersion(javaPath) {
        try {
            let testBinary = javaPath;
            if (javaPath.endsWith('javaw.exe')) {
                const javaExe = javaPath.replace(/javaw\.exe$/, 'java.exe');
                if (fs_1.default.existsSync(javaExe)) {
                    testBinary = javaExe;
                }
            }
            const out = (0, child_process_1.execSync)(`"${testBinary}" -version`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            const match = out.match(/version "([0-9]+)(\.([0-9]+))?/);
            if (match) {
                const first = parseInt(match[1]);
                if (first === 1 && match[3])
                    return parseInt(match[3]);
                return first;
            }
        }
        catch (err) {
            const stderr = err.stderr ? err.stderr.toString() : '';
            const match = stderr.match(/version "([0-9]+)(\.([0-9]+))?/);
            if (match) {
                const first = parseInt(match[1]);
                if (first === 1 && match[3])
                    return parseInt(match[3]);
                return first;
            }
        }
        return 0;
    }
    /**
     * Tries to locate a valid javaw.exe or java.exe on the system matching required major version
     */
    static findSystemJava(requiredMajorVersion = 8) {
        const candidates = [];
        // 1. JAVA_HOME environment variable
        if (process.env.JAVA_HOME) {
            candidates.push(path_1.default.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'));
            candidates.push(path_1.default.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
        }
        // 2. Standard Minecraft Official Launcher Runtimes
        const appData = process.env.APPDATA || path_1.default.join(os_1.default.homedir(), 'AppData', 'Roaming');
        const localAppData = process.env.LOCALAPPDATA || path_1.default.join(os_1.default.homedir(), 'AppData', 'Local');
        const mcRuntimesDir = path_1.default.join(appData, '.minecraft', 'runtime');
        const msStoreRuntimeDir = path_1.default.join(localAppData, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime');
        const checkRuntimeFolders = [mcRuntimesDir, msStoreRuntimeDir];
        for (const rDir of checkRuntimeFolders) {
            if (fs_1.default.existsSync(rDir)) {
                try {
                    const components = fs_1.default.readdirSync(rDir);
                    for (const comp of components) {
                        candidates.push(path_1.default.join(rDir, comp, 'windows-x64', comp, 'bin', 'javaw.exe'));
                        candidates.push(path_1.default.join(rDir, comp, 'bin', 'javaw.exe'));
                    }
                }
                catch { }
            }
        }
        // 3. Program Files Java / Adoptium / Zulu
        const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const commonJavaDirs = [
            path_1.default.join(programFiles, 'Eclipse Adoptium'),
            path_1.default.join(programFiles, 'Java'),
            path_1.default.join(programFiles, 'Zulu'),
            path_1.default.join(programFiles, 'Microsoft'),
            path_1.default.join(programFilesX86, 'Java'),
        ];
        for (const dir of commonJavaDirs) {
            if (fs_1.default.existsSync(dir)) {
                try {
                    const subdirs = fs_1.default.readdirSync(dir);
                    for (const sub of subdirs) {
                        candidates.push(path_1.default.join(dir, sub, 'bin', 'javaw.exe'));
                        candidates.push(path_1.default.join(dir, sub, 'bin', 'java.exe'));
                    }
                }
                catch { }
            }
        }
        // 4. Test PATH javaw / java
        try {
            const pathOutput = (0, child_process_1.execSync)('where javaw.exe', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const firstLine = pathOutput.split('\r\n')[0].split('\n')[0].trim();
            if (firstLine && fs_1.default.existsSync(firstLine)) {
                candidates.unshift(firstLine);
            }
        }
        catch { }
        // Find candidate that satisfies major version
        for (const cand of candidates) {
            if (fs_1.default.existsSync(cand)) {
                const ver = JavaRuntimeService.getBinaryVersion(cand);
                if (ver >= requiredMajorVersion) {
                    return cand;
                }
            }
        }
        return null;
    }
    /**
     * Determines which Java component name is needed based on Minecraft version detail
     */
    static getRequiredComponent(javaVersionObj, versionId = '1.8.9') {
        if (javaVersionObj && javaVersionObj.component) {
            const comp = javaVersionObj.component;
            let major = javaVersionObj.majorVersion;
            if (!major) {
                if (comp.includes('epsilon') || comp.includes('25'))
                    major = 25;
                else if (comp.includes('delta') || comp.includes('21'))
                    major = 21;
                else if (comp.includes('gamma') || comp.includes('17'))
                    major = 17;
                else if (comp.includes('beta') || comp.includes('16'))
                    major = 16;
                else
                    major = 8;
            }
            return { component: comp, major };
        }
        // Heuristics for versions without explicit javaVersion object
        if (versionId.startsWith('1.8') || versionId.startsWith('1.7') || versionId.startsWith('1.12') || versionId.startsWith('1.16')) {
            return { component: 'java-runtime-alpha', major: 8 };
        }
        else if (versionId.startsWith('1.17') || versionId.startsWith('1.18') || versionId.startsWith('1.19') || versionId.startsWith('1.20.1') || versionId.startsWith('1.20.2') || versionId.startsWith('1.20.4')) {
            return { component: 'java-runtime-gamma', major: 17 };
        }
        else if (versionId.startsWith('1.20') || versionId.startsWith('1.21')) {
            return { component: 'java-runtime-delta', major: 21 };
        }
        else {
            return { component: 'java-runtime-epsilon', major: 25 };
        }
    }
    /**
     * Automatically downloads official Mojang JRE files or Adoptium portable JRE for Windows
     */
    async ensureJava(gameDir, componentName = 'java-runtime-alpha', majorVersion = 8, customPath, onProgress) {
        // 1. Custom path specified in settings
        if (customPath && customPath.trim() !== '' && fs_1.default.existsSync(customPath)) {
            const ver = JavaRuntimeService.getBinaryVersion(customPath);
            if (ver >= majorVersion) {
                return customPath;
            }
        }
        // 2. Check local gameDir runtime folder
        const targetCompDir = path_1.default.join(gameDir, 'runtime', componentName);
        const existingCompJavaw = JavaRuntimeService.findJavawInDir(targetCompDir);
        if (existingCompJavaw) {
            const ver = JavaRuntimeService.getBinaryVersion(existingCompJavaw);
            if (ver >= majorVersion) {
                return existingCompJavaw;
            }
        }
        // 3. Check system Java
        const systemJava = JavaRuntimeService.findSystemJava(majorVersion);
        if (systemJava) {
            return systemJava;
        }
        // 4. Download from Mojang official JRE manifest (Primary source)
        onProgress?.({
            phase: 'java',
            currentFile: `Downloading Mojang JRE ${majorVersion} (${componentName})...`,
            totalFiles: 1,
            completedFiles: 0,
            totalBytes: 0,
            completedBytes: 0,
            percent: 5,
            speed: 'Connecting...',
        });
        try {
            const manifestRes = await axios_1.default.get(MOJANG_JAVA_MANIFEST, { timeout: 10000 });
            const manifest = manifestRes.data;
            const osKey = 'windows-x64';
            if (manifest[osKey] && manifest[osKey][componentName] && manifest[osKey][componentName].length > 0) {
                const jreManifestUrl = manifest[osKey][componentName][0].manifest.url;
                const jreDetailRes = await axios_1.default.get(jreManifestUrl, { timeout: 10000 });
                const jreFiles = jreDetailRes.data.files || {};
                if (!fs_1.default.existsSync(targetCompDir)) {
                    fs_1.default.mkdirSync(targetCompDir, { recursive: true });
                }
                const fileKeys = Object.keys(jreFiles);
                const downloadQueue = [];
                for (const fileKey of fileKeys) {
                    const fileObj = jreFiles[fileKey];
                    const destPath = path_1.default.join(targetCompDir, fileKey);
                    if (fileObj.type === 'directory') {
                        if (!fs_1.default.existsSync(destPath)) {
                            fs_1.default.mkdirSync(destPath, { recursive: true });
                        }
                    }
                    else if (fileObj.type === 'file' && fileObj.downloads && fileObj.downloads.raw) {
                        if (!fs_1.default.existsSync(destPath)) {
                            downloadQueue.push({
                                url: fileObj.downloads.raw.url,
                                dest: destPath,
                            });
                        }
                    }
                }
                const totalFiles = downloadQueue.length || 1;
                let completed = 0;
                // High speed parallel download pool
                const concurrency = 16;
                let queueIndex = 0;
                const worker = async () => {
                    while (queueIndex < downloadQueue.length) {
                        const item = downloadQueue[queueIndex++];
                        const parentDir = path_1.default.dirname(item.dest);
                        if (!fs_1.default.existsSync(parentDir)) {
                            fs_1.default.mkdirSync(parentDir, { recursive: true });
                        }
                        try {
                            const res = await axios_1.default.get(item.url, { responseType: 'arraybuffer', timeout: 15000 });
                            fs_1.default.writeFileSync(item.dest, Buffer.from(res.data));
                        }
                        catch (err) {
                            console.warn(`Failed downloading ${item.url}:`, err);
                        }
                        completed++;
                        if (completed % 15 === 0 || completed === totalFiles) {
                            onProgress?.({
                                phase: 'java',
                                currentFile: path_1.default.basename(item.dest),
                                totalFiles,
                                completedFiles: completed,
                                totalBytes: totalFiles,
                                completedBytes: completed,
                                percent: Math.min(Math.floor((completed / totalFiles) * 100), 100),
                                speed: 'Downloading JRE',
                            });
                        }
                    }
                };
                await Promise.all(Array.from({ length: Math.min(concurrency, downloadQueue.length || 1) }, () => worker()));
                const foundJavaw = JavaRuntimeService.findJavawInDir(targetCompDir);
                if (foundJavaw) {
                    return foundJavaw;
                }
            }
        }
        catch (err) {
            console.warn('Mojang JRE manifest download failed, trying Adoptium fallback:', err);
        }
        // 5. Adoptium fallback for Java 8, 17, 21
        try {
            const adoptiumTargetDir = path_1.default.join(gameDir, 'runtime', `adoptium-${majorVersion}`);
            const existingAdoptium = JavaRuntimeService.findJavawInDir(adoptiumTargetDir);
            if (existingAdoptium) {
                return existingAdoptium;
            }
            onProgress?.({
                phase: 'java',
                currentFile: `Downloading Adoptium JRE ${majorVersion}...`,
                totalFiles: 1,
                completedFiles: 0,
                totalBytes: 45000000,
                completedBytes: 0,
                percent: 20,
                speed: 'Downloading JRE',
            });
            const adoptiumUrl = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/windows/x64/jre/hotspot/normal/eclipse`;
            const response = await axios_1.default.get(adoptiumUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxRedirects: 5,
            });
            if (!fs_1.default.existsSync(adoptiumTargetDir)) {
                fs_1.default.mkdirSync(adoptiumTargetDir, { recursive: true });
            }
            const zip = new adm_zip_1.default(Buffer.from(response.data));
            zip.extractAllTo(adoptiumTargetDir, true);
            const foundJavaw = JavaRuntimeService.findJavawInDir(adoptiumTargetDir);
            if (foundJavaw) {
                return foundJavaw;
            }
        }
        catch (err) {
            console.warn('Adoptium JRE fallback failed:', err);
        }
        // Fallback default
        return 'javaw';
    }
    static findJavawInDir(dir) {
        if (!fs_1.default.existsSync(dir))
            return null;
        const direct = path_1.default.join(dir, 'bin', 'javaw.exe');
        if (fs_1.default.existsSync(direct))
            return direct;
        try {
            const items = fs_1.default.readdirSync(dir);
            for (const item of items) {
                const sub = path_1.default.join(dir, item);
                if (fs_1.default.statSync(sub).isDirectory()) {
                    const found = JavaRuntimeService.findJavawInDir(sub);
                    if (found)
                        return found;
                }
            }
        }
        catch { }
        return null;
    }
}
exports.JavaRuntimeService = JavaRuntimeService;
