import type { TokenTotals, UsageSnapshot } from '../types'
import { PROVIDER_META, fmtTokens } from '../lib'
import { WindowBar } from './WindowBar'
import { t } from '../../shared/i18n'

/** Cumulative tokens from local logs. Cache reads dominate the sum (they are the
 *  bulk of any long session), so the breakdown is shown rather than one number. */
function TotalTokens({ tot }: { tot: TokenTotals }) {
  const day = tot.since ? new Date(tot.since) : null
  const rows: Array<[string, number]> = [
    [t('total.input'), tot.input],
    [t('total.output'), tot.output]
  ]
  if (tot.cacheWrite) rows.push([t('total.cacheWrite'), tot.cacheWrite])
  if (tot.cacheRead) rows.push([t('total.cacheRead'), tot.cacheRead])
  return (
    <div className="extra-box">
      <div className="total-head">
        <span className="extra-title">{t('total.title')}</span>
        <span className="total-sum">{fmtTokens(tot.total)}</span>
      </div>
      {rows.map(([label, n]) => (
        <div key={label} className="total-row">
          <span className="muted">{label}</span>
          <span>{fmtTokens(n)}</span>
        </div>
      ))}
      <div className="total-note muted">
        {day ? t('total.since', `${day.getFullYear()}.${day.getMonth() + 1}.${day.getDate()}`) : t('total.thisMachine')}
        {tot.partial ? ` · ${t('total.partial')}` : ''}
      </div>
    </div>
  )
}

const CURRENCY: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }

export function DetailView({
  snap, use24h, onBack
}: {
  snap: UsageSnapshot
  use24h: boolean
  onBack: () => void
}) {
  const meta = PROVIDER_META[snap.provider]
  const isLocal = snap.source === 'local'
  const sym = snap.extraUsage ? CURRENCY[snap.extraUsage.currency] ?? snap.extraUsage.currency + ' ' : '$'
  return (
    <div className="detail">
      <div className="detail-head">
        <button className="back-btn" onClick={onBack}>← {t('btn.back')}</button>
        <span className="dot" style={{ background: meta.color }} />
        <span className="provider-name">{meta.name}</span>
        {snap.plan && <span className="plan-badge">{snap.plan}</span>}
      </div>

      {!snap.available && <div className="card-note">{snap.note ?? t('state.noData')}</div>}

      {snap.windows.map((w, i) => (
        <WindowBar key={i} w={w} use24h={use24h} isLocal={isLocal} />
      ))}

      {snap.extraInfo && snap.extraInfo.length > 0 && (
        <div className="info-box">
          {snap.extraInfo.map((line, i) => (
            <div key={i} className="info-line">{line}</div>
          ))}
        </div>
      )}

      {snap.totalTokens && snap.totalTokens.total > 0 && <TotalTokens tot={snap.totalTokens} />}

      {snap.provider === 'claude' && !isLocal && (
        <div className="extra-box">
          <div className="extra-title">{t('detail.extraTitle')}</div>
          {snap.extraUsage && snap.extraUsage.enabled ? (
            <div className="extra-body">
              <div className="extra-amount">
                {sym}{snap.extraUsage.used.toFixed(2)}
                {snap.extraUsage.limit != null && (
                  <span className="extra-limit"> / {sym}{snap.extraUsage.limit.toFixed(2)}</span>
                )}
              </div>
              {snap.extraUsage.balance != null && (
                <div className="extra-balance">{t('detail.prepaid', `${sym}${snap.extraUsage.balance.toFixed(2)}`)}</div>
              )}
            </div>
          ) : (
            <div className="extra-none muted">
              {snap.provider === 'claude'
                ? t('detail.overageOff')
                : t('detail.notProvided')}
            </div>
          )}
        </div>
      )}

      {snap.note && <div className="detail-note muted">{snap.note}</div>}
    </div>
  )
}
