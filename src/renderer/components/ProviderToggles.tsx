import type { ProviderId, Settings } from '../types'
import { PROVIDER_META } from '../lib'
import { ProviderIcon } from './ProviderIcon'

const IDS: ProviderId[] = ['claude', 'codex', 'grok', 'antigravity']

/** Requirement #1: per-provider on/off so the user only sees what they want. */
export function ProviderToggles({
  settings,
  onToggle,
  compact
}: {
  settings: Settings
  onToggle: (id: ProviderId, enabled: boolean) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? 'toggles toggles-compact' : 'toggles'}>
      {IDS.map((id) => {
        const on = settings.enabledProviders[id]
        const meta = PROVIDER_META[id]
        return (
          <button
            key={id}
            className={`${compact ? 'itoggle' : 'toggle'} ${on ? 'on' : 'off'}`}
            style={on ? { borderColor: meta.color, color: meta.color } : undefined}
            onClick={() => onToggle(id, !on)}
            title={`${meta.name} ${on ? '끄기' : '켜기'}`}
          >
            {compact ? <ProviderIcon provider={id} /> : meta.name}
          </button>
        )
      })}
    </div>
  )
}
