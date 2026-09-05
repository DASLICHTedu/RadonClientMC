# ⚡ Radon Client - Next-Gen Minecraft Client & Launcher

A modern, standalone Minecraft client and launcher inspired by **Lunar Client**, built with Electron, React, TypeScript, and Tailwind CSS.

---

## 🎮 Global Minecraft Integration

Radon Client now uses your **global `.minecraft` folder** by default, allowing you to:
- Access all your existing worlds from the standard Minecraft launcher
- Share mods, resource packs, and settings between Radon Client and vanilla Minecraft
- Use the same saves, screenshots, and configurations

The client automatically detects and uses the correct path for your platform:
- **Windows**: `%APPDATA%\.minecraft`
- **macOS**: `~/Library/Application Support/minecraft`
- **Linux**: `~/.minecraft`

You can still change the game directory in Settings if you prefer to use a different folder.

---

## ✨ Features

- **🚀 Any Minecraft Version**: Play any version from the official Mojang catalog (from classic **1.8.9 PvP**, **1.7.10**, **1.12.2**, to the latest **1.21.x** release or snapshots).
- **🔑 Microsoft & Xbox Live Auth**: Official Microsoft OAuth 2.0 flow exchanging Xbox Live and XSTS tokens to retrieve your real Minecraft profile, skin, and multiplayer access.
- **⚡ Instant Offline / Dev Mode**: Built-in offline player generator for instant gameplay and testing without signing in.
- **📦 Multi-Threaded Asset & Library Downloader**: High-speed parallel downloader with SHA1 integrity checks, client jar downloads, and automatic Windows native DLL extraction.
- **☕ Auto Java Provisioning**: Automatically detects system Java or downloads official Mojang JRE components (`java-runtime-alpha` for Java 8, `java-runtime-gamma` for Java 17, `java-runtime-delta` for Java 21).
- **✨ Lunar-Style Mod & HUD Settings**:
  - Keystrokes HUD (WASD + mouse clicks)
  - CPS Counter (Left & Right clicks)
  - Real-time FPS Display
  - Armor Status & Durability
  - Direction Compass & Coordinates
  - Fullbright (Gamma Boost)
  - Reach Display & Crosshairs
  - Ping Indicator
- **🌐 Server Directory & Auto-Join**: 1-click launch and connect to popular servers (Hypixel, Lunar Network, PvPLand, GommeHD, Minemen Club, CubeCraft) or add custom servers.
- **⚙️ JVM Memory & Performance Controls**: Intuitive RAM allocation slider (2 GB to 16 GB), custom Garbage Collector flags, window resolution settings, and directory picker.
- **💻 Real-Time Console & Crash Logger**: Live stdout/stderr log stream with log level filtering, instant copy, and process kill switch.

---

## 🛠️ How to Run & Build

### 1. Launch Client Directly (Development / Live Mode)
```bash
npm run dev
# or double click start-client.bat
```

### 2. Run Precompiled Client
```bash
npm start
```

### 3. Build Standalone Windows Executable (.exe)
```bash
npm run build:win
```
The standalone `.exe` will be generated in `release/Radon Client 1.0.0.exe`.

---

## 📂 Game Directory Configuration

By default, Radon Client uses your system's global `.minecraft` folder. This means:

- All your existing worlds from vanilla Minecraft are automatically accessible
- Mods installed via the vanilla launcher will be available in Radon Client
- Resource packs, shaders, and configurations are shared between both launchers

To change the game directory:
1. Go to **Settings** tab
2. Scroll to **Minecraft Game Directory**
3. Click **Browse** to select a different folder, or manually enter a path
4. Click **Save Settings**

This is useful if you want to:
- Use a different Minecraft installation
- Create a separate instance for testing
- Use a portable installation on an external drive

---

## 📁 Project Structure

```
radon-client/
├── electron/
│   ├── main.ts                     # Frameless window lifecycle & IPC coordinator
│   ├── preload.ts                  # Secure context bridge (window.radon)
│   ├── types.ts                    # Backend & Frontend TypeScript types
│   └── services/
│       ├── auth.ts                 # Microsoft OAuth & Xbox Live token exchange
│       ├── version-manifest.ts     # Mojang piston-meta API & rule evaluator
│       ├── downloader.ts           # Multi-threaded parallel asset/library downloader
│       ├── java-runtime.ts         # Java detection & Mojang JRE provisioner
│       ├── launcher.ts             # JVM/Game argument builder & process runner
│       └── settings.ts             # Local settings, accounts, mods, servers store
├── src/
│   ├── components/
│   │   ├── Titlebar.tsx            # Modern frameless titlebar with window controls
│   │   ├── Sidebar.tsx             # Lunar-style navigation sidebar
│   │   ├── PlayerProfileBadge.tsx  # Skin avatar head & account switcher
│   │   └── LoginModal.tsx          # Microsoft sign-in popup & offline creator
│   ├── views/
│   │   ├── PlayView.tsx            # Main hero screen, launch button & progress bar
│   │   ├── VersionsView.tsx        # Version catalog, filters & download manager
│   │   ├── ModsView.tsx            # Lunar-style HUD & mod toggle cards
│   │   ├── ServersView.tsx         # Multiplayer server browser with 1-click join
│   │   ├── SettingsView.tsx        # RAM slider, Java selector, resolution settings
│   │   └── ConsoleLogsView.tsx     # Live Minecraft process terminal & log stream
│   ├── App.tsx                     # Top-level React container
│   ├── main.tsx                    # React mount
│   └── index.css                   # Tailwind directives & glow effects
└── package.json
```

