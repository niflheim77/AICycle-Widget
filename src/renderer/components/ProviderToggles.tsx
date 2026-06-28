import type { ProviderId, Settings } from '../types'
import { PROVIDER_META } from '../lib'

const IDS: ProviderId[] = ['claude', 'codex', 'antigravity']

/** Requirement #1: per-provider on/off so the user only sees what they want. */
export function ProviderToggles({
  settings,
  onToggle
}: {
  settings: Settings
  onToggle: (id: ProviderId, enabled: boolean) => void
}) {
  return (
    <div className="toggles">
      {IDS.map((id) => {
        const on = settings.enabledProviders[id]
        return (
          <button
            key={id}
            className={`toggle ${on ? 'on' : 'off'}`}
            style={on ? { borderColor: PROVIDER_META[id].color, color: PROVIDER_META[id].color } : undefined}
            onClick={() => onToggle(id, !on)}
            title={`${PROVIDER_META[id].name} ${on ? '끄기' : '켜기'}`}
          >
            {PROVIDER_META[id].name}
          </button>
        )
      })}
    </div>
  )
}
