import type { UsageWindow } from '../types'
import { arcColor, pct, fmtTokens, fmtResetWhen, fmtCountdown } from '../lib'
import { t } from '../../shared/i18n'

/** One usage window (5h / weekly): 남은 용량 % + 리프레쉬(리셋) 시간.
 *  Local windows (no official data) show token usage only. */
export function WindowBar({ w, use24h, isLocal }: { w: UsageWindow; use24h?: boolean; isLocal?: boolean }) {
  if (isLocal) {
    return (
      <div className="wbar">
        <div className="wbar-top">
          <span className="wbar-label">{w.label ?? w.window_type}</span>
          <span className="wbar-pct muted">{t('bar.tokens', fmtTokens(w.used))}</span>
        </div>
      </div>
    )
  }

  const usedPct = pct(w.utilization)
  const color = arcColor(w.utilization)
  return (
    <div className="wbar">
      <div className="wbar-top">
        <span className="wbar-label">{w.label ?? w.window_type}</span>
        <span className="wbar-pct" style={{ color }}>{t('bar.usedPct', usedPct)}</span>
      </div>
      <div className="wbar-track">
        <div className="wbar-fill" style={{ width: `${usedPct}%`, background: color }} />
      </div>
      {w.resets_at && (
        <div className="wbar-sub">
          <span>{t('bar.timeLeft', fmtCountdown(w.resets_at))}</span>
          <span className="muted">{t('bar.refreshAt', fmtResetWhen(w.resets_at, use24h))}</span>
        </div>
      )}
    </div>
  )
}
