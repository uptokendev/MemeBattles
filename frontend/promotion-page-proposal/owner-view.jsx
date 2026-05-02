// Creator Owner View
// Same draft, but rendered for the coin's owner: section reorder/edit/add,
// inline edit hints, side panel with draft analytics + deploy controls.
// Visually a fork of Variation A so it's recognizable as "the same page,
// editing mode."

const OwnerView = () => {
  return (
    <div className="mw-root mw-grid-bg" style={{ minHeight: '100%', position: 'relative', display: 'grid', gridTemplateColumns: '1fr 360px' }}>
      <div className="mw-noise"/>

      {/* MAIN COLUMN — the page being edited */}
      <div style={{ position: 'relative', overflow: 'auto', borderRight: '1px solid var(--mw-line)' }}>
        {/* Edit-mode top bar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          height: 56, padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--mw-line-2)',
          background: 'linear-gradient(90deg, rgba(255,155,28,0.10), rgba(10,8,6,0.95))',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="mw-btn mw-btn-ghost" style={{ height: 32, padding: '0 10px', fontSize: 12 }}>← Exit edit</button>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// EDIT MODE</span>
              <span style={{ fontSize: 13, color: 'var(--mw-text-2)' }}>$BUNNY · Draft #4471</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mw-mono" style={{ color: 'var(--mw-text-3)' }}>Auto-saved 12s ago</span>
            <button className="mw-btn mw-btn-ghost" style={{ height: 32, padding: '0 12px', fontSize: 12 }}>{Icons.eye}Preview public</button>
            <button className="mw-btn" style={{ height: 32, padding: '0 12px', fontSize: 12 }}>{Icons.share}Copy link</button>
          </div>
        </header>

        <div style={{ padding: '24px 32px 60px' }}>
          {/* HERO BLOCK — editable */}
          <EditableSection sectionId="01" title="Identity" template="hero">
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 20 }}>
              <div style={{ position: 'relative' }}>
                <CoinAvatar size={88} ticker="$BUNNY" accent="#ff7a4a" bg="#3a1a14"/>
                <button className="mw-btn mw-btn-ghost" style={{
                  position: 'absolute', bottom: -6, right: -6, height: 28, padding: '0 8px', fontSize: 11,
                }}>{Icons.edit}</button>
              </div>
              <div style={{ flex: 1 }}>
                <EditField mono>$BUNNY</EditField>
                <EditField stencil large>BARRACK BUNNY</EditField>
                <EditField sub>The fluffiest grunt in the warzone.</EditField>
              </div>
            </div>
          </EditableSection>

          {/* TOKENOMICS */}
          <EditableSection sectionId="02" title="Tokenomics" template="standard split">
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div className="mw-mono" style={{ marginBottom: 8 }}>SUPPLY</div>
                <EditField mono large numeric>1,000,000,000</EditField>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['Liquidity pool', 80, 'var(--mw-amber)'], ['Community rewards', 12, 'var(--mw-amber-2)'], ['Creator (vested)', 5, '#ff7a4a'], ['Marketing', 3, '#ffcc4a']].map(([l, p, c]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <input type="text" defaultValue={l} className="mw-input" style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}/>
                      <input type="text" defaultValue={p + '%'} className="mw-input" style={{ width: 56, height: 30, fontSize: 12, padding: '0 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', color: c }}/>
                      <button style={{ background: 'transparent', border: 'none', color: 'var(--mw-text-4)', cursor: 'pointer', display: 'flex' }}>{Icons.trash}</button>
                    </div>
                  ))}
                  <button className="mw-btn mw-btn-ghost" style={{ height: 30, fontSize: 11, justifyContent: 'center' }}>{Icons.plus}Add row</button>
                </div>
              </div>
              <div>
                <div className="mw-mono" style={{ marginBottom: 8 }}>RULES</div>
                {[['Buy tax', '0%'], ['Sell tax', '0%'], ['LP lock', '12 months'], ['Mint disabled', 'Yes']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="text" defaultValue={k} className="mw-input" style={{ flex: 1, height: 32, fontSize: 12 }}/>
                    <input type="text" defaultValue={v} className="mw-input" style={{ width: 110, height: 32, fontSize: 12, fontFamily: 'JetBrains Mono' }}/>
                  </div>
                ))}
              </div>
            </div>
          </EditableSection>

          {/* ROADMAP */}
          <EditableSection sectionId="03" title="Mission Phases" template="roadmap">
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {['Recon', 'Deploy', 'Graduate', 'Conquest'].map((t, i) => (
                <div key={t} style={{
                  padding: 14, border: '1px dashed var(--mw-line-2)', borderRadius: 8,
                  background: 'rgba(0,0,0,0.25)',
                }}>
                  <div className="mw-mono" style={{ fontSize: 9 }}>PHASE 0{i+1}</div>
                  <input type="text" defaultValue={t} className="mw-input" style={{ height: 30, fontSize: 13, fontWeight: 600, marginTop: 6, padding: '0 8px' }}/>
                  <textarea className="mw-input" rows={3} style={{ marginTop: 6, fontSize: 11, resize: 'none' }} defaultValue="Add description..."/>
                </div>
              ))}
            </div>
          </EditableSection>

          {/* ADD SECTION */}
          <div style={{ marginTop: 16 }}>
            <button className="mw-btn mw-btn-ghost" style={{
              width: '100%', height: 48, justifyContent: 'center',
              borderStyle: 'dashed', borderColor: 'var(--mw-line-2)',
              fontSize: 13,
            }}>
              {Icons.plus}Add section from template
            </button>

            <div style={{
              marginTop: 12, padding: 14,
              background: 'rgba(255,155,28,0.04)',
              border: '1px solid var(--mw-line)', borderRadius: 10,
            }}>
              <div className="mw-mono" style={{ marginBottom: 10, color: 'var(--mw-amber)' }}>// AVAILABLE TEMPLATES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  ['Lore / Story', Icons.shield],
                  ['Team', Icons.users],
                  ['Meme gallery', Icons.fire],
                  ['FAQ', Icons.message],
                  ['Fair-launch terms', Icons.lock],
                  ['Allocations', Icons.chart],
                  ['Audit & locks', Icons.check],
                  ['Custom block', Icons.edit],
                ].map(([l, ic]) => (
                  <button key={l} className="mw-btn mw-btn-ghost" style={{
                    height: 64, flexDirection: 'column', gap: 6, fontSize: 11,
                    padding: 8, alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: 'var(--mw-amber)' }}>{ic}</span>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — CREATOR CONTROL PANEL */}
      <aside style={{
        position: 'sticky', top: 0, height: '100vh', overflow: 'auto',
        background: 'var(--mw-bg-2)',
        padding: '20px 20px 40px',
      }}>
        {/* Status header */}
        <div style={{ marginBottom: 20 }}>
          <div className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// COMMAND CENTER</div>
          <h3 className="mw-stencil" style={{ fontSize: 22, margin: '4px 0 0' }}>Draft control</h3>
        </div>

        {/* Deploy card */}
        <div className="mw-card mw-brackets" style={{
          padding: 18, marginBottom: 16,
          background: 'radial-gradient(circle at 30% 0%, rgba(255,155,28,0.18), var(--mw-bg-3))',
        }}>
          <div className="mw-mono" style={{ marginBottom: 6 }}>READINESS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: 'var(--mw-amber)', lineHeight: 1 }}>87</span>
            <span className="mw-mono" style={{ color: 'var(--mw-text-3)' }}>/ 100</span>
          </div>
          <div style={{ height: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: '87%', height: '100%', background: 'linear-gradient(90deg, var(--mw-amber-3), var(--mw-amber-2))' }}/>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--mw-text-3)', lineHeight: 1.5 }}>
            Add at least one comms channel to reach <span style={{ color: 'var(--mw-amber-2)' }}>100</span>.
          </div>
          <button className="mw-btn mw-btn-primary" style={{ width: '100%', marginTop: 14, height: 44, justifyContent: 'center' }}>
            {Icons.rocket}Deploy on May 14
          </button>
          <button className="mw-btn mw-btn-ghost" style={{ width: '100%', marginTop: 8, height: 32, fontSize: 12, justifyContent: 'center' }}>
            Schedule different time
          </button>
        </div>

        {/* Draft stats */}
        <div className="mw-card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="mw-mono" style={{ marginBottom: 12 }}>// DRAFT TRAFFIC · 7D</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              ['Views', '6,294', '+182%'],
              ['Notify-armed', '1,843', '+91%'],
              ['Watchlists', '412', '+44%'],
              ['Shares', '93', '+12%'],
            ].map(([l, v, d]) => (
              <div key={l}>
                <div className="mw-mono" style={{ fontSize: 9 }}>{l}</div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, lineHeight: 1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--mw-success)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>{d}</div>
              </div>
            ))}
          </div>

          {/* Mini sparkline */}
          <svg viewBox="0 0 240 50" style={{ width: '100%', height: 50, marginTop: 14 }}>
            <defs>
              <linearGradient id="sp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff9b1c" stopOpacity="0.4"/>
                <stop offset="1" stopColor="#ff9b1c" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0 40 L20 38 L40 36 L60 30 L80 32 L100 25 L120 20 L140 16 L160 12 L180 14 L200 8 L220 5 L240 2 L240 50 L0 50 Z" fill="url(#sp)"/>
            <path d="M0 40 L20 38 L40 36 L60 30 L80 32 L100 25 L120 20 L140 16 L160 12 L180 14 L200 8 L220 5 L240 2" fill="none" stroke="#ff9b1c" strokeWidth="1.5"/>
          </svg>
        </div>

        {/* Section list / reorder */}
        <div className="mw-card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="mw-mono" style={{ marginBottom: 10 }}>// SECTIONS · DRAG TO REORDER</div>
          {[
            ['Identity', 'hero', true],
            ['Tokenomics', 'standard split', true],
            ['Mission Phases', 'roadmap', true],
            ['The Bunker', 'comments', false],
          ].map(([n, t, on]) => (
            <div key={n} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 6px', borderRadius: 6,
              background: on ? 'transparent' : 'rgba(0,0,0,0.25)',
            }}>
              <span style={{ color: 'var(--mw-text-4)', cursor: 'grab', display: 'flex' }}>{Icons.drag}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: on ? 'var(--mw-text)' : 'var(--mw-text-3)' }}>{n}</div>
                <div className="mw-mono" style={{ fontSize: 9 }}>{t}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 16, borderRadius: 999,
                  background: on ? 'var(--mw-amber)' : 'rgba(255,255,255,0.08)',
                  position: 'relative', cursor: 'pointer',
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: on ? 14 : 2,
                    width: 12, height: 12, borderRadius: 999,
                    background: '#fff', transition: 'left 120ms',
                  }}/>
                </div>
              </label>
            </div>
          ))}
        </div>

        {/* Visibility */}
        <div className="mw-card" style={{ padding: 16 }}>
          <div className="mw-mono" style={{ marginBottom: 10 }}>// SHARE LINK</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.4)', borderRadius: 8,
            border: '1px solid var(--mw-line)',
            fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mw-text-2)',
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>memewar.zone/d/bunny-x4471</span>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--mw-amber)', cursor: 'pointer', display: 'flex' }}>{Icons.copy}</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="mw-btn mw-btn-ghost" style={{ flex: 1, height: 32, fontSize: 11, justifyContent: 'center' }}>{Icons.x}X</button>
            <button className="mw-btn mw-btn-ghost" style={{ flex: 1, height: 32, fontSize: 11, justifyContent: 'center' }}>{Icons.telegram}TG</button>
            <button className="mw-btn mw-btn-ghost" style={{ flex: 1, height: 32, fontSize: 11, justifyContent: 'center' }}>{Icons.discord}DC</button>
          </div>
        </div>
      </aside>
    </div>
  );
};

