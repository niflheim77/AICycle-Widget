import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProviderId, Settings, UsageSnapshot } from './types'
import { ProviderCard } from './components/ProviderCard'
import { ProviderToggles } from './components/ProviderToggles'
import { DetailView } from './components/DetailView'
import { t, setLang } from '../shared/i18n'

const ORDER: ProviderId[] = ['claude', 'codex', 'antigravity']

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [snaps, setSnaps] = useState<Record<string, UsageSnapshot>>({})
  const [detail, setDetail] = useState<ProviderId | null>(null)
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
    // Re-render every 30s so countdowns stay fresh between polls.
    const timer = setInterval(() => force((n) => n + 1), 30_000)
    return () => { off(); clearInterval(timer) }
  }, [])

  // Auto-size the window to fit the rendered content (any toggle combination).
  // Measured after every commit so it both grows and shrinks deterministically.
  useLayoutEffect(() => {
    const h = rootRef.current?.getBoundingClientRect().height
    if (h) window.aicycle.autosize(Math.ceil(h))
  })

  if (!settings) return <div className="app loading" ref={rootRef}>{t('state.loading')}</div>

  const use24h = settings.use24h
  const enabledIds = ORDER.filter((id) => settings.enabledProviders[id])

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
          <button className="icon-btn" title="새로고침" onClick={() => window.aicycle.refresh()}>⟳</button>
          <button className="icon-btn" title="종료" onClick={() => window.aicycle.quit()}>✕</button>
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
