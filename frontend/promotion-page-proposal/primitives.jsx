// MemeWarzone — shared primitives
// Logos, icons, badges, common elements used across both variations.

// ───────────────── LOGO ─────────────────
const MWLogo = ({ size = 32 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="mw-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a201a"/>
          <stop offset="1" stopColor="#0a0806"/>
        </linearGradient>
      </defs>
      <path d="M20 2 L36 8 L36 22 C36 30 28 36 20 38 C12 36 4 30 4 22 L4 8 Z"
        fill="url(#mw-shield)" stroke="#ff9b1c" strokeWidth="1.2"/>
      <path d="M12 14 L20 10 L28 14 L28 22 L20 28 L12 22 Z"
        fill="none" stroke="#ff9b1c" strokeWidth="1" opacity="0.6"/>
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="900"
        fontFamily="Bebas Neue, Inter" fill="#ff9b1c" letterSpacing="0.5">MW</text>
    </svg>
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
      <div className="mw-stencil" style={{ fontSize: 16, color: 'var(--mw-text)', letterSpacing: '0.06em' }}>
        MEME<span style={{ color: 'var(--mw-amber)' }}>WAR</span>ZONE
      </div>
    </div>
  </div>
);

// ───────────────── ICONS ─────────────────
const I = ({ d, size = 16, sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {typeof d === 'string' ? <path d={d}/> : d}
  </svg>
);

const Icons = {
  bell:    <I d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 1 1-6 0"/>,
  star:    <I d="M12 2 14.9 8.6 22 9.3l-5.4 4.7L18 21l-6-3.6L6 21l1.4-7L2 9.3l7.1-.7Z"/>,
  share:   <I d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>,
  x:       <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  telegram: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.231-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
  discord: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.075.035c-.211.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.075-.035 19.74 19.74 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
  globe:   <I d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>,
  copy:    <I d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2M16 4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2M16 4v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V4"/>,
  rocket:  <I d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>,
  flame:   <I d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>,
  eye:     <I d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>,
  users:   <I d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>,
  edit:    <I d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>,
  plus:    <I d="M12 5v14M5 12h14"/>,
  drag:    <I d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" sw={3}/>,
  trash:   <I d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>,
  link:    <I d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>,
  check:   <I d="M20 6 9 17l-5-5"/>,
  chevR:   <I d="m9 18 6-6-6-6"/>,
  chevD:   <I d="m6 9 6 6 6-6"/>,
  calendar:<I d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18"/>,
  send:    <I d="m22 2-7 20-4-9-9-4Z"/>,
  reply:   <I d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6M3 10l6-6"/>,
  upvote:  <I d="m18 15-6-6-6 6"/>,
  pulse:   <I d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
  shield:  <I d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  bolt:    <I d="m13 2-9 12h7l-1 8 9-12h-7l1-8z"/>,
  search:  <I d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35"/>,
  more:    <I d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" sw={3}/>,
  layers:  <I d="m12 2-10 6 10 6 10-6-10-6zM2 17l10 6 10-6M2 12l10 6 10-6"/>,
  chart:   <I d="M3 3v18h18M7 14l4-4 4 4 5-5"/>,
  lock:    <I d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4"/>,
  wallet:  <I d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M16 12h6M16 12a2 2 0 0 0 0 4h6"/>,
  target:  <I d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>,
  crown:   <I d="m2 19 3-12 5 4 2-7 2 7 5-4 3 12z"/>,
  thumb:   <I d="M7 11v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3zm0 0 4-9a3 3 0 0 1 3 3v3h6a2 2 0 0 1 2 2.32l-1.5 7A2 2 0 0 1 18.5 19H7"/>,
  fire:    <I d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>,
  message: <I d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
};

// ───────────────── PILL ─────────────────
const Pill = ({ children, tone = 'default', icon }) => {
  const cls = {
    default: 'mw-pill',
    amber: 'mw-pill mw-pill-amber',
    danger: 'mw-pill mw-pill-danger',
    success: 'mw-pill mw-pill-success',
    mute: 'mw-pill mw-pill-mute',
  }[tone];
  return <span className={cls}>{icon}{children}</span>;
};

// ───────────────── DRAFT BANNER (the universal "this is a preview" signal) ─────────────────
const DraftStatus = ({ deployTarget }) => (
  <div className="mw-pill mw-pill-amber" style={{ height: 28, padding: '0 12px', gap: 8 }}>
    <span className="mw-led" style={{ width: 6, height: 6 }}/>
    <span>RECON · DRAFT PREVIEW</span>
    {deployTarget && <span style={{ opacity: 0.6 }}>· DEPLOYS {deployTarget}</span>}
  </div>
);

// ───────────────── COIN AVATAR ─────────────────
const CoinAvatar = ({ size = 96, ticker = 'PEPEX', accent = '#3aa856', bg = '#1d3a26' }) => (
  <div style={{
    width: size, height: size, borderRadius: 999,
    background: `radial-gradient(circle at 30% 30%, ${accent} 0%, ${bg} 80%)`,
    border: '2px solid rgba(255,255,255,0.08)',
    display: 'grid', placeItems: 'center',
    fontFamily: 'Bebas Neue', fontSize: size * 0.32,
    color: '#fff', letterSpacing: '0.04em',
    boxShadow: `0 8px 32px ${accent}40, inset 0 -8px 16px rgba(0,0,0,0.4), inset 0 2px 8px rgba(255,255,255,0.15)`,
    flexShrink: 0,
  }}>
    {ticker.replace('$', '').slice(0, 4)}
  </div>
);

// ───────────────── EXPORT ─────────────────
Object.assign(window, { MWLogo, Icons, Pill, DraftStatus, CoinAvatar, I });
