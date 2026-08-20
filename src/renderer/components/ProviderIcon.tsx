import type { ProviderId } from '../types'

// Simple marks drawn to the same spec as the title-bar icons (24-unit viewBox,
// ~18-unit body) so the two icon rows share a weight. These are our own
// simplified glyphs, not the vendors' logo files.
const PATHS: Record<ProviderId, JSX.Element> = {
  // Claude — radiating burst.
  claude: (
    <g strokeWidth="2" strokeLinecap="round">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </g>
  ),
  // Codex — hexagonal knot.
  codex: (
    <g strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6z" />
      <path d="M12 12l7.6-4.4M12 12v8.8M12 12L4.4 7.6" />
    </g>
  ),
  // Grok — slashed X.
  grok: (
    <g strokeWidth="2.2" strokeLinecap="round">
      <path d="M5 4.5l14 15M19 4.5L5 19.5" />
    </g>
  ),
  // Gemini — four-point spark.
  antigravity: (
    <g strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3.2c0 4.85 3.95 8.8 8.8 8.8-4.85 0-8.8 3.95-8.8 8.8 0-4.85-3.95-8.8-8.8-8.8 4.85 0 8.8-3.95 8.8-8.8z" />
    </g>
  )
}

export function ProviderIcon({ provider, size = 15 }: { provider: ProviderId; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {PATHS[provider]}
    </svg>
  )
}
