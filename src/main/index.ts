import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor } from 'electron'
import path from 'path'
import { getSettings, setEnabled, patchSettings } from './settings'
import { startPolling, stopPolling, restartPolling, pollOnce, getLastSnapshots } from './poller'
import { ProviderId } from './collectors/types'
import { loginClaude, clearSession, closeFetchWindow } from './collectors/claude-web'
import { closeCodexWindow } from './collectors/codex-web'
import { loginGrok, clearGrokSession, closeGrokWindow } from './collectors/grok-web'
import { setLang, detectLang, getLang, t } from '../shared/i18n'

let win: BrowserWindow | null = null
let tray: Tray | null = null

// Width is measured from content like height. Normal mode pins itself to 300 in
// CSS; compact mode reports whatever its row needs, floored by the title bar.
const WIDGET_W = 254
const WIDGET_MIN_W = 120
const WIDGET_MAX_W = 420
// Low enough for compact mode (one row, possibly a single provider). Normal mode
// always renders taller than this, so autosize still fits content in both modes.
const WIDGET_MIN_H = 70
const WIDGET_MAX_H = 900
// Dev: <root>/resources. Packaged: extraResources at process.resourcesPath/resources.
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'resources', 'icon.png')
  : path.join(__dirname, '../../resources/icon.png')

function loadIcon() {
  const img = nativeImage.createFromPath(ICON_PATH)
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

/** Register/unregister the app as a login item (Windows/macOS; no-op on most Linux).
 *  Only writes when the state actually changes: re-asserting on every launch makes
 *  unsigned/translocated macOS builds log "Unable to set login item: Operation not
 *  permitted" even when nothing needs doing. */
function applyLaunchAtStartup(enabled: boolean) {
  try {
    if (app.getLoginItemSettings().openAtLogin === enabled) return
    app.setLoginItemSettings({ openAtLogin: enabled, args: [] })
  } catch { /* unsupported on this platform */ }
}

function rebuildTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: t('tray.settings'), click: () => openSettings() },
    { label: t('tray.refresh'), click: () => void pollOnce() },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

function openSettings() {
  if (!win || win.isDestroyed()) {
    createWindow()
    win!.webContents.once('did-finish-load', () => win!.webContents.send('open-settings'))
  } else {
    win.show()
    win.webContents.send('open-settings')
  }
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
  ipcMain.handle('login', async (_e, provider: ProviderId) => {
    const ok = provider === 'grok' ? await loginGrok() : await loginClaude()
    if (ok) await pollOnce()
    return ok
  })
  ipcMain.handle('logout', async (_e, provider: ProviderId) => {
    if (provider === 'grok') clearGrokSession()
    else clearSession()
    await pollOnce()
    return true
  })
  ipcMain.on('autosize', (_e, width: number, height: number) => {
    if (!win || win.isDestroyed()) return
    const h = Math.min(Math.max(Math.round(height), WIDGET_MIN_H), WIDGET_MAX_H)
    const w = Math.min(Math.max(Math.round(width), WIDGET_MIN_W), WIDGET_MAX_W)
    const [curW, cur] = win.getSize()
    if (Math.abs(cur - h) > 1 || Math.abs(curW - w) > 1) win.setContentSize(w, h)
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
  registerPowerHandlers()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

// Sleep/wake handling. The hidden collector windows hold remote pages (claude.ai,
// chatgpt.com); across a suspend their render processes can be reaped while the
// BrowserWindow objects survive, and the poll that fires immediately on wake then
// touches dead renderers. Tear them down before sleeping and rebuild after, giving
// the network a few seconds to come back first.
const RESUME_DELAY_MS = 5000
let resumeTimer: NodeJS.Timeout | null = null

function releaseCollectorWindows() {
  closeFetchWindow()
  closeCodexWindow()
  closeGrokWindow()
}

function registerPowerHandlers() {
  powerMonitor.on('suspend', () => {
    if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null }
    stopPolling()
    releaseCollectorWindows()
  })
  powerMonitor.on('resume', () => {
    releaseCollectorWindows() // anything left from before the sleep is suspect
    if (resumeTimer) clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => { resumeTimer = null; startPolling() }, RESUME_DELAY_MS)
  })
}

app.on('window-all-closed', () => {
  // Keep running in tray; quit only on explicit action.
})

app.on('before-quit', () => {
  stopPolling()
  releaseCollectorWindows()
})
