"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const electron_1 = require("electron");
// Standard public client ID for Minecraft / Xbox Live apps
const MICROSOFT_CLIENT_ID = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'XboxLive.signin offline_access';
class AuthService {
    /**
     * Performs interactive Microsoft OAuth login inside a dedicated Electron window
     */
    async loginWithMicrosoft() {
        return new Promise((resolve, reject) => {
            const authWindow = new electron_1.BrowserWindow({
                width: 520,
                height: 680,
                title: 'Sign in with Microsoft',
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });
            const authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;
            authWindow.loadURL(authUrl);
            let handled = false;
            const handleCallback = async (navUrl) => {
                if (handled)
                    return;
                if (navUrl.startsWith(REDIRECT_URI)) {
                    handled = true;
                    authWindow.close();
                    try {
                        const parsedUrl = new URL(navUrl);
                        const code = parsedUrl.searchParams.get('code');
                        const error = parsedUrl.searchParams.get('error');
                        if (error) {
                            reject(new Error(`Microsoft Auth Error: ${error}`));
                            return;
                        }
                        if (!code) {
                            reject(new Error('No authorization code returned from Microsoft.'));
                            return;
                        }
                        // Step 1: Exchange code for Microsoft Access Token
                        const msTokens = await this.exchangeCodeForTokens(code);
                        // Step 2: Authenticate with Xbox Live
                        const xblData = await this.authXboxLive(msTokens.access_token);
                        // Step 3: Authorize with XSTS
                        const xstsData = await this.authXSTS(xblData.Token);
                        // Step 4: Login with Minecraft Services
                        const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs;
                        const xid = xblData.DisplayClaims?.xui?.[0]?.xid;
                        const mcAuth = await this.loginMinecraftServices(uhs, xstsData.Token);
                        // Step 5: Fetch Profile (UUID, Username, Skins)
                        const profile = await this.fetchMinecraftProfile(mcAuth.access_token);
                        const skinUrl = profile.skins && profile.skins.length > 0 && profile.skins[0].url
                            ? profile.skins[0].url
                            : `https://minotar.net/skin/${profile.name}`;
                        const account = {
                            id: profile.id,
                            username: profile.name,
                            uuid: profile.id,
                            accessToken: mcAuth.access_token,
                            refreshToken: msTokens.refresh_token,
                            type: 'msa',
                            expiresAt: Date.now() + (mcAuth.expires_in || 86400) * 1000,
                            skinUrl: skinUrl,
                            xuid: xid || profile.id,
                        };
                        resolve(account);
                    }
                    catch (err) {
                        reject(err);
                    }
                }
            };
            authWindow.webContents.on('will-redirect', (_event, urlStr) => {
                handleCallback(urlStr);
            });
            authWindow.webContents.on('will-navigate', (_event, urlStr) => {
                handleCallback(urlStr);
            });
            authWindow.on('closed', () => {
                if (!handled) {
                    reject(new Error('Sign-in window was closed by the user.'));
                }
            });
        });
    }
    /**
     * Exchanges authorization code for Microsoft tokens
     */
    async exchangeCodeForTokens(code) {
        const params = new URLSearchParams();
        params.append('client_id', MICROSOFT_CLIENT_ID);
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', REDIRECT_URI);
        params.append('scope', SCOPE);
        const res = await axios_1.default.post('https://login.live.com/oauth20_token.srf', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return res.data;
    }
    /**
     * Refresh Microsoft token if expired
     */
    async refreshMicrosoftToken(refreshToken) {
        const params = new URLSearchParams();
        params.append('client_id', MICROSOFT_CLIENT_ID);
        params.append('refresh_token', refreshToken);
        params.append('grant_type', 'refresh_token');
        params.append('redirect_uri', REDIRECT_URI);
        params.append('scope', SCOPE);
        const res = await axios_1.default.post('https://login.live.com/oauth20_token.srf', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return res.data;
    }
    /**
     * Authenticate with Xbox Live
     */
    async authXboxLive(msAccessToken) {
        const payload = {
            Properties: {
                AuthMethod: 'RPS',
                SiteName: 'user.auth.xboxlive.com',
                RpsTicket: msAccessToken, // or `d=${msAccessToken}`
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT',
        };
        // If prefix is required
        if (!msAccessToken.startsWith('d=')) {
            payload.Properties.RpsTicket = `d=${msAccessToken}`;
        }
        const res = await axios_1.default.post('https://user.auth.xboxlive.com/user/authenticate', payload, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        return res.data;
    }
    /**
     * Authorize with XSTS for Minecraft Services
     */
    async authXSTS(xblToken) {
        const payload = {
            Properties: {
                SandboxId: 'RETAIL',
                UserTokens: [xblToken],
            },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT',
        };
        const res = await axios_1.default.post('https://xsts.auth.xboxlive.com/xsts/authorize', payload, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        return res.data;
    }
    /**
     * Authenticate with Minecraft Services
     */
    async loginMinecraftServices(userHash, xstsToken) {
        const payload = {
            identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
        };
        const res = await axios_1.default.post('https://api.minecraftservices.com/authentication/login_with_xbox', payload, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        return res.data;
    }
    /**
     * Fully refreshes a Microsoft Minecraft account:
     * 1. Refresh Microsoft OAuth token
     * 2. Authenticate with Xbox Live
     * 3. Authorize with XSTS
     * 4. Authenticate with Minecraft Services
     * 5. Refresh Minecraft profile
     */
    async refreshAccount(account) {
        if (account.type !== 'msa' || !account.refreshToken) {
            return account;
        }
        try {
            // Step 1: Refresh Microsoft OAuth tokens
            const msTokens = await this.refreshMicrosoftToken(account.refreshToken);
            // Step 2: Authenticate with Xbox Live
            const xblData = await this.authXboxLive(msTokens.access_token);
            // Step 3: Authorize with XSTS
            const xstsData = await this.authXSTS(xblData.Token);
            // Step 4: Login with Minecraft Services
            const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs;
            const xid = xblData.DisplayClaims?.xui?.[0]?.xid;
            const mcAuth = await this.loginMinecraftServices(uhs, xstsData.Token);
            // Step 5: Fetch Profile (UUID, Username, Skins)
            let profile = { id: account.uuid, name: account.username, skins: [] };
            try {
                profile = await this.fetchMinecraftProfile(mcAuth.access_token);
            }
            catch (profileErr) {
                console.warn('Could not fetch updated profile, keeping existing:', profileErr);
            }
            const skinUrl = profile.skins && profile.skins.length > 0 && profile.skins[0].url
                ? profile.skins[0].url
                : account.skinUrl || `https://minotar.net/skin/${profile.name}`;
            return {
                ...account,
                id: profile.id || account.id,
                username: profile.name || account.username,
                uuid: profile.id || account.uuid,
                accessToken: mcAuth.access_token,
                refreshToken: msTokens.refresh_token || account.refreshToken,
                type: 'msa',
                expiresAt: Date.now() + (mcAuth.expires_in || 86400) * 1000,
                xuid: xid || account.xuid || profile.id,
                skinUrl,
            };
        }
        catch (err) {
            console.error('Failed to refresh Microsoft account:', err);
            throw err;
        }
    }
    /**
     * Synchronizes launcher_accounts.json and launcher_profiles.json in the Minecraft game directory
     * This is required by mods like Essential Mod, Feather, Iris, and third-party tools to identify the logged-in session.
     */
    static syncLauncherAccounts(gameDir, activeAccount, allAccounts = [activeAccount]) {
        try {
            if (!fs_1.default.existsSync(gameDir)) {
                fs_1.default.mkdirSync(gameDir, { recursive: true });
            }
            const accountsFilePath = path_1.default.join(gameDir, 'launcher_accounts.json');
            let existingAccountsJson = {
                accounts: {},
                activeAccountLocalId: '',
                mojangClientToken: '',
            };
            if (fs_1.default.existsSync(accountsFilePath)) {
                try {
                    existingAccountsJson = JSON.parse(fs_1.default.readFileSync(accountsFilePath, 'utf8'));
                    if (!existingAccountsJson.accounts)
                        existingAccountsJson.accounts = {};
                }
                catch { }
            }
            const cleanUuid = (uuid) => uuid.replace(/-/g, '');
            // Ensure client token
            if (!existingAccountsJson.mojangClientToken) {
                existingAccountsJson.mojangClientToken = cleanUuid(activeAccount.uuid);
            }
            // Add/Update accounts in launcher_accounts.json
            for (const acc of allAccounts) {
                const accId = cleanUuid(acc.uuid);
                existingAccountsJson.accounts[accId] = {
                    accessToken: acc.accessToken,
                    eligibleForMigration: false,
                    hasMultipleProfiles: false,
                    legacy: acc.type !== 'msa',
                    localId: accId,
                    minecraftProfile: {
                        id: cleanUuid(acc.uuid),
                        name: acc.username,
                    },
                    persistent: true,
                    type: acc.type === 'msa' ? 'msa' : 'Mojang',
                    userProperties: [],
                    username: acc.username,
                    xuid: acc.xuid || cleanUuid(acc.uuid),
                };
            }
            const activeLocalId = cleanUuid(activeAccount.uuid);
            existingAccountsJson.activeAccountLocalId = activeLocalId;
            fs_1.default.writeFileSync(accountsFilePath, JSON.stringify(existingAccountsJson, null, 2), 'utf8');
            // Also ensure basic launcher_profiles.json exists
            const profilesFilePath = path_1.default.join(gameDir, 'launcher_profiles.json');
            if (!fs_1.default.existsSync(profilesFilePath)) {
                const defaultProfilesJson = {
                    profiles: {},
                    settings: {
                        crashAssistance: true,
                        enableAdvanced: true,
                        enableAnalytics: false,
                        enableHistorical: false,
                        enableReleases: true,
                        enableSnapshots: false,
                        keepLauncherOpen: false,
                        profileSorting: 'byName',
                        showGameLog: true,
                        showMenu: false,
                        soundOn: false,
                    },
                    version: 3,
                };
                fs_1.default.writeFileSync(profilesFilePath, JSON.stringify(defaultProfilesJson, null, 2), 'utf8');
            }
        }
        catch (err) {
            console.warn('Failed to sync launcher_accounts.json for Essential mod:', err);
        }
    }
    /**
     * Fetch Minecraft profile data (UUID, username, skins)
     */
    async fetchMinecraftProfile(mcAccessToken) {
        const res = await axios_1.default.get('https://api.minecraftservices.com/minecraft/profile', {
            headers: {
                Authorization: `Bearer ${mcAccessToken}`,
            },
        });
        return res.data;
    }
    /**
     * Create an offline / developer account for instant testing
     */
    createOfflineAccount(username) {
        const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_]/g, '') || 'Player';
        // Generate deterministic UUID for offline player or simple random
        const randomHex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        const formattedUuid = `${randomHex.substring(0, 8)}-${randomHex.substring(8, 12)}-${randomHex.substring(12, 16)}-${randomHex.substring(16, 20)}-${randomHex.substring(20, 32)}`;
        return {
            id: `offline_${cleanUsername.toLowerCase()}`,
            username: cleanUsername,
            uuid: formattedUuid,
            accessToken: 'offline_token',
            type: 'offline',
            skinUrl: `https://minotar.net/skin/${cleanUsername}`,
            xuid: cleanUsername,
        };
    }
}
exports.AuthService = AuthService;
