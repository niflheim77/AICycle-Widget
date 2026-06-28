import { BrowserWindow } from 'electron'
import { collectClaude } from './collectors/claude'
import { collectCodex } from './collectors/codex'
import { collectAntigravity } from './collectors/antigravity'
import { UsageSnapshot, ProviderId, emptySnapshot } from './collectors/types'
import { getSettings } from './settings'

const COLLECTORS: Record<ProviderId, () => Promise<UsageSnapshot>> = {
  claude: collectClaude,
  codex: collectCodex,
  antigravity: collectAntigravity
}

let timer: NodeJS.Timeout | null = null
let lastSnapshots: Record<string, UsageSnapshot> = {}

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
        return emptySnapshot(id, '수집 오류: ' + (e?.message ?? ''))
      }
    })
  )
  lastSnapshots = Object.fromEntries(ids.map((id, i) => [id, results[i]]))
  broadcast()
  return lastSnapshots
}

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('snapshots', lastSnapshots)
  }
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
