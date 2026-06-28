import { useState } from 'react'
import type { UsageSnapshot } from '../types'
import { WindowBar } from './WindowBar'
import { PROVIDER_META } from '../lib'
import { t } from '../../shared/i18n'

function ConnectButtons() {
  const [busy, setBusy] = useState(false)
  return (
    <div className="connect">
      <button
        className="login-btn"
        disabled={busy}
        onClick={async (e) => {
          e.stopPropagation()
          setBusy(true)
          try { await window.aicycle.claudeLogin() } finally { setBusy(false) }
        }}
      >
        {busy ? t('btn.loggingIn') : t('btn.claudeLogin')}
      </button>
    </div>
  )
}

export function ProviderCard({ snap, use24h }: { snap: UsageSnapshot; use24h: boolean }) {
  const meta = PROVIDER_META[snap.provider]
  const isLocal = snap.source === 'local'

  if (!snap.available) {
    return (
      <div className={`card ${snap.needsLogin ? '' : 'card-disabled'}`}>
        <div className="card-head">
          <span className="dot" style={{ background: meta.color }} />
          <span className="provider-name">{meta.name}</span>
        </div>
        <div className="card-note">{snap.note ?? t('state.noData')}</div>
        {snap.needsLogin && <ConnectButtons />}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="dot" style={{ background: meta.color }} />
        <span className="provider-name">{meta.name}</span>
        {snap.stale && <span className="stale-badge">캐시</span>}
        {isLocal && <span className="src-badge">로컬</span>}
      </div>
      <div className="card-windows">
        {snap.windows.map((w, i) => (
          <WindowBar key={i} w={w} use24h={use24h} isLocal={isLocal} />
        ))}
        {snap.needsLogin && (
          <>
            <div className="card-hint muted">{snap.note ?? t('claude.loginPrompt')}</div>
            <ConnectButtons />
          </>
        )}
      </div>
    </div>
  )
}
