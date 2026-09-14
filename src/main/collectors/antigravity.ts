import fs from 'fs'
import { execFileSync } from 'child_process'
import Store from 'electron-store'
import { UsageSnapshot, UsageWindow, emptySnapshot, ProviderId } from './types'
import { t } from '../../shared/i18n'

// Antigravity usage via its local Language Server (Codeium/Windsurf based).
// Supports multiple concurrent instances (e.g. Antigravity and Antigravity IDE).
// The server only runs while Antigravity is open. Each launch it picks a random
// loopback port and a CSRF token (passed as `--csrf_token` on its command line).
// Quota information is extracted from cascadeModelConfigData.clientModelConfigs
// (remainingFraction and resetTime) for Gemini and Claude models.

const cacheStore = new Store<{ antigravity?: UsageSnapshot; antigravity_2?: UsageSnapshot }>({
  name: 'aicycle-cache'
})

interface DiscoveredServer {
  pid: string
  csrf: string
  appDataDir: string
  ports: number[]
}

const activeServers: Record<string, { port: number; csrf: string }> = {}

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 8000 })
  } catch {
    return ''
  }
}

const CSRF_RE = /--csrf_token[\s=]+([0-9a-fA-F-]{16,})/

/** Listening loopback ports for a pid. Tries lsof, then `ss` on Linux. */
function listeningPortsUnix(pid: string): number[] {
  const grab = (s: string) =>
    [...new Set([...s.matchAll(/(?:127\.0\.0\.1|\[?::1\]?|localhost):(\d+)/g)].map((x) => parseInt(x[1], 10)).filter((n) => n > 0))]
  let ports = grab(run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', pid]))
  if (!ports.length && process.platform === 'linux') {
    const ss = run('ss', ['-tlnpH']).split('\n').filter((l) => l.includes(`pid=${pid},`)).join('\n')
    ports = grab(ss)
  }
  return ports
}

/** Find all running language_server processes. */
function discoverAll(): DiscoveredServer[] {
  return process.platform === 'win32' ? discoverWindows() : discoverUnix()
}

function discoverWindows(): DiscoveredServer[] {
  const out = run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'language_server*' } | " +
    "ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }"
  ])
  const lines = out.split('\n').filter((l) => CSRF_RE.test(l))
  const results: DiscoveredServer[] = []
  for (const line of lines) {
    const parts = line.split('|')
    const pid = parts[0]?.trim()
    const cmd = parts[1] ?? ''
    const csrf = cmd.match(CSRF_RE)?.[1]
    if (!csrf || !pid) continue
    const mApp = cmd.match(/--app_data_dir[\s=]+([^\s]+)/)
    const appDataDir = mApp ? mApp[1] : (cmd.includes('antigravity-ide') ? 'antigravity-ide' : 'antigravity')
    const net = run('powershell', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -State Listen -OwningProcess ${pid} | Select-Object -ExpandProperty LocalPort`])
    const ports = [...new Set(net.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0))]
    if (ports.length) {
      results.push({ pid, csrf, appDataDir, ports })
    }
  }
  return results
}

function discoverUnix(): DiscoveredServer[] {
  const results: DiscoveredServer[] = []
  if (process.platform === 'linux') {
    try {
      for (const pid of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(pid)) continue
        let cmd: string
        try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ') } catch { continue }
        if (/language_server/.test(cmd) && CSRF_RE.test(cmd)) {
          const csrf = cmd.match(CSRF_RE)?.[1]
          if (csrf) {
            const mApp = cmd.match(/--app_data_dir[\s=]+([^\s]+)/)
            const appDataDir = mApp ? mApp[1] : (cmd.includes('antigravity-ide') ? 'antigravity-ide' : 'antigravity')
            const ports = listeningPortsUnix(pid)
            if (ports.length) {
              results.push({ pid, csrf, appDataDir, ports })
            }
          }
        }
      }
    } catch { /* /proc unavailable */ }
    return results
  }

  const out = run('ps', ['-ww', '-A', '-o', 'pid=,args='])
  const lines = out.split('\n').filter((l) => /language_server/.test(l) && CSRF_RE.test(l))
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/)
    if (!m) continue
    const pid = m[1]
    const cmd = m[2]
    const csrf = cmd.match(CSRF_RE)?.[1]
    if (csrf) {
      const mApp = cmd.match(/--app_data_dir[\s=]+([^\s]+)/)
      const appDataDir = mApp ? mApp[1] : (cmd.includes('antigravity-ide') ? 'antigravity-ide' : 'antigravity')
      const ports = listeningPortsUnix(pid)
      if (ports.length) {
        results.push({ pid, csrf, appDataDir, ports })
      }
    }
  }
  return results
}

async function rpc(port: number, csrf: string, method: string): Promise<any | null> {
  try {
    const r = await fetch(
      `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'x-codeium-csrf-token': csrf },
        body: '{}'
      }
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function offline(providerId: 'antigravity' | 'antigravity_2', note: string): UsageSnapshot {
  const cached = cacheStore.get(providerId) as UsageSnapshot | undefined
  if (cached) return { ...cached, stale: true, note: t('ag.offline') }
  return emptySnapshot(providerId, note)
}

