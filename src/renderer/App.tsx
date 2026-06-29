import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProviderId, Settings, UsageSnapshot } from './types'
import { ProviderCard } from './components/ProviderCard'
import { ProviderToggles } from './components/ProviderToggles'
import { DetailView } from './components/DetailView'
import { SettingsView } from './components/SettingsView'
import { t, setLang } from '../shared/i18n'

const ORDER: ProviderId[] = ['claude', 'codex', 'antigravity']

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [snaps, setSnaps] = useState<Record<string, UsageSnapshot>>({})
  const [detail, setDetail] = useState<ProviderId | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [, force] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Detect OS language first so the first rendered strings are localized.
    window.aicycle.getLang().then((l) => {
      setLang(l)
      window.aicycle.getSettings().then(setSettings)
    })
    window.aicycle.getSnapshots().then(setSnaps)
    const off = window.aicycle.onSnapshots(setSnaps)
    const offSettings = window.aicycle.onOpenSettings(() => { setDetail(null); setShowSettings(true) })
    // Re-render every 30s so countdowns stay fresh between polls.
    const timer = setInterval(() => force((n) => n + 1), 30_000)
    return () => { off(); offSettings(); clearInterval(timer) }
  }, [])

  const onPatch = async (patch: Partial<Settings>) => setSettings(await window.aicycle.patchSettings(patch))

  // Auto-size the window to fit the rendered content (any toggle combination).
  // Measured after every commit so it both grows and shrinks deterministically.
  useLayoutEffect(() => {
    const h = rootRef.current?.getBoundingClientRect().height
    if (h) window.aicycle.autosize(Math.ceil(h))
  })

  if (!settings) return <div className="app loading" ref={rootRef}>{t('state.loading')}</div>

  const use24h = settings.use24h
  const enabledIds = ORDER.filter((id) => settings.enabledProviders[id])

  if (showSettings) {
    return (
      <div className="app" ref={rootRef}>
        <div className="drag-bar" />
        <SettingsView settings={settings} onPatch={onPatch} onClose={() => setShowSettings(false)} />
      </div>
    )
  }

  if (detail) {
    const snap = snaps[detail]
    return (
      <div className="app" ref={rootRef}>
        <div className="drag-bar" />
        {snap ? (
          <DetailView snap={snap} use24h={use24h} onBack={() => setDetail(null)} />
        ) : (
          <div className="card-note">{t('state.loading')}</div>
        )}
      </div>
    )
  }

  const onToggle = async (id: ProviderId, enabled: boolean) => {
    const s = await window.aicycle.setEnabled(id, enabled)
    setSettings(s)
  }

  return (
    <div className="app" ref={rootRef}>
      <div className="drag-bar">
        <span className="title">AICycle</span>
        <div className="drag-actions">
          <button className="icon-btn" title={t('settings.refreshNow')} onClick={() => window.aicycle.refresh()}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button className="icon-btn" title={t('settings.title')} onClick={() => setShowSettings(true)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="icon-btn" title={t('settings.quit')} onClick={() => window.aicycle.quit()}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <ProviderToggles settings={settings} onToggle={onToggle} />

      <div className="cards">
        {enabledIds.length === 0 && <div className="card-note">{t('state.noProviders')}</div>}
        {enabledIds.map((id) => {
          const snap = snaps[id]
          if (!snap) return <div key={id} className="card"><div className="card-note">{t('state.loading')}</div></div>
          return (
            <div key={id} className="card-click" onClick={() => setDetail(id)}>
              <ProviderCard snap={snap} use24h={use24h} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
