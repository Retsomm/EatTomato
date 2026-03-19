# EatTomato 🍅

React + Electron 桌面番茄鐘，支援時鐘、番茄計時與自訂計時三種模式，並整合待辦清單追蹤每個任務的番茄數。

## 功能

### 計時模式
- **時鐘模式** — 即時顯示當前時間
- **番茄鐘** — 25 分鐘專注 + 5 分鐘短休 + 15 分鐘長休（每 4 輪觸發）循環計時，結束播放音效通知
- **自訂計時器** — 自由輸入分鐘與秒數

### 待辦清單
- 新增、刪除、完成任務
- 每顆番茄完成後可指定歸屬任務，自動累計番茄數與總時長
- 活躍任務高亮顯示

### 視窗控制
- **縮小模式** — 視窗縮為 1/4 大小並置於右上角，方便在工作時保持可見
- **置頂** — 固定視窗於所有應用程式之上
- **系統托盤** — 右鍵可顯示視窗或結束應用，點擊圖示切換視窗可見性

### 其他
- **深色／淺色模式** — 右上角切換，偏好設定自動記憶
- **資料持久化** — 計時狀態存於 localStorage，待辦資料存於本地 JSON 檔，重啟後自動恢復

## 技術棧

| 層級 | 技術 |
|------|------|
| UI | React 18 + TypeScript |
| 桌面框架 | Electron 33 |
| 建置工具 | Vite 6 + vite-plugin-electron |
| 樣式 | Tailwind CSS v4 |
| 套件管理 | Yarn |
| 打包 | electron-builder |

## 專案結構

```
EatTomato/
├── electron/
│   ├── main.ts          # Electron 主進程（視窗、系統托盤、IPC handlers）
│   ├── preload.ts       # Preload 腳本，透過 contextBridge 暴露 electronAPI
│   └── db.ts            # 本地 JSON 資料庫（待辦 CRUD）
├── src/
│   ├── App.tsx          # 主元件（三模式介面、待辦清單、深色模式、持久化）
│   ├── main.tsx         # React 進入點
│   └── index.css        # Tailwind CSS 入口（@import "tailwindcss"）
├── index.html
├── vite.config.ts       # Vite + Tailwind + Electron 外掛設定
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── package.json
```

## 快速開始

```bash
# 安裝依賴
yarn

# 開發模式（Vite 熱重載 + Electron 視窗）
yarn dev

# 建置並打包安裝檔
yarn build
```

## 開發說明

`yarn dev` 會同時啟動兩個程序：
1. `vite` — 啟動前端開發伺服器（`http://localhost:5173`）並編譯 Electron 主進程與 preload 腳本
2. `electron .` — 等待 Vite 就緒後開啟 Electron 視窗

修改 `src/` 下的檔案會即時熱重載；修改 `electron/main.ts` 或 `electron/preload.ts` 需重啟開發模式。

### IPC 通信架構

```
Renderer (React)
  └─ window.electronAPI  ← contextBridge（preload.ts）
       ├─ shrinkToggle()        → ipcMain: window-shrink-toggle
       ├─ togglePin()           → ipcMain: window-toggle-pin
       └─ todo.*                → ipcMain: todo-get/create/add-pomodoro/toggle/delete
```

### 待辦資料存儲

待辦項目存於 Electron 的 userData 目錄（`app.getPath('userData')`）下的 `todos.json`：

| 平台 | 路徑 |
|------|------|
| macOS | `~/Library/Application Support/EatTomato/todos.json` |
| Windows | `%APPDATA%\EatTomato\todos.json` |
| Linux | `~/.config/EatTomato/todos.json` |

## 打包部署

```bash
yarn build
```

產生的安裝檔位於 `dist/` 目錄：

| 平台 | 輸出 |
|------|------|
| macOS | `EatTomato-x.x.x-arm64.dmg` |
| Windows | `EatTomato Setup x.x.x.exe`（需在 Windows 上建置） |
| Linux | `EatTomato-x.x.x.AppImage`（需在 Linux 上建置） |

> macOS 打包未設定程式碼簽署，若需分發給他人安裝，需申請 Apple Developer 憑證並設定 `CSC_LINK`。