/** Resolve a working { port, csrf } for the target instance. */
async function getStatusForInstance(
  providerId: 'antigravity' | 'antigravity_2'
): Promise<{ status: any; port: number; csrf: string } | null> {
  const isSecond = providerId === 'antigravity_2'

  // Try cached server if alive
  const cached = activeServers[providerId]
  if (cached) {
    const s = await rpc(cached.port, cached.csrf, 'GetUserStatus')
    if (s) return { status: s, port: cached.port, csrf: cached.csrf }
    delete activeServers[providerId]
  }

  const all = discoverAll()
  if (all.length === 0) return null

  // Match instance:
  // antigravity_2 matches appDataDir == 'antigravity-ide'
  // antigravity matches appDataDir == 'antigravity' or default
  let target = isSecond
    ? all.find((d) => d.appDataDir === 'antigravity-ide')
    : all.find((d) => d.appDataDir !== 'antigravity-ide')

  // Fallback if flags not set: assign by index if 2 are running
  if (!target) {
    if (isSecond && all.length >= 2) {
      target = all[1]
    } else if (!isSecond && all.length >= 1) {
      target = all[0]
    }
  }

  if (!target) return null

  for (const port of target.ports) {
    const s = await rpc(port, target.csrf, 'GetUserStatus')
    if (s) {
      activeServers[providerId] = { port, csrf: target.csrf }
      return { status: s, port, csrf: target.csrf }
    }
  }

  return null
}

