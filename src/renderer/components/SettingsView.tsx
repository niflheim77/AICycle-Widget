import type { Settings } from '../types'
import { t } from '../../shared/i18n'

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={`switch ${on ? 'on' : ''}`} onClick={onClick} role="switch" aria-checked={on}>
      <span className="knob" />
    </button>
  )
}

const INTERVALS = [30, 60, 120, 300]
const intervalLabel = (s: number) => (s < 60 ? `${s}s` : `${s / 60}m`)

export function SettingsView({
  settings, onPatch, onClose
}: {
  settings: Settings
  onPatch: (p: Partial<Settings>) => void
  onClose: () => void
}) {
  return (
    <div className="settings">
      <div className="detail-head">
        <button className="back-btn" onClick={onClose}>← {t('btn.back')}</button>
        <span className="provider-name">{t('settings.title')}</span>
      </div>

      <div className="set-row">
        <span>{t('settings.onTop')}</span>
        <Toggle on={settings.alwaysOnTop} onClick={() => onPatch({ alwaysOnTop: !settings.alwaysOnTop })} />
      </div>
      <div className="set-row">
        <span>{t('settings.startup')}</span>
        <Toggle on={settings.launchAtStartup} onClick={() => onPatch({ launchAtStartup: !settings.launchAtStartup })} />
      </div>
      <div className="set-row">
        <span>{t('settings.use24h')}</span>
        <Toggle on={settings.use24h} onClick={() => onPatch({ use24h: !settings.use24h })} />
      </div>
      <div className="set-row">
        <span>{t('settings.refresh')}</span>
        <select
          className="set-select"
          value={settings.refreshSeconds}
          onChange={(e) => onPatch({ refreshSeconds: Number(e.target.value) })}
        >
          {INTERVALS.map((s) => (
            <option key={s} value={s}>{intervalLabel(s)}</option>
          ))}
        </select>
      </div>

      <div className="set-actions">
        <button className="set-btn" onClick={() => window.aicycle.refresh()}>{t('settings.refreshNow')}</button>
        <button className="set-btn" onClick={() => window.aicycle.claudeLogout()}>{t('settings.claudeLogout')}</button>
        <button className="set-btn danger" onClick={() => window.aicycle.quit()}>{t('settings.quit')}</button>
      </div>
    </div>
  )
}
