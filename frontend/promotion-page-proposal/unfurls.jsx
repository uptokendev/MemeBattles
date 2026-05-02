// Social unfurl cards (OG-image previews)
// Two formats: A — composed dossier card, B — cinematic strike card.
// Plus a mock TG/X chat showing them in context.

const UnfurlA = () => (
  <div style={{
    width: 1200, height: 630, transformOrigin: 'top left',
    background: '#0a0806', color: '#f6efe2', position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'Inter, system-ui',
  }}>
    {/* Topo bg */}
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage:
        'radial-gradient(circle at 20% 30%, rgba(255,155,28,0.10), transparent 40%),' +
        'radial-gradient(circle at 80% 70%, rgba(255,90,30,0.10), transparent 40%),' +
        'linear-gradient(rgba(255,180,100,0.04) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(255,180,100,0.04) 1px, transparent 1px)',
      backgroundSize: 'auto, auto, 40px 40px, 40px 40px',
    }}/>
    <div className="mw-noise"/>

    {/* Tape strip */}
    <div className="mw-tape" style={{ height: 12, flexShrink: 0 }}/>

    <div style={{ position: 'relative', flex: 1, padding: '48px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MWLogo size={36}/>
        <div className="mw-pill mw-pill-amber" style={{ height: 32, padding: '0 14px' }}>
          <span className="mw-led" style={{ width: 7, height: 7 }}/>
          DRAFT · DEPLOYS MAY 14
        </div>
      </div>

      {/* Hero */}
      <div style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
        <CoinAvatar size={180} ticker="$MWZ" accent="#ff7a4a" bg="#3a1a14"/>
        <div style={{ flex: 1 }}>
          <div className="mw-mono" style={{ color: '#ff9b1c', fontSize: 14, marginBottom: 6 }}>// $MWZ · SOLANA</div>
          <h1 className="mw-stencil" style={{
            fontSize: 96, lineHeight: 0.9, margin: 0, letterSpacing: '0.01em',
            background: 'linear-gradient(180deg, #fff 30%, #ffb748 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>MEME<br/>WARZONE</h1>
          <p style={{ fontSize: 22, color: '#c8bfae', marginTop: 16, marginBottom: 0 }}>
            The launchpad that turns every drop into a war.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{
        display: 'flex', borderTop: '1px solid rgba(255,180,100,0.18)', paddingTop: 24,
        justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: 48 }}>
          <div>
            <div className="mw-mono" style={{ fontSize: 11 }}>RECRUITS ARMED</div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#ff9b1c', lineHeight: 1, marginTop: 4 }}>1,843</div>
          </div>
          <div>
            <div className="mw-mono" style={{ fontSize: 11 }}>HEAT</div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: '#ff9b1c', lineHeight: 1, marginTop: 4 }}>94%</div>
          </div>
          <div>
            <div className="mw-mono" style={{ fontSize: 11 }}>BUILT BY</div>
            <div style={{ fontFamily: 'Inter', fontSize: 22, fontWeight: 600, lineHeight: 1, marginTop: 8 }}>@MEMEWARZONE</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mw-mono" style={{ fontSize: 11 }}>ARM NOTIFICATION</div>
          <div style={{ fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#ff9b1c', marginTop: 6 }}>memewar.zone/d/mwz</div>
        </div>
      </div>
    </div>

    <div className="mw-tape" style={{ height: 12, flexShrink: 0 }}/>
  </div>
);

const UnfurlB = () => (
  <div style={{
    width: 1200, height: 630,
    background: '#06040a', color: '#f6efe2', position: 'relative', overflow: 'hidden',
    fontFamily: 'Inter, system-ui',
  }}>
    {/* Cinematic glow */}
    <div style={{
      position: 'absolute', inset: 0,
      background:
        'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(255,90,30,0.45), transparent 60%),' +
        'radial-gradient(ellipse 40% 30% at 50% 0%, rgba(255,155,28,0.30), transparent 60%)',
    }}/>
    <div className="mw-embers"/>

    {/* HUD corners */}
    <div style={{ position: 'absolute', top: 24, left: 32, display: 'flex', gap: 16, fontFamily: 'JetBrains Mono', fontSize: 12, letterSpacing: '0.08em', color: '#ff9b1c' }}>
      <span>// COORD: 47.6°N · 11.2°E</span>
      <span style={{ color: '#8a8170' }}>SECTOR 04-RECON</span>
    </div>
    <div style={{ position: 'absolute', top: 24, right: 32, display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'JetBrains Mono', fontSize: 12, letterSpacing: '0.08em', color: '#ff8a8a' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: '#ff3b3b' }}/>
      DRAFT · UNARMED
    </div>

    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 48px' }}>
      <div className="mw-mono" style={{ fontSize: 14, letterSpacing: '0.4em', color: '#ff9b1c' }}>$MWZ · SOLANA</div>
      <h1 className="mw-stencil" style={{
        fontSize: 168, lineHeight: 0.85, margin: '12px 0 0', letterSpacing: '0.02em', textAlign: 'center',
        background: 'linear-gradient(180deg, #fff 0%, #ffb748 60%, #ff5722 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 0 60px rgba(255,122,30,0.5))',
      }}>MEMEWARZONE</h1>
      <p style={{ fontSize: 24, color: '#c8bfae', marginTop: 22, marginBottom: 0, textAlign: 'center' }}>
        The launchpad that turns every drop into a war. <span style={{ color: '#8a8170' }}>· Deploys May 14</span>
      </p>

      <div style={{ marginTop: 36, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          padding: '10px 22px', height: 48,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'linear-gradient(180deg, #ffb748, #ff7a00)',
          color: '#1a0d00', borderRadius: 10, fontWeight: 700, fontSize: 16,
          boxShadow: '0 12px 32px -8px rgba(255,155,28,0.5)',
        }}>{Icons.bell}Arm me on memewar.zone</div>
      </div>
    </div>

    {/* Bottom tape */}
    <div className="mw-tape" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 12 }}/>
  </div>
);

