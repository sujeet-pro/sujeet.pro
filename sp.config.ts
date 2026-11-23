export const spConfig = {
  prefix: 'sp',
  storageKey: 'sp-v8-prefs',
  navSessionKey: 'sp-v8-nav-series',
  idbName: 'sp-v8-idb',
  siteUrl: 'https://sujeet.pro',
  repoUrl: 'https://github.com/sujeet-pro/sujeet.pro',
  author: { name: 'Sujeet Jaiswal', handle: 'sujeet.pro' },
  features: {
    commandPalette: true,
    pagefindSearch: true,
    exploreGraph: true,
    indexedDbCache: false, // opt-in hash-keyed IDB; default uses hashed URL + memory + HTTP ETag
    audioCompanion: true,
    brandedPdfExport: true,
    printGuard: true,
    draftDiscoveryParam: 'drafts',
  },
  shortcuts: {
    palette: 'mod+k',
    search: '/',
    commands: '>',
    help: '?',
    cycleTheme: 't',
    toggleAudio: 'p',
    seekBack: '[',
    seekForward: ']',
    nextSection: 'j',
    prevSection: 'k',
    copyAiPrompt: 'l',
    goHome: 'g h',
    goExplore: 'g e',
  },
  theme: {
    defaultScheme: 'auto' as 'auto' | 'light' | 'dark',
    defaultContrast: 'default' as 'default' | 'high',
    defaultTextSize: 'default' as 'default' | 'large',
    singleKeyShortcutsEnabled: true, // WCAG 2.1.4 user-toggleable in sp-v8-prefs
  },
  media: { baseUrl: '' }, // empty = same-origin /<slug>/...; set to R2/CDN URL later without markup edits
  audio: {
    engine: 'mlx-audio' as const,
    model: 'mlx-community/Kokoro-82M-bf16',
    voice: 'am_michael',
    langCode: 'a',
    speed: 1.0,
    sampleRateHz: 24000,
    paragraphPauseMs: 350,
    chapterPauseMs: 900,
    targetLufs: -16,
    bitrateKbps: 64,
    baseUrl: '',
  },
  pdf: {
    watermarkText: 'sujeet.pro',
    watermarkOpacity: 0.06,
    headerBrand: 'sujeet.pro',
    footerAuthor: 'Sujeet Jaiswal',
    format: 'A4' as const,
  },
  layout: {
    containerPx: 1140,          // --sp-container: header, body, labs, footer share edges
    measureCh: 68,              // --sp-measure: max-width of text runs, left-aligned
    // Owner pick (2026-11-23): 'hybrid' = reading-first `stacked`, promoted to `split` on wide viewports
    // by a CSS media query only (same DOM, no JS, zero CLS; print/PDF always render `base`).
    stageVariant: 'hybrid' as 'split' | 'scrolly' | 'stacked' | 'stepper' | 'hybrid',
    hybrid: {
      base: 'stacked' as 'stacked' | 'split', // < wideMinPx, print and PDF
      wide: 'split' as 'stacked' | 'split',   // >= wideMinPx; set to 'stacked' for stacked everywhere
      wideMinPx: 1200,                        // viewport width; container (1140 + 2×20 gutters) fits from 1180
    },
    figureExpand: true, // "Expand" control on every stage figure → full-viewport dialog (image or interactive), Esc restores focus (P15)
  },
  qaBudgets: { maxCls: 0.05, maxLabLcpMs: 2500, maxFirstPaletteMs: 200, targetFieldInpMs: 200 },
} as const;

export type SpConfig = typeof spConfig;