export async function collectAntigravity(
  providerId: 'antigravity' | 'antigravity_2' = 'antigravity'
): Promise<UsageSnapshot> {
  const res = await getStatusForInstance(providerId).catch(() => null)
  if (!res) {
    delete activeServers[providerId]
    const label = providerId === 'antigravity_2' ? 'Antigravity IDE 2' : 'Antigravity 1'
    return offline(providerId, `${label} ${t('ag.turnOn')}`)
  }

  const us = res.status.userStatus ?? {}
  const plan = us.planStatus ?? res.status.planStatus ?? {}
  const info = plan.planInfo ?? {}
  const configs: any[] = us.cascadeModelConfigData?.clientModelConfigs ?? []

  const windows: UsageWindow[] = []

  // 1. Quota real do Gemini:
  const geminiConfigs = configs.filter(
    (c: any) => /gemini/i.test(c.modelId ?? '') || /gemini/i.test(c.label ?? '')
  )
  const geminiQuota = geminiConfigs.find((c: any) => c.quotaInfo?.remainingFraction !== undefined)?.quotaInfo

  if (geminiQuota && typeof geminiQuota.remainingFraction === 'number') {
    const remaining = geminiQuota.remainingFraction
    const utilization = Math.max(0, Math.min(1, 1 - remaining))
    windows.push({
      window_type: 'daily',
      utilization,
      remaining,
      resets_at: geminiQuota.resetTime,
      label: 'Gemini'
    })
  }

  // 2. Quota do Claude (se presente no Antigravity):
  const claudeConfigs = configs.filter(
    (c: any) => /claude/i.test(c.modelId ?? '') || /claude/i.test(c.label ?? '')
  )
  const claudeQuota = claudeConfigs.find((c: any) => c.quotaInfo?.remainingFraction !== undefined)?.quotaInfo

  if (claudeQuota && typeof claudeQuota.remainingFraction === 'number') {
    const claudeRemaining = claudeQuota.remainingFraction
    const claudeUtilization = Math.max(0, Math.min(1, 1 - claudeRemaining))
    windows.push({
      window_type: 'seven_day',
      utilization: claudeUtilization,
      remaining: claudeRemaining,
      resets_at: claudeQuota.resetTime,
      label: 'Claude'
    })
  }

  // Fallback: se nenhuma cota de modelo for encontrada, usar créditos Prompt/Flow
  if (windows.length === 0) {
    const resetAt = geminiQuota?.resetTime ?? configs[0]?.quotaInfo?.resetTime
    const addCredit = (label: string, used: unknown, monthly: unknown) => {
      const u = Number(used), m = Number(monthly)
      if (!isFinite(u) || !isFinite(m) || m <= 0) return
      windows.push({ window_type: 'daily', utilization: Math.min(Math.max(u / m, 0), 1), used: u, limit: m, resets_at: resetAt, label })
    }
    addCredit(t('w.promptCredits'), plan.availablePromptCredits, info.monthlyPromptCredits)
    addCredit(t('w.flowCredits'), plan.availableFlowCredits, info.monthlyFlowCredits)
  }

  if (windows.length === 0) return offline(providerId, t('ag.noData'))

  const usedOf = (used: unknown, monthly: unknown) => {
    const u = Number(used), m = Number(monthly)
    return isFinite(u) && isFinite(m) ? `${u.toLocaleString()} / ${m.toLocaleString()}` : '?'
  }
  const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? (x < 0 ? t('ag.unlimited') : x.toLocaleString()) : '?' }

  const feat: string[] = []
  if (info.cascadeWebSearchEnabled) feat.push(t('ag.featWebSearch'))
  if (info.knowledgeBaseEnabled) feat.push(t('ag.featKnowledge'))
  if (info.allowStickyPremiumModels) feat.push(t('ag.featPremium'))
  if (info.cascadeCanAutoRunCommands) feat.push(t('ag.featAutoRun'))
  if (info.canGenerateCommitMessages) feat.push(t('ag.featCommit'))
  if (info.hasAutocompleteFastMode) feat.push(t('ag.featFastAutocomplete'))

  const geminiPct = geminiQuota ? `${Math.round(geminiQuota.remainingFraction * 100)}%` : null
  const claudePct = claudeQuota ? `${Math.round(claudeQuota.remainingFraction * 100)}%` : null
  const accountEmail = us.email ? ` (${us.email})` : ''

  const snap: UsageSnapshot = {
    provider: providerId as ProviderId,
    available: true,
    windows,
    plan: info.planName,
    extraInfo: [
      us.name || us.email ? t('ag.user', `${us.name || ''}${accountEmail}`) : '',
      t('ag.plan', info.planName ?? '?'),
      geminiPct ? `Gemini: ${geminiPct} ${t('bar.timeLeft', '')}`.trim() : '',
      claudePct ? `Claude: ${claudePct} ${t('bar.timeLeft', '')}`.trim() : '',
      t('ag.promptLeft', usedOf(plan.availablePromptCredits, info.monthlyPromptCredits)),
      t('ag.flowLeft', usedOf(plan.availableFlowCredits, info.monthlyFlowCredits)),
      t('ag.flexLimit', n(info.monthlyFlexCreditPurchaseAmount)),
      t('ag.maxChatTokens', n(info.maxNumChatInputTokens)),
      t('ag.premiumChat', n(info.maxNumPremiumChatMessages)),
      t('ag.canBuy', info.canBuyMoreCredits ? t('ag.yes') : t('ag.no')),
      feat.length ? t('ag.features', feat.join(' · ')) : ''
    ].filter(Boolean),
    fetched_at: new Date().toISOString(),
    stale: false,
    source: 'api'
  }

  cacheStore.set(providerId, snap)
  return snap
}
