import { fmtCountdown, fmtResetClock } from '../lib'

/** Requirement #3: show BOTH the 5H reset countdown and the absolute clock time. */
export function ResetInfo({ resetsAt, use24h }: { resetsAt?: string; use24h: boolean }) {
  if (!resetsAt) return <div className="reset-info muted">리셋 정보 없음</div>
  return (
    <div className="reset-info">
      <span className="reset-clock">{fmtResetClock(resetsAt, use24h)} 리셋</span>
      <span className="reset-countdown">{fmtCountdown(resetsAt)} 남음</span>
    </div>
  )
}
