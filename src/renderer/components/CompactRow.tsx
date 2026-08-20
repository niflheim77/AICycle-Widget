import type { ProviderId, UsageSnapshot } from '../types'
import { PROVIDER_META, arcColor, compactWindows, pct, fmtCountdown } from '../lib'
import { t } from '../../shared/i18n'

/** One provider's slot: its short window on top, the weekly one below when the
 *  provider reports one. Slots share the row width evenly and may shrink. */
function Slot({ snap, weekly, onClick }: { snap: UsageSnapshot; weekly: boolean; onClick: () => void }) {
  const meta = PROVIDER_META[snap.provider]
  const all = snap.available ? compactWindows(snap.windows) : []
  const windows = weekly ? all : all.slice(0, 1)

  return (
    <div className="cslot" onClick={onClick} title={meta.name}>
      {windows.length === 0 ? (
        <div className="cslot-empty">
          <span className="cslot-dash" style={{ color: meta.color }}>—</span>
          <span className="cslot-when muted">
            {snap.needsLogin ? t('compact.login') : t('compact.noData')}
          </span>
        </div>
      ) : (
        windows.map((w, i) => {
          const used = pct(w.utilization)
          const color = arcColor(w.utilization)
          return (
            <div className="cwin" key={i}>
              <div className="cwin-top">
                <span className="cwin-label muted">{w.label ?? w.window_type}</span>
                <span className="cwin-pct" style={{ color }}>{used}%</span>
              </div>
              <div className="cwin-track">
                <div className="cwin-fill" style={{ width: `${used}%`, background: color }} />
              </div>
              <div className="cslot-when muted">{w.resets_at ? fmtCountdown(w.resets_at) : '—'}</div>
            </div>
          )
        })
      )}
    </div>
  )
}

export function CompactRow({
  ids, snaps, weekly, onOpen
}: {
  ids: ProviderId[]
  snaps: Record<string, UsageSnapshot>
  weekly: boolean
  onOpen: (id: ProviderId) => void
}) {
  if (ids.length === 0) return <div className="card-note">{t('state.noProviders')}</div>
  return (
    <div className="crow">
      {ids.map((id) => {
        const snap = snaps[id]
        if (!snap) return <div className="cslot" key={id}><div className="cslot-when muted">…</div></div>
        return <Slot key={id} snap={snap} weekly={weekly} onClick={() => onOpen(id)} />
      })}
    </div>
  )
}