// In-context: how it looks when shared
const UnfurlInContext = () => (
  <div style={{
    background: '#0e0d0c', padding: 32, height: '100%',
    display: 'flex', gap: 24, alignItems: 'flex-start',
  }}>
    {/* Telegram chat */}
    <div style={{
      flex: 1, background: '#17212b', borderRadius: 12, padding: 16, color: '#fff',
      fontFamily: 'Inter, system-ui',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 36, height: 36, borderRadius: 999, background: '#5288c1', display: 'grid', placeItems: 'center', fontWeight: 700 }}>S</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Solana Alpha · Recruiters</div>
          <div style={{ fontSize: 12, color: '#7d8e98' }}>3,420 members</div>
        </div>
      </div>

      <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: '#cc6633', flexShrink: 0 }}/>
          <div style={{ background: '#2b5278', borderRadius: 12, padding: '8px 12px', maxWidth: 380, fontSize: 13 }}>
            <div style={{ color: '#71b3f0', fontWeight: 600, marginBottom: 2 }}>MemeWarzone</div>
            yo squad, my draft is live. roast me before I deploy 🐰
          </div>
        </div>

        <div style={{ paddingLeft: 38, marginTop: 4 }}>
          <div style={{
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden',
            maxWidth: 460, background: '#22303c',
          }}>
            <div style={{ position: 'relative', paddingTop: '52.5%' }}>
              <div style={{ position: 'absolute', inset: 0, transform: 'scale(0.383)', transformOrigin: 'top left' }}>
                <UnfurlA/>
              </div>
            </div>
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#a8b6c2', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>$MWZ · MemeWarzone — drops May 14</div>
              <div style={{ marginTop: 2 }}>memewar.zone</div>
            </div>
          </div>
          <div style={{ fontSize: 13, marginTop: 10, color: '#fff' }}>memewar.zone/d/mwz-x4471</div>
        </div>
      </div>
    </div>

    {/* X post */}
    <div style={{
      width: 380, background: '#000', borderRadius: 16, padding: 16,
      border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Inter, system-ui',
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 999, background: '#cc6633', flexShrink: 0 }}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'baseline', fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>MemeWarzone</span>
            <span style={{ color: '#71767b' }}>@MEMEWARZONE · 2h</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.4 }}>
            t-minus 11 days. recruits assemble. 🐰💥
          </div>
          <div style={{
            marginTop: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{ position: 'relative', paddingTop: '52.5%' }}>
              <div style={{ position: 'absolute', inset: 0, transform: 'scale(0.31)', transformOrigin: 'top left' }}>
                <UnfurlB/>
              </div>
            </div>
            <div style={{ padding: '10px 14px', fontSize: 13 }}>
              <div style={{ color: '#71767b', fontSize: 12 }}>memewar.zone</div>
              <div style={{ color: '#fff', marginTop: 2 }}>$MWZ — MemeWarzone is coming</div>
              <div style={{ color: '#71767b', fontSize: 13, marginTop: 2 }}>The launchpad that turns every drop into a war. Deploys May 14.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 32, marginTop: 12, color: '#71767b', fontSize: 13 }}>
            <span>💬 24</span>
            <span>↻ 91</span>
            <span>♥ 412</span>
            <span>📊 8.4k</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

window.UnfurlA = UnfurlA;
window.UnfurlB = UnfurlB;
window.UnfurlInContext = UnfurlInContext;
