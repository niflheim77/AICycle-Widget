export type ProviderId = 'claude' | 'codex' | 'grok' | 'antigravity'

/** Display order, shared by the toggle bar, the cards and the context menu. */
export const PROVIDER_IDS: ProviderId[] = ['claude', 'codex', 'grok', 'antigravity']

/** What each provider is called in the UI. One source so the menu, the bar and
 *  the cards cannot drift — 'antigravity' is the data source (that IDE's
 *  language server) but is shown as Gemini, the model family it reports on. */
export const PROVIDER_NAMES: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  grok: 'Grok',
  antigravity: 'Gemini'
}
