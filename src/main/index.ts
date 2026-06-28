import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { getSettings, setEnabled, patchSettings } from './settings'
import { startPolling, stopPolling, restartPolling, pollOnce, getLastSnapshots } from './poller'
import { ProviderId } from './collectors/types'
import { loginClaude, clearSession } from './collectors/claude-web'
import { setLang, detectLang, getLang, t } from '../shared/i18n'

let win: BrowserWindow | null = null
let tray: Tray | null = null

const WIDGET_W = 300
const WIDGET_MIN_H = 120
const WIDGET_MAX_H = 900
// Dev: <root>/resources. Packaged: extraResources at process.resourcesPath/resources.
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'resources', 'icon.png')
  : path.join(__dirname, '../../resources/icon.png')

function loadIcon() {
  const img = nativeImage.createFromPath(ICON_PATH)
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

/** Register/unregister the app as a Windows login item. */
function applyLaunchAtStartup(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: [] })
}

function rebuildTrayMenu() {
  if (!tray) return
  const s = getSettings()
  const menu = Menu.buildFromTemplate([
    { label: t('tray.refresh'), click: () => void pollOnce() },
    {
      label: t('tray.onTop'), type: 'checkbox', checked: s.alwaysOnTop,
      click: (mi) => { patchSettings({ alwaysOnTop: mi.checked }); win?.setAlwaysOnTop(mi.checked, 'floating') }
    },
    {
      label: t('tray.startup'), type: 'checkbox', checked: s.launchAtStartup,
      click: (mi) => { patchSettings({ launchAtStartup: mi.checked }); applyLaunchAtStartup(mi.checked) }
    },
    { type: 'separator' },
    { label: t('tray.claudeLogout'), click: () => { clearSession(); void pollOnce() } },
    { label: t('tray.quit'), click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

function createWindow() {
  const s = getSettings()
  win = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_MIN_H,
    frame: false,
    resizable: true,
    useContentSize: true,
    transparent: true,
    icon: loadIcon(),
    alwaysOnTop: s.alwaysOnTop,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (s.alwaysOnTop) win.setAlwaysOnTop(true, 'floating')

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function createTray() {
  const img = loadIcon().resize({ width: 16, height: 16 })
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('AICycle Widget')
  rebuildTrayMenu()
  tray.on('click', () => { if (win) { win.isVisible() ? win.hide() : win.show() } })
}

function registerIpc() {
  ipcMain.handle('get-lang', () => getLang())
  ipcMain.handle('get-settings', () => getSettings())
  ipcMain.handle('get-snapshots', () => getLastSnapshots())
  ipcMain.handle('refresh', () => pollOnce())
  ipcMain.handle('set-enabled', (_e, provider: ProviderId, enabled: boolean) => {
    const s = setEnabled(provider, enabled)
    restartPolling()
    return s
  })
  ipcMain.handle('patch-settings', (_e, patch) => {
    const s = patchSettings(patch)
    if (Object.prototype.hasOwnProperty.call(patch, 'launchAtStartup')) {
      applyLaunchAtStartup(s.launchAtStartup)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'alwaysOnTop')) {
      win?.setAlwaysOnTop(s.alwaysOnTop, 'floating')
    }
    rebuildTrayMenu()
    restartPolling()
    return s
  })
  ipcMain.handle('claude-login', async () => {
    const ok = await loginClaude()
    if (ok) await pollOnce()
    return ok
  })
  ipcMain.handle('claude-logout', async () => {
    clearSession()
    await pollOnce()
    return true
  })
  ipcMain.on('autosize', (_e, height: number) => {
    if (!win) return
    const h = Math.min(Math.max(Math.round(height), WIDGET_MIN_H), WIDGET_MAX_H)
    const [, cur] = win.getSize()
    if (Math.abs(cur - h) > 1) win.setContentSize(WIDGET_W, h)
  })
  ipcMain.on('quit', () => app.quit())
}

app.whenReady().then(() => {
  setLang(detectLang(process.env['FORCE_LANG'] || app.getLocale()))
  registerIpc()
  createWindow()
  createTray()
  // Keep the OS login-item registration in sync with the saved preference.
  applyLaunchAtStartup(getSettings().launchAtStartup)
  startPolling()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  // Keep running in tray; quit only on explicit action.
})

app.on('before-quit', () => stopPolling())
