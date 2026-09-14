import { BrowserWindow } from 'electron'
import { collectClaude } from './collectors/claude'
import { collectCodex } from './collectors/codex'
import { collectGrok } from './collectors/grok'
import { collectAntigravity } from './collectors/antigravity'
import { UsageSnapshot, ProviderId, emptySnapshot } from './collectors/types'
import { getSettings } from './settings'
import { t } from '../shared/i18n'

const COLLECTORS: Record<ProviderId, () => Promise<UsageSnapshot>> = {
  claude: collectClaude,
  codex: collectCodex,
  grok: collectGrok,
  antigravity: () => collectAntigravity('antigravity'),
  antigravity_2: () => collectAntigravity('antigravity_2')
}

let timer: NodeJS.Timeout | null = null
let lastSnapshots: Record<string, UsageSnapshot> = {}
let widgetWin: BrowserWindow | null = null

/** The window snapshots are pushed to. Registered by the app on creation so
 *  broadcasts cannot reach the hidden collector windows, which host claude.ai,
 *  chatgpt.com and grok.com. */
export function setWidgetWindow(win: BrowserWindow | null): void {
  widgetWin = win
}

export function getLastSnapshots(): Record<string, UsageSnapshot> {
  return lastSnapshots
}

export async function pollOnce(): Promise<Record<string, UsageSnapshot>> {
  const { enabledProviders } = getSettings()
  const ids = Object.keys(COLLECTORS) as ProviderId[]
  const results = await Promise.all(
    ids.map(async (id) => {
      if (!enabledProviders[id]) return emptySnapshot(id, 'disabled')
      try {
        return await COLLECTORS[id]()
      } catch (e: any) {
        return emptySnapshot(id, t('state.collectError', e?.message ?? ''))
      }
    })
  )
  lastSnapshots = Object.fromEntries(ids.map((id, i) => [id, results[i]]))
  broadcast()
  return lastSnapshots
}

function broadcast() {
  const w = widgetWin
  if (!w || w.isDestroyed() || w.webContents.isDestroyed()) return
  w.webContents.send('snapshots', lastSnapshots)
}

export function startPolling() {
  stopPolling()
  void pollOnce()
  const ms = Math.max(15, getSettings().refreshSeconds) * 1000
  timer = setInterval(() => void pollOnce(), ms)
}

export function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}

export function restartPolling() {
  startPolling()
}
