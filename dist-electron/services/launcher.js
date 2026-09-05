"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LauncherService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const version_manifest_1 = require("./version-manifest");
class LauncherService {
    activeProcess = null;
    getActiveProcess() {
        return this.activeProcess;
    }
    killProcess() {
        if (this.activeProcess && !this.activeProcess.killed) {
            try {
                this.activeProcess.kill('SIGKILL');
                this.activeProcess = null;
                return true;
            }
            catch (err) {
                console.error('Failed to kill Minecraft process:', err);
            }
        }
        return false;
    }
    /**
     * Constructs the full Java classpath for the specified version
     */
    buildClasspath(versionDetail, gameDir) {
        const librariesDir = path_1.default.join(gameDir, 'libraries');
        const classpaths = [];
        // Add libraries
        for (const lib of versionDetail.libraries) {
            const downloadInfo = version_manifest_1.VersionManifestService.getLibraryDownloadInfo(lib);
            if (!downloadInfo)
                continue;
            // Do not include native zip files in standard classpath unless required
            if (!downloadInfo.isNative) {
                const fullLibPath = path_1.default.join(librariesDir, downloadInfo.path);
                if (fs_1.default.existsSync(fullLibPath)) {
                    classpaths.push(fullLibPath);
                }
            }
        }
        // Add Client JAR
        const clientJarPath = path_1.default.join(gameDir, 'versions', versionDetail.id, `${versionDetail.id}.jar`);
        if (fs_1.default.existsSync(clientJarPath)) {
            classpaths.push(clientJarPath);
        }
        // Windows uses ';' delimiter
        return classpaths.join(';');
    }
    /**
     * Detects the major version of the Java binary (e.g. 8, 17, 21, 24, 25)
     */
    static getJavaMajorVersion(javaPath) {
        try {
            let testBinary = javaPath;
            if (javaPath.endsWith('javaw.exe')) {
                const javaExe = javaPath.replace(/javaw\.exe$/, 'java.exe');
                if (fs_1.default.existsSync(javaExe)) {
                    testBinary = javaExe;
                }
            }
            const out = require('child_process').execSync(`"${testBinary}" -version`, {
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
        return 21; // Default modern LTS
    }
    /**
     * Compiles JVM arguments based on version specification and settings
     */
    buildJvmArguments(versionDetail, gameDir, settings, classpath, javaPath) {
        const args = [];
        const nativesDir = path_1.default.join(gameDir, 'versions', versionDetail.id, 'natives-windows');
        const javaMajor = javaPath ? LauncherService.getJavaMajorVersion(javaPath) : 21;
        // Memory arguments
        args.push(`-Xms${settings.ramMin}M`);
        args.push(`-Xmx${settings.ramMax}M`);
        // Ensure IPv4 stack is preferred (fixes Essential mod network & Mojang session server connection errors)
        args.push('-Djava.net.preferIPv4Stack=true');
        // Custom JVM Flags from user settings
        if (settings.jvmArgs && settings.jvmArgs.trim()) {
            const customFlags = settings.jvmArgs.split(/\s+/).filter(Boolean);
            args.push(...customFlags);
        }
        const processArg = (val) => {
            const substituted = this.substitutePlaceholders(val, versionDetail, gameDir, settings, classpath, nativesDir);
            // Filter out Java 24+ flags on Java < 24 to prevent crash
            if (javaMajor < 24 && (substituted.includes('--sun-misc-unsafe-memory-access') || substituted.includes('-XX:+UseCompactObjectHeaders'))) {
                return;
            }
            // Filter out Java 17+ flags on Java < 17
            if (javaMajor < 17 && substituted.includes('--enable-native-access')) {
                return;
            }
            args.push(substituted);
        };
        // Modern Minecraft format (has arguments.jvm)
        if (versionDetail.arguments && versionDetail.arguments.jvm) {
            for (const item of versionDetail.arguments.jvm) {
                if (typeof item === 'string') {
                    processArg(item);
                }
                else if (item.rules && version_manifest_1.VersionManifestService.evaluateRules(item.rules)) {
                    if (Array.isArray(item.value)) {
                        for (const val of item.value) {
                            processArg(val);
                        }
                    }
                    else if (typeof item.value === 'string') {
                        processArg(item.value);
                    }
                }
            }
        }
        else {
            // Legacy Minecraft format (1.8.9, 1.12.2, etc.)
            args.push(`-Djava.library.path=${nativesDir}`);
            args.push('-Dminecraft.launcher.brand=radon-client');
            args.push('-Dminecraft.launcher.version=1.0.0');
            args.push('-cp');
            args.push(classpath);
        }
        return args;
    }
    /**
     * Compiles game arguments (substituting auth tokens, assets, user info, etc.)
     */
    buildGameArguments(versionDetail, gameDir, account, settings, serverToJoin) {
        const args = [];
        const assetsDir = path_1.default.join(gameDir, 'assets');
        const assetIndexName = versionDetail.assetIndex ? versionDetail.assetIndex.id : versionDetail.assets || 'legacy';
        // Modern Minecraft format (arguments.game)
        if (versionDetail.arguments && versionDetail.arguments.game) {
            for (const item of versionDetail.arguments.game) {
                if (typeof item === 'string') {
                    args.push(this.substituteGamePlaceholders(item, versionDetail, gameDir, assetsDir, assetIndexName, account, settings));
                }
                else if (item.rules && version_manifest_1.VersionManifestService.evaluateRules(item.rules)) {
                    if (Array.isArray(item.value)) {
                        for (const val of item.value) {
                            args.push(this.substituteGamePlaceholders(val, versionDetail, gameDir, assetsDir, assetIndexName, account, settings));
                        }
                    }
                    else if (typeof item.value === 'string') {
                        args.push(this.substituteGamePlaceholders(item.value, versionDetail, gameDir, assetsDir, assetIndexName, account, settings));
                    }
                }
            }
        }
        else if (versionDetail.minecraftArguments) {
            // Legacy format string parsing (e.g. 1.8.9)
            const rawArgs = versionDetail.minecraftArguments.split(' ');
            for (const arg of rawArgs) {
                args.push(this.substituteGamePlaceholders(arg, versionDetail, gameDir, assetsDir, assetIndexName, account, settings));
            }
        }
        // Append resolution if not already present
        if (!args.includes('--width') && settings.resolutionWidth) {
            args.push('--width', settings.resolutionWidth.toString());
            args.push('--height', settings.resolutionHeight.toString());
        }
        if (settings.fullscreen && !args.includes('--fullscreen')) {
            args.push('--fullscreen');
        }
        // Direct server connect
        if (serverToJoin && serverToJoin.address) {
            const parts = serverToJoin.address.split(':');
            args.push('--server', parts[0]);
            if (parts[1]) {
                args.push('--port', parts[1]);
            }
        }
        return args;
    }
    substitutePlaceholders(template, versionDetail, gameDir, settings, classpath, nativesDir) {
        return template
            .replace(/\${natives_directory}/g, nativesDir)
            .replace(/\${launcher_name}/g, 'radon-client')
            .replace(/\${launcher_version}/g, '1.0.0')
            .replace(/\${classpath}/g, classpath)
            .replace(/\${classpath_separator}/g, ';')
            .replace(/\${library_directory}/g, path_1.default.join(gameDir, 'libraries'))
            .replace(/\${version_name}/g, versionDetail.id);
    }
    substituteGamePlaceholders(template, versionDetail, gameDir, assetsDir, assetIndexName, account, settings) {
        const rawUuid = account.uuid.replace(/-/g, '');
        const userType = account.type === 'msa' ? 'msa' : 'mojang';
        const xuid = account.xuid || rawUuid;
        const clientId = account.id || rawUuid;
        return template
            .replace(/\${auth_player_name}/g, account.username)
            .replace(/\${version_name}/g, versionDetail.id)
            .replace(/\${game_directory}/g, gameDir)
            .replace(/\${assets_root}/g, assetsDir)
            .replace(/\${game_assets}/g, assetsDir)
            .replace(/\${assets_index_name}/g, assetIndexName)
            .replace(/\${auth_uuid}/g, rawUuid)
            .replace(/\${auth_access_token}/g, account.accessToken)
            .replace(/\${clientid}/g, clientId)
            .replace(/\${auth_xuid}/g, xuid)
            .replace(/\${xuid}/g, xuid)
            .replace(/\${user_type}/g, userType)
            .replace(/\${version_type}/g, 'release')
            .replace(/\${user_properties}/g, '{}')
            .replace(/\${quickPlayPath}/g, '')
            .replace(/\${quickPlaySingleplayer}/g, '')
            .replace(/\${quickPlayMultiplayer}/g, '')
            .replace(/\${quickPlayRealms}/g, '')
            .replace(/\${resolution_width}/g, (settings.resolutionWidth || 1280).toString())
            .replace(/\${resolution_height}/g, (settings.resolutionHeight || 720).toString());
    }
    /**
     * Spawns the Minecraft Java process with console output streaming
     */
    async launch(javaPath, versionDetail, account, settings, serverToJoin, onLog, onStatus) {
        const gameDir = settings.gameDir;
        const classpath = this.buildClasspath(versionDetail, gameDir);
        const jvmArgs = this.buildJvmArguments(versionDetail, gameDir, settings, classpath, javaPath);
        const gameArgs = this.buildGameArguments(versionDetail, gameDir, account, settings, serverToJoin);
        const fullArgs = [...jvmArgs, versionDetail.mainClass, ...gameArgs];
        onLog?.({
            id: `log_${Date.now()}_init`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: `[Radon Client] Launching Minecraft ${versionDetail.id}...`,
        });
        onLog?.({
            id: `log_${Date.now()}_java`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: `[Radon Client] Java Binary: ${javaPath}`,
        });
        onLog?.({
            id: `log_${Date.now()}_args`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'info',
            message: `[Radon Client] Main Class: ${versionDetail.mainClass}`,
        });
        onStatus?.({ state: 'launching' });
        try {
            const child = (0, child_process_1.spawn)(javaPath, fullArgs, {
                cwd: gameDir,
                detached: false,
                env: {
                    ...process.env,
                },
            });
            this.activeProcess = child;
            onStatus?.({ state: 'running', pid: child.pid });
            child.stdout.on('data', (data) => {
                const text = data.toString().trim();
                if (text) {
                    const lines = text.split(/\r?\n/);
                    for (const line of lines) {
                        const isError = line.includes('ERROR') || line.includes('FATAL') || line.includes('Exception');
                        const isWarn = line.includes('WARN');
                        onLog?.({
                            id: `log_${Date.now()}_${Math.random()}`,
                            timestamp: new Date().toLocaleTimeString(),
                            type: isError ? 'error' : isWarn ? 'warn' : 'game',
                            message: line,
                        });
                    }
                }
            });
            child.stderr.on('data', (data) => {
                const text = data.toString().trim();
                if (text) {
                    const lines = text.split(/\r?\n/);
                    for (const line of lines) {
                        onLog?.({
                            id: `log_${Date.now()}_${Math.random()}`,
                            timestamp: new Date().toLocaleTimeString(),
                            type: 'error',
                            message: line,
                        });
                    }
                }
            });
            child.on('close', (code) => {
                this.activeProcess = null;
                onLog?.({
                    id: `log_${Date.now()}_exit`,
                    timestamp: new Date().toLocaleTimeString(),
                    type: code === 0 ? 'info' : 'error',
                    message: `[Radon Client] Minecraft exited with code ${code}`,
                });
                onStatus?.({
                    state: code === 0 ? 'finished' : 'crashed',
                    error: code !== 0 ? `Minecraft process exited unexpectedly with code ${code}` : undefined,
                });
            });
            child.on('error', (err) => {
                this.activeProcess = null;
                onLog?.({
                    id: `log_${Date.now()}_err`,
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'error',
                    message: `[Radon Client] Failed to spawn process: ${err.message}`,
                });
                onStatus?.({
                    state: 'crashed',
                    error: err.message,
                });
            });
            return child;
        }
        catch (err) {
            onStatus?.({ state: 'crashed', error: err.message });
            throw err;
        }
    }
}
exports.LauncherService = LauncherService;
