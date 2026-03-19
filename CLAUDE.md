# EatTomato — 番茄鐘應用

React + Electron 桌面番茄鐘，支援時鐘、番茄計時與自訂計時三種模式。

## 技術棧

- **框架**: React + TypeScript + Electron
- **建置工具**: Vite + `vite-plugin-electron` + `@vitejs/plugin-react`
- **樣式**: Tailwind CSS v4（透過 `@tailwindcss/vite` 外掛整合）
- **套件管理**: Yarn
- **打包**: electron-builder（輸出 .exe / .dmg / .deb）

## 專案結構

```
electron/main.ts      # Electron 主進程，建立 BrowserWindow
src/
  App.tsx             # 主元件，時鐘/番茄/計時模式切換
  index.css           # Tailwind 入口（@import "tailwindcss"）
vite.config.ts        # Vite 設定，含 tailwindcss() 與 electron 外掛
package.json
```

## 常用指令

```bash
yarn              # 安裝依賴
yarn dev          # 開發模式（Vite + Electron 熱重載）
yarn build        # 打包（vite build && electron-builder）
yarn preview      # 預覽靜態輸出
```

## Scripts 設定（package.json）

```json
"scripts": {
  "dev": "concurrently \"yarn dev:react\" \"yarn dev:electron\"",
  "dev:react": "vite",
  "dev:electron": "wait-on http://localhost:5173 && electron .",
  "build": "vite build && electron-builder",
  "preview": "vite preview"
}
```

## 功能規格

- **時鐘模式**: `useEffect` + `Date` 即時顯示當前時間
- **番茄鐘**: `useState` + `setInterval` 倒數計時，結束播放鈴聲通知
- **自訂計時器**: 使用者輸入時長
- **深色模式**: Tailwind `dark:` 類別，`dark:bg-gray-900`
- **資料持久化**: localStorage，下次開啟自動恢復進度
- **系統托盤**: 首次開啟顯示托盤圖示

## 樣式慣例

使用 Tailwind utility class，例如：
- 大時鐘: `text-6xl font-mono`
- 漸層背景: `bg-gradient-to-r from-blue-500 to-purple-600`
- 深色模式: `dark:bg-gray-900`

## 打包部署

`yarn build` 產生靜態檔案後由 electron-builder 打包；在 `package.json` 的 `build` 區塊設定目標平台（`win`、`mac`、`linux`），產出安裝檔上傳 GitHub Releases。
