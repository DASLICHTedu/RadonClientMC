export interface MinecraftAccount {
  id: string; // UUID or offline id
  username: string;
  uuid: string;
  accessToken: string;
  refreshToken?: string;
  type: 'msa' | 'offline';
  expiresAt?: number;
  skinUrl?: string;
  xuid?: string;
}

export interface VersionEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
  complianceLevel: number;
}

export interface VersionManifestResponse {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: VersionEntry[];
}

export interface VersionDetail {
  id: string;
  inheritsFrom?: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: {
    game?: (string | { rules: Rule[]; value: string | string[] })[];
    jvm?: (string | { rules: Rule[]; value: string | string[] })[];
  };
  assets: string;
  assetIndex: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  downloads: {
    client: {
      sha1: string;
      size: number;
      url: string;
    };
  };
  libraries: Library[];
  javaVersion?: {
    component: string;
    majorVersion: number;
  };
}

export interface Rule {
  action: 'allow' | 'disallow';
  os?: {
    name?: string;
    arch?: string;
    version?: string;
  };
  features?: Record<string, boolean>;
}

export interface Library {
  name: string;
  downloads?: {
    artifact?: {
      path: string;
      sha1: string;
      size: number;
      url: string;
    };
    classifiers?: Record<string, {
      path: string;
      sha1: string;
      size: number;
      url: string;
    }>;
  };
  natives?: Record<string, string>;
  rules?: Rule[];
  extract?: {
    exclude?: string[];
  };
}

export interface DownloadProgress {
  phase: 'manifest' | 'client' | 'libraries' | 'natives' | 'assets' | 'java' | 'ready';
  currentFile: string;
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  completedBytes: number;
  percent: number;
  speed: string; // e.g. "4.2 MB/s"
}

export type ModloaderType = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';

export interface LaunchSettings {
  ramMin: number; // in MB, e.g. 1024
  ramMax: number; // in MB, e.g. 4096
  resolutionWidth: number;
  resolutionHeight: number;
  fullscreen: boolean;
  customJavaPath: string; // empty string for auto
  jvmArgs: string;
  gameDir: string; // custom game directory or default %appdata%/.minecraft
  modloader: ModloaderType;
}

// CurseForge Types
export interface CurseForgeSearchResult {
  id: number;
  name: string;
  slug: string;
  authors: Array<{ name: string; id: number }>;
  shortDescription: string;
  description: string;
  categories: Array<{ id: number; name: string; slug: string }>;
  logo: { id: number; thumbnailUrl: string; url: string };
  screenshots: Array<{ id: number; thumbnailUrl: string; url: string }>;
  downloadCount: number;
  likeCount: number;
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
  gameVersions: string[];
  latestFiles: CurseForgeFile[];
  modLoaders: string[];
}

export interface CurseForgeFile {
  id: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  downloadUrl: string;
  gameVersions: string[];
  modLoaders: string[];
  isPrimary: boolean;
  alternateFileId: number | null;
  dependencies: Array<{ modId: number; relationType: number }>;
  modules: Array<{ name: string; fingerprint: number }>;
}

export interface CurseForgeModInfo {
  id: number;
  name: string;
  slug: string;
  authors: Array<{ name: string }>;
  shortDescription: string;
  description: string;
  categories: Array<{ name: string }>;
  logo: { thumbnailUrl: string };
  downloadCount: number;
  latestFiles: CurseForgeFile[];
  modLoaders: string[];
  gameVersions: string[];
}

// Forge Version Manifest Types
export interface ForgeVersion {
  branch: string;
  mcversion: string;
  version: string;
  stable: boolean;
  updated_time: string;
  files: ForgeVersionFile[];
}

export interface ForgeVersionFile {
  category: string;
  filename: string;
  download_path: string;
  sha1: string;
  size: number;
  type: string;
}

export interface ForgeInstallerProfile {
  spec: number;
  profile: string;
  version: string;
  json: string;
  path: string;
  minecraft: string;
  clientJar: string;
  serverJar: string;
  libraries: ForgeLibrary[];
  mainClass: string;
  injectors?: any;
  data: { [key: string]: ForgeVersion };
}

export interface ForgeLibrary {
  name: string;
  url?: string;
  checksums?: string[];
  serverreq?: boolean;
  clientreq?: boolean;
  optional?: boolean;
}

// NeoForge Types
export interface NeoForgeVersion {
  version: string;
  mcversion: string;
  date: string;
  time: string;
  release: boolean;
  files: NeoForgeVersionFile[];
}

export interface NeoForgeVersionFile {
  type: string;
  path: string;
  sha1: string;
  size: number;
  url: string;
}

// Combined Mod Source Type
export type ModSourceType = 'modrinth' | 'curseforge';

export interface ModSourceInfo {
  source: ModSourceType;
  projectId: string; // Modrinth project_id or CurseForge slug
  name: string;
  author: string;
  iconUrl?: string;
}

// Updater Types
export interface VersionInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  releaseDate: string;
  isPrerelease: boolean;
}

// Mod Instance / Mod Pack Types
export interface ModInstance {
  id: string;
  name: string;
  minecraftVersion: string;
  modloader: ModloaderType;
  modloaderVersion?: string;
  mods: ModInstanceMod[];
  createdAt: number;
  updatedAt: number;
  description?: string;
}

export interface ModInstanceMod {
  id: string;
  projectId: string;
  name: string;
  versionId: string;
  versionName: string;
  source: ModSourceType;
  fileName?: string;
  iconUrl?: string;
  installed: boolean;
  enabled: boolean;
}

export interface ModInstanceSettings {
  instances: ModInstance[];
  activeInstanceId?: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  downloadUrl: string;
  releaseNotes: string;
  isPrerelease: boolean;
}

export interface ModrinthSearchResult {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string;
  date_created: string;
  date_modified: string;
  latest_version: string;
  license: string;
  gallery: string[];
}

export interface ModrinthVersionFile {
  hashes: {
    sha1: string;
    sha512: string;
  };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type?: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  author_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  featured: boolean;
  files: ModrinthVersionFile[];
  date_published: string;
  downloads: number;
}

export interface ModVersionInfo {
  id: string;
  version_number: string;
  date_published: string;
  downloads: number;
  game_versions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
}

export interface ModUpdateInfo {
  modFile: string;
  currentVersion?: string;
  latestVersion: string;
  modName: string;
  projectId: string;
  updateUrl: string;
}

export interface InstalledMod {
  id: string;
  fileName: string;
  name: string;
  enabled: boolean;
  size: number;
  modifiedTime: number;
}

export interface ModSettings {
  cpsCounter: boolean;
  fpsDisplay: boolean;
  keystrokes: boolean;
  armorStatus: boolean;
  directionHud: boolean;
  fullbright: boolean;
  reachDisplay: boolean;
  customCrosshair: boolean;
  pingDisplay: boolean;
  motionBlur: boolean;
  timeChanger: boolean;
}

export interface ServerEntry {
  id: string;
  name: string;
  address: string;
  icon?: string;
  featured?: boolean;
  version?: string;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'game';
  message: string;
}

export interface LaunchStatus {
  state: 'idle' | 'preparing' | 'downloading' | 'launching' | 'running' | 'crashed' | 'finished';
  error?: string;
  pid?: number;
}

