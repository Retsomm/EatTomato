import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog } from 'electron'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import { getAllTodos, createTodo, addPomodoro, toggleComplete, deleteTodo } from './db'

// vite-plugin-electron 在開發時會注入此環境變數
const devServerUrl = process.env['VITE_DEV_SERVER_URL']

const getIconPath = () => path.join(app.getAppPath(), 'electron/assets/logo_macos.png')

let win: BrowserWindow | null = null
let tray: Tray | null = null

const createWindow = () => {
  win = new BrowserWindow({
    width: 600,
    height: 580,
    minWidth: 400,
    minHeight: 400,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#111827',
  })

  if (devServerUrl) {
    win.loadURL(devServerUrl)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('closed', () => { win = null })
}

const createTray = () => {
  try {
    const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('EatTomato 番茄鐘')

    const menu = Menu.buildFromTemplate([
      {
        label: '顯示視窗',
        click: () => {
          if (win) {
            win.show()
            win.focus()
          } else {
            createWindow()
          }
        },
      },
      { type: 'separator' },
      {
        label: '結束',
        click: () => { app.quit() },
      },
    ])

    tray.setContextMenu(menu)
    tray.on('click', () => {
      if (win) {
        win.isVisible() ? win.hide() : win.show()
      } else {
        createWindow()
      }
    })
  } catch (e) {
    console.error('建立系統托盤失敗:', e)
  }
}

let normalBounds: Electron.Rectangle | null = null

ipcMain.handle('window-shrink-toggle', () => {
  if (!win) return false
  if (normalBounds) {
    win.setMinimumSize(400, 300)
    win.setBounds(normalBounds)
    normalBounds = null
    return false
  } else {
    normalBounds = win.getBounds()
    const currentDisplay = screen.getDisplayMatching(normalBounds)
    const { workArea } = currentDisplay
    const smallW = Math.round(normalBounds.width / 4)
    const smallH = Math.round(normalBounds.height / 4)
    win.setMinimumSize(smallW, smallH)
    win.setBounds({
      width: smallW,
      height: smallH,
      x: workArea.x + workArea.width - smallW - 16,
      y: workArea.y + 16,
    })
    return true
  }
})

ipcMain.handle('todo-get-all', () => getAllTodos())
ipcMain.handle('todo-create', (_e, title: string) => createTodo(title))
ipcMain.handle('todo-add-pomodoro', (_e, id: number, minutes: number) => addPomodoro(id, minutes))
ipcMain.handle('todo-toggle-complete', (_e, id: number) => toggleComplete(id))
ipcMain.handle('todo-delete', (_e, id: number) => { deleteTodo(id) })

ipcMain.handle('window-toggle-pin', () => {
  if (!win) return false
  const next = !win.isAlwaysOnTop()
  win.setAlwaysOnTop(next)
  return next
})

const setupAutoUpdater = () => {
  if (devServerUrl) return // 開發模式不檢查更新

  autoUpdater.on('error', (err) => {
    console.error('自動更新錯誤:', err.message)
  })

  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: '發現新版本',
      message: '有新版本可以更新，正在背景下載...',
      buttons: ['確定'],
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: '更新已下載完成',
      message: '更新已下載完成，點擊「立即重啟」以套用更新。',
      buttons: ['立即重啟', '稍後'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true)
        setTimeout(() => {
          BrowserWindow.getAllWindows().forEach(w => w.destroy())
          app.quit()
        }, 500)
      }
    })
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('檢查更新失敗:', err.message)
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIcon = nativeImage.createFromPath(getIconPath()).resize({ width: 512, height: 512 })
    app.dock.setIcon(dockIcon)
  }
  createWindow()
  createTray()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
