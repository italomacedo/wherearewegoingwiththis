/**
 * Shared UI tokens for the cyberpunk neon look (Fase 20+ visual unification).
 *
 * Use these instead of hardcoding colours/sizes so every menu/overlay stays
 * coherent: frame, header bar, accent line, scrim, neon buttons, scrollbar.
 *
 * Browser-only consumers; this file itself is just constants + tiny helpers, so
 * no Babylon imports (the call sites do the GUI work).
 */

export const UI = {
  // ── Surfaces ──
  scrim: 'rgba(2,5,11,0.86)',           // full-screen dim behind a centred panel
  frameBg: 'rgba(7,14,24,0.98)',        // the central panel background
  frameBorder: '#0c4d57',               // frame outline (deep teal)
  headerBg: 'rgba(0,28,38,0.95)',       // header strip at the top of a frame
  cardBg: 'rgba(0,18,28,0.7)',          // a list/grid card inside a frame
  cardBgHover: 'rgba(0,28,40,0.9)',
  cardBorder: '#1d3b46',
  // ── Accents ──
  accent: '#00FFCC',                    // neon cyan (titles, primary highlights)
  accentSoft: '#00FFCC55',              // scrollbar bar
  accentBgSoft: 'rgba(255,255,255,0.05)',
  // ── Text ──
  textPrimary: '#00FFCC',
  textBody: '#aec4d6',
  textMeta: '#7d93a6',
  textMuted: '#6f879b',
  // ── Buttons ──
  btnBg: 'rgba(0,40,50,0.9)',
  btnFg: '#00FFCC',
  btnDangerBg: 'rgba(40,0,10,0.7)',
  btnDangerBgHover: 'rgba(120,0,20,0.95)',
  btnDangerFg: '#ff6680',
  btnDangerFgHover: '#ffaabb',
  // ── Sizes ──
  cornerLg: 12,
  cornerMd: 8,
  cornerSm: 6,
  headerHeight: '56px',
  // ── Font ──
  font: '"Courier New", monospace',
  fontTitle: 22,
  fontSub: 15,
  fontBody: 12,
  fontMeta: 11,
} as const;