// Helper components for editable fields & section frames
const EditField = ({ children, mono, stencil, large, sub, numeric }) => {
  const style = {
    width: '100%',
    background: 'transparent',
    border: '1px dashed transparent',
    borderRadius: 6,
    padding: '4px 8px',
    margin: '-4px -8px',
    color: 'var(--mw-text)',
    transition: 'background 120ms, border-color 120ms',
  };
  if (mono) Object.assign(style, { fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mw-amber-2)' });
  if (stencil) Object.assign(style, { fontFamily: 'Bebas Neue', fontSize: 36, lineHeight: 1, letterSpacing: '0.02em', color: 'var(--mw-text)' });
  if (large) Object.assign(style, { fontSize: 36, marginBottom: 4 });
  if (sub) Object.assign(style, { fontSize: 14, color: 'var(--mw-text-2)' });
  if (numeric) Object.assign(style, { fontFamily: 'Bebas Neue', fontSize: 36, color: 'var(--mw-text)', textTransform: 'none', letterSpacing: 'normal' });
  return (
    <input
      type="text"
      defaultValue={children}
      style={style}
      onFocus={(e) => { e.target.style.borderColor = 'var(--mw-amber)'; e.target.style.background = 'rgba(255,155,28,0.08)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}
      onMouseEnter={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = 'var(--mw-line-2)'; }}
      onMouseLeave={(e) => { if (document.activeElement !== e.target) e.target.style.borderColor = 'transparent'; }}
    />
  );
};

const EditableSection = ({ sectionId, title, template, children }) => (
  <div className="mw-card" style={{ marginBottom: 14, position: 'relative' }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderBottom: '1px solid var(--mw-line)',
      background: 'rgba(0,0,0,0.25)',
    }}>
      <span style={{ color: 'var(--mw-text-4)', cursor: 'grab', display: 'flex' }}>{Icons.drag}</span>
      <span className="mw-mono" style={{ color: 'var(--mw-amber)' }}>SEC {sectionId}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mw-text)' }}>{title}</span>
      <span className="mw-mono">/ template: {template}</span>
      <div style={{ flex: 1 }}/>
      <button className="mw-btn mw-btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>{Icons.eye}Hide</button>
      <button className="mw-btn mw-btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 11 }}>{Icons.trash}</button>
    </div>
    {children}
  </div>
);

window.OwnerView = OwnerView;
