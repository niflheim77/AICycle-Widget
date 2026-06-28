// Tiny i18n shared by the main and renderer processes. Each process sets its
// own `currentLang` (detected from the OS locale in main, passed to renderer).

export type Lang = 'en' | 'ko'

export function detectLang(locale: string | undefined): Lang {
  return (locale ?? '').toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

const messages: Record<Lang, Record<string, string>> = {
  ko: {
    // window labels — kept short/English in both languages
    'w.5h': '5H',
    'w.7d': '7D',
    'w.7dOpus': '7D Opus',
    'w.5hLocal': '5H·local',
    'w.7dLocal': '7D·local',
    'w.promptCredits': 'Prompt',
    'w.flowCredits': 'Flow',
    // window bar — compact/English in both languages
    'bar.usedPct': '{0}%',
    'bar.refreshAt': '{0} reset',
    'bar.timeLeft': '{0} left',
    'bar.tokens': '{0} tok',
    // countdown — compact/English in both languages
    'cd.soon': 'now',
    'cd.dh': '{0}d {1}h',
    'cd.hm': '{0}h {1}m',
    'cd.m': '{0}m',
    'cd.none': '—',
    // cards / buttons
    'btn.claudeLogin': 'Claude 로그인 (한 번만)',
    'btn.loggingIn': '로그인 창에서 진행…',
    'btn.back': '뒤로',
    'state.loading': '로딩…',
    'state.noData': '데이터 없음',
    'state.noProviders': '표시할 프로바이더가 없습니다. 위에서 켜주세요.',
    // detail
    'detail.extraTitle': '추가 사용량 (Extra usage)',
    'detail.prepaid': '선불 잔액: {0}',
    'detail.overageOff': '추가 과금 비활성 또는 데이터 없음',
    'detail.notProvided': '이 프로바이더는 추가 사용량 정보를 제공하지 않습니다',
    // tray
    'tray.refresh': '새로고침',
    'tray.settings': '설정',
    'tray.onTop': '항상 위',
    'tray.startup': 'Windows 시작 시 자동 실행',
    'tray.claudeLogout': 'Claude 로그아웃',
    'tray.quit': '종료',
    // settings screen
    'settings.title': '설정',
    'settings.onTop': '항상 위에 표시',
    'settings.startup': 'Windows 시작 시 자동 실행',
    'settings.use24h': '24시간 형식',
    'settings.refresh': '새로고침 주기',
    'settings.refreshNow': '지금 새로고침',
    'settings.claudeLogout': 'Claude 로그아웃',
    'settings.quit': '종료',
    // claude notes
    'claude.loginPrompt': 'claude.ai에 로그인하면 사용량(%)이 표시됩니다',
    'claude.sessionExpired': 'claude.ai 세션 만료 — 다시 로그인하세요',
    // codex
    'codex.loginNeeded': 'ChatGPT 로그인 필요 (공식 % 표시)',
    'codex.noData': 'Codex 데이터 없음 또는 읽기 실패',
    'codex.account': '계정: {0}',
    'codex.creditsUnlimited': '크레딧: 무제한',
    'codex.creditBalance': '크레딧 잔액: {0}',
    'codex.creditNone': ' (없음)',
    'codex.resetCredits': '리셋 크레딧: {0}개',
    'codex.localTokens5h': '로컬 토큰 (5시간): {0}',
    'codex.localTokens7d': '로컬 토큰 (주간): {0}',
    // antigravity
    'ag.turnOn': 'Antigravity IDE를 켜면 갱신',
    'ag.offline': 'Antigravity 꺼짐 — 마지막 값',
    'ag.noData': '사용량 데이터 없음',
    'ag.unlimited': '무제한',
    'ag.user': '사용자: {0}',
    'ag.plan': '플랜: {0}',
    'ag.promptLeft': '프롬프트 크레딧 사용: {0}',
    'ag.flowLeft': '플로우 크레딧 사용: {0}',
    'ag.flexLimit': '플렉스 크레딧 구매 한도: {0}',
    'ag.maxChatTokens': '채팅 입력 토큰 최대: {0}',
    'ag.premiumChat': '프리미엄 채팅 메시지: {0}',
    'ag.canBuy': '추가 크레딧 구매: {0}',
    'ag.yes': '가능',
    'ag.no': '불가',
    'ag.features': '기능: {0}',
    'ag.featWebSearch': '웹검색',
    'ag.featKnowledge': '지식베이스',
    'ag.featPremium': '프리미엄 모델',
    'ag.featAutoRun': '자동 명령 실행',
    'ag.featCommit': '커밋 메시지',
    'ag.featFastAutocomplete': '빠른 자동완성'
  },
  en: {
    'w.5h': '5H',
    'w.7d': '7D',
    'w.7dOpus': '7D Opus',
    'w.5hLocal': '5H·local',
    'w.7dLocal': '7D·local',
    'w.promptCredits': 'Prompt',
    'w.flowCredits': 'Flow',
    'bar.usedPct': '{0}%',
    'bar.refreshAt': '{0} reset',
    'bar.timeLeft': '{0} left',
    'bar.tokens': '{0} tok',
    'cd.soon': 'now',
    'cd.dh': '{0}d {1}h',
    'cd.hm': '{0}h {1}m',
    'cd.m': '{0}m',
    'cd.none': '—',
    'btn.claudeLogin': 'Log in to Claude (once)',
    'btn.loggingIn': 'Continue in login window…',
    'btn.back': 'Back',
    'state.loading': 'Loading…',
    'state.noData': 'No data',
    'state.noProviders': 'No providers to show. Enable one above.',
    'detail.extraTitle': 'Extra usage',
    'detail.prepaid': 'Prepaid balance: {0}',
    'detail.overageOff': 'Overage disabled or no data',
    'detail.notProvided': 'This provider does not report extra usage',
    'tray.refresh': 'Refresh',
    'tray.settings': 'Settings',
    'tray.onTop': 'Always on top',
    'tray.startup': 'Launch at startup',
    'tray.claudeLogout': 'Log out of Claude',
    'tray.quit': 'Quit',
    'settings.title': 'Settings',
    'settings.onTop': 'Always on top',
    'settings.startup': 'Launch at startup',
    'settings.use24h': '24-hour time',
    'settings.refresh': 'Refresh interval',
    'settings.refreshNow': 'Refresh now',
    'settings.claudeLogout': 'Log out of Claude',
    'settings.quit': 'Quit',
    'claude.loginPrompt': 'Log in to claude.ai to see usage (%)',
    'claude.sessionExpired': 'claude.ai session expired — please log in again',
    'codex.loginNeeded': 'ChatGPT login required (for official %)',
    'codex.noData': 'No Codex data or read failed',
    'codex.account': 'Account: {0}',
    'codex.creditsUnlimited': 'Credits: unlimited',
    'codex.creditBalance': 'Credit balance: {0}',
    'codex.creditNone': ' (none)',
    'codex.resetCredits': 'Reset credits: {0}',
    'codex.localTokens5h': 'Local tokens (5h): {0}',
    'codex.localTokens7d': 'Local tokens (weekly): {0}',
    'ag.turnOn': 'Open Antigravity IDE to update',
    'ag.offline': 'Antigravity off — last value',
    'ag.noData': 'No usage data',
    'ag.unlimited': 'Unlimited',
    'ag.user': 'User: {0}',
    'ag.plan': 'Plan: {0}',
    'ag.promptLeft': 'Prompt credits used: {0}',
    'ag.flowLeft': 'Flow credits used: {0}',
    'ag.flexLimit': 'Flex credit purchase limit: {0}',
    'ag.maxChatTokens': 'Max chat input tokens: {0}',
    'ag.premiumChat': 'Premium chat messages: {0}',
    'ag.canBuy': 'Buy more credits: {0}',
    'ag.yes': 'yes',
    'ag.no': 'no',
    'ag.features': 'Features: {0}',
    'ag.featWebSearch': 'Web search',
    'ag.featKnowledge': 'Knowledge base',
    'ag.featPremium': 'Premium models',
    'ag.featAutoRun': 'Auto-run commands',
    'ag.featCommit': 'Commit messages',
    'ag.featFastAutocomplete': 'Fast autocomplete'
  }
}

let currentLang: Lang = 'en'

export function setLang(l: Lang) { currentLang = l }
export function getLang(): Lang { return currentLang }
export function localeTag(): string { return currentLang === 'ko' ? 'ko-KR' : 'en-US' }

export function t(key: string, ...args: Array<string | number>): string {
  let s = messages[currentLang][key] ?? messages.en[key] ?? key
  args.forEach((a, i) => { s = s.replace(`{${i}}`, String(a)) })
  return s
}
