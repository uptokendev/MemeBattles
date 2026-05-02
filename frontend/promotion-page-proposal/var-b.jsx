// Variation B — "WAR ROOM CINEMATIC" (bolder)
// Public draft preview, more theatrical: full-bleed cinematic hero with massive
// stenciled coin name, satellite strike-card layout, animated radar/HUD elements.
// Same content surface as A so the comparison is purely visual/tonal.

// Animated recon radar — rotating sweep, pulsing blips when sweep crosses them,
// and a percentage that wobbles around 94%.
const ReconRadar = () => {
  const ref = React.useRef(null);
  const [pct, setPct] = React.useState(94.0);
  React.useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const SIZE = 200;
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    canvas.style.width = '100%'; canvas.style.maxWidth = SIZE + 'px';
    canvas.style.height = 'auto'; canvas.style.aspectRatio = '1 / 1';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Blips: angle (rad), radius (0..1), baseSize, last-hit timestamp
    const blips = [
      { a: -0.45, r: 0.55, s: 2.4 },
      { a: 2.30, r: 0.62, s: 2.0 },
      { a: 1.40, r: 0.55, s: 1.7 },
      { a: -1.20, r: 0.48, s: 1.7 },
      { a: 0.45, r: 0.70, s: 2.0 },
      { a: 2.95, r: 0.40, s: 1.5 },
    ].map(b => ({ ...b, hit: -9999 }));

    const cx = SIZE / 2, cy = SIZE / 2, R = 90;
    const start = performance.now();
    let raf;

    const angDist = (a, b) => {
      let d = a - b;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };

    const draw = (t) => {
      const dt = (t - start) / 1000;
      const sweepAng = -Math.PI / 2 + (dt * Math.PI * 2) / 4; // 4s per rev, start at top
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Background radial glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(255,155,28,0.30)');
      g.addColorStop(1, 'rgba(255,155,28,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // Range rings
      ctx.strokeStyle = 'rgba(255,155,28,0.4)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([2, 3]);
      [30, 60, 90].forEach(r => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
      ctx.setLineDash([]);

      // Crosshair
      ctx.strokeStyle = 'rgba(255,155,28,0.3)';
      ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(cx, 10); ctx.lineTo(cx, SIZE - 10);
      ctx.moveTo(10, cy); ctx.lineTo(SIZE - 10, cy); ctx.stroke();

      // Sweep cone (gradient wedge trailing the sweep)
      const TRAIL = Math.PI / 2.2;
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const a0 = sweepAng - (TRAIL * (i + 1)) / steps;
        const a1 = sweepAng - (TRAIL * i) / steps;
        const alpha = 0.28 * (1 - i / steps);
        ctx.fillStyle = `rgba(255,180,60,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        ctx.fill();
      }

      // Sweep line
      ctx.strokeStyle = 'rgba(255,200,90,0.95)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAng) * R, cy + Math.sin(sweepAng) * R);
      ctx.stroke();

      // Blips — pulse when sweep crosses, decay over time
      blips.forEach(b => {
        const bAng = b.a;
        const d = angDist(sweepAng, bAng);
        // Detect crossing: previous frame's sweep was just before this blip
        if (d >= 0 && d < 0.06) {
          if (t - b.hit > 800) b.hit = t;
        }
        const age = (t - b.hit) / 1000; // seconds since last hit
        const pulse = age >= 0 && age < 1.6
          ? Math.exp(-age * 1.8) * (1 + Math.sin(age * 12) * 0.05)
          : 0;
        const grow = 1 + pulse * 1.8;
        const bx = cx + Math.cos(bAng) * R * b.r;
        const by = cy + Math.sin(bAng) * R * b.r;
        // Glow halo
        ctx.fillStyle = `rgba(255,200,90,${0.18 + pulse * 0.5})`;
        ctx.beginPath(); ctx.arc(bx, by, b.s * grow * 2.2, 0, Math.PI * 2); ctx.fill();
        // Core
        ctx.fillStyle = `rgba(255,212,90,${0.85 + pulse * 0.15})`;
        ctx.beginPath(); ctx.arc(bx, by, b.s * grow, 0, Math.PI * 2); ctx.fill();
      });

      // Outer ring
      ctx.strokeStyle = 'rgba(255,155,28,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // Wobble the percentage around 94%
    let p = 94;
    const tick = setInterval(() => {
      p += (Math.random() - 0.5) * 0.6;
      p = Math.max(92.4, Math.min(95.6, p));
      setPct(p);
    }, 280);

    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, []);
  return (
    <>
      <canvas ref={ref} style={{ marginTop: 12, display: 'block', marginInline: 'auto' }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11 }}>
        <span style={{ color: 'var(--mw-text-3)' }}>SIGNAL</span>
        <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--mw-amber)' }}>{pct.toFixed(1)}% · RISING</span>
      </div>
    </>
  );
};

// Fire sparks — animated canvas particles drifting upward with flicker.
const FireSparks = () => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf, w, h, dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    const N = 90;
    const sparks = Array.from({ length: N }, () => spawn(true));
    function spawn(initial) {
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.25,
        vy: 0.15 + Math.random() * 0.45,
        size: 0.7 + Math.random() * 2.2,
        life: 0,
        maxLife: 400 + Math.random() * 700,
        flicker: Math.random() * Math.PI * 2,
        hue: 18 + Math.random() * 28, // amber-orange-red
      };
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < sparks.length; i++) {
        const s = sparks[i];
        s.x += s.vx + Math.sin((s.life + s.flicker) * 0.03) * 0.12;
        s.y += s.vy;
        s.vy *= 1.0008;
        s.life++;
        if (s.life > s.maxLife || s.y > h + 10) { sparks[i] = spawn(false); continue; }
        const t = s.life / s.maxLife;
        const alpha = (1 - t) * (0.5 + 0.5 * Math.sin(s.life * 0.2 + s.flicker));
        const r = s.size * (1 + Math.sin(s.life * 0.3) * 0.3);
        // Glow
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
        grad.addColorStop(0, `hsla(${s.hue}, 100%, 70%, ${alpha})`);
        grad.addColorStop(0.4, `hsla(${s.hue}, 100%, 55%, ${alpha * 0.4})`);
        grad.addColorStop(1, `hsla(${s.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 4, 0, Math.PI * 2); ctx.fill();
        // Core
        ctx.fillStyle = `hsla(${s.hue + 10}, 100%, 85%, ${alpha})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}/>;
};

const VarB = () => {
  const coin = {
    name: 'MEMEWARZONE',
    ticker: '$MWZ',
    tagline: 'The launchpad that turns every drop into a war.',
    chain: 'Solana',
    accent: '#ff7a4a',
    bgAccent: '#3a1a14',
    notify: 1843,
  };

  return (
    <div className="mw-root" style={{ minHeight: '100%', position: 'relative', background: '#06040a' }}>
      {/* CINEMATIC HERO BACKDROP */}
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,90,30,0.35), transparent 60%),' +
          'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(120,40,20,0.4), transparent 70%),' +
          'linear-gradient(180deg, #1a0a06 0%, #0a0604 100%)',
      }}/>
      <div className="mw-embers"/>
      <div className="mw-noise"/>

      {/* TOP BAR */}
      <header style={{
        position: 'relative', zIndex: 10,
        height: 56, padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--mw-line)',
      }}>
        <MWLogo size={28}/>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DraftStatus deployTarget="MAY 14"/>
          <button className="mw-btn mw-btn-ghost">Sign in</button>
          <button className="mw-btn mw-btn-primary">Launch a coin</button>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 5 }}>
        {/* CINEMATIC HERO */}
        <section style={{
          minHeight: 720,
          padding: '60px 32px 80px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center', position: 'relative',
        }}>
          {/* HUD frame */}
          <div style={{ position: 'absolute', top: 24, left: 32, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// COORD: 47.6° N · 11.2° E</div>
            <div className="mw-mono">SECTOR: 04-RECON</div>
          </div>
          <div style={{ position: 'absolute', top: 24, right: 32, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="mw-led mw-led-live"/>
            <span className="mw-mono" style={{ color: '#ff8a8a' }}>UNARMED · DRAFT MODE</span>
          </div>

          {/* INCOMING pill */}
          <div className="mw-pill mw-pill-mute" style={{ marginTop: 64, marginBottom: 28 }}>
            <span className="mw-led" style={{ width: 6, height: 6 }}/>
            INCOMING TRANSMISSION · {coin.chain.toUpperCase()}
          </div>

          {/* MASSIVE STENCIL TICKER */}
          <div className="mw-stencil" style={{
            fontSize: 24, color: 'var(--mw-amber)', letterSpacing: '0.5em',
            marginBottom: 4, fontFamily: 'JetBrains Mono', fontWeight: 700,
          }}>
            {coin.ticker}
          </div>

          <h1 className="mw-stencil" style={{
            fontSize: 144, lineHeight: 0.85, margin: 0,
            letterSpacing: '0.02em', fontWeight: 400,
            background: 'linear-gradient(180deg, #fff 0%, #ffb748 60%, #ff5722 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 60px rgba(255,122,30,0.4))',
            maxWidth: 900,
          }}>
            {coin.name}
          </h1>

          {/* COUNTDOWN — prominent, near title */}
          <div style={{
            marginTop: 28, marginBottom: 8,
            display: 'inline-flex', alignItems: 'center', gap: 14,
            padding: '14px 22px',
            background: 'linear-gradient(180deg, rgba(255,155,28,0.14), rgba(0,0,0,0.5))',
            border: '1px solid rgba(255,155,28,0.45)',
            borderRadius: 12,
            boxShadow: '0 0 40px rgba(255,122,30,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
            position: 'relative', zIndex: 6,
          }}>
            <span className="mw-mono" style={{ color: 'var(--mw-amber)', fontSize: 11 }}>// DEPLOY IN</span>
            {[['11', 'D'], ['08', 'H'], ['42', 'M'], ['17', 'S']].map(([n, l], i, arr) => (
              <React.Fragment key={l}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 44, lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 20px rgba(255,155,28,0.7)' }}>{n}</span>
                  <span className="mw-mono" style={{ fontSize: 12, color: 'var(--mw-amber-2)' }}>{l}</span>
                </div>
                {i < arr.length - 1 && <span style={{ color: 'var(--mw-text-4)', fontSize: 24, lineHeight: 1 }}>:</span>}
              </React.Fragment>
            ))}
          </div>

          <p style={{
            fontSize: 22, color: 'var(--mw-text-2)', maxWidth: 640,
            margin: '24px 0 36px', lineHeight: 1.45,
          }}>
            {coin.tagline} <span style={{ color: 'var(--mw-text-3)' }}>1B supply, no team alloc, LP locks on deploy.</span>
          </p>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="mw-btn mw-btn-primary" style={{ height: 52, padding: '0 24px', fontSize: 14 }}>
              {Icons.bell}Arm notification
            </button>
            <button className="mw-btn" style={{ height: 52, padding: '0 24px' }}>{Icons.star}Watchlist</button>
            <button className="mw-btn mw-btn-ghost" style={{ height: 52, padding: '0 24px' }}>{Icons.share}Share dossier</button>
          </div>

          {/* Tactical strip */}
          <div style={{
            display: 'flex', gap: 0, marginTop: 56,
            border: '1px solid var(--mw-line-2)', borderRadius: 12,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
            overflow: 'hidden',
          }}>
            {[
              ['ARMED RECRUITS', '1,843', Icons.users],
              ['WATCHLISTS', '412', Icons.star],
              ['HEAT', '94%', Icons.flame],
              ['BUILT BY', '@MemeWarzone', Icons.shield],
            ].map(([l, v, ic], i) => (
              <div key={l} style={{
                padding: '14px 24px',
                borderLeft: i > 0 ? '1px solid var(--mw-line)' : 'none',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ color: 'var(--mw-amber)' }}>{ic}</span>
                <div style={{ textAlign: 'left' }}>
                  <div className="mw-mono" style={{ fontSize: 9 }}>{l}</div>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, lineHeight: 1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DOSSIER GRID — 3 strike cards */}
        <section style={{ padding: '40px 32px 60px', maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
            <div className="mw-rule"/>
            <h2 className="mw-stencil" style={{ fontSize: 32, margin: 0 }}>The Dossier</h2>
            <span className="mw-mono">// CREATOR-CURATED SECTIONS</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 16 }}>
            {/* LORE — wide card */}
            <div className="mw-card mw-brackets" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
              <CoinAvatar size={72} ticker={coin.ticker} accent={coin.accent} bg={coin.bgAccent}/>
              <div className="mw-mono" style={{ color: 'var(--mw-amber)', marginTop: 18 }}>// LORE</div>
              <h3 className="mw-stencil" style={{ fontSize: 22, margin: '6px 0 10px' }}>The brief</h3>
              <p style={{ fontSize: 14, color: 'var(--mw-text-2)', margin: 0, lineHeight: 1.65 }}>
                MemeWarzone is the creator-first meme launchpad — every launch becomes a competition, UpVotes drive discovery, and on-chain leagues turn drops into repeatable events.
                <br/><br/>
                $MWZ is the platform's own coin. Holders fuel the warzone, vote on featured launches, and earn a slice of every league's prize pool.
              </p>
            </div>

            {/* COMMS / SOCIALS */}
            <div className="mw-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// COMMS CHANNELS</div>
              <h3 className="mw-stencil" style={{ fontSize: 22, margin: '6px 0 14px' }}>Tune in</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {[
                  ['X / Twitter', '@memewarzone', '12.4K followers', Icons.x],
                  ['Telegram', 't.me/memewarzone', '3,210 members', Icons.telegram],
                  ['Discord', 'discord.gg/mwz', '847 online', Icons.discord],
                  ['Website', 'memewar.zone', 'Lore + memes', Icons.globe],
                ].map(([platform, handle, meta, ic]) => (
                  <a key={platform} className="mw-btn mw-btn-ghost" style={{
                    height: 'auto', padding: '10px 12px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    justifyContent: 'flex-start', textAlign: 'left',
                  }}>
                    <span style={{ color: 'var(--mw-amber)', display: 'flex', flexShrink: 0 }}>{ic}</span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mw-text)' }}>{handle}</span>
                      <span className="mw-mono" style={{ fontSize: 9, color: 'var(--mw-text-3)' }}>{meta}</span>
                    </div>
                    <span style={{ color: 'var(--mw-text-4)', display: 'flex', flexShrink: 0 }}>{Icons.chevR}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* RADAR / HEAT */}
            <div className="mw-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
              <div className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// RECON HEAT</div>
              <ReconRadar/>
            </div>
          </div>
        </section>

        {/* MISSION PHASES — horizontal */}
        <section style={{ padding: '40px 32px 60px', maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
            <div className="mw-rule"/>
            <h2 className="mw-stencil" style={{ fontSize: 32, margin: 0 }}>Mission Phases</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              ['Recon', 'Recruits, hype, visuals.', true, Icons.eye],
              ['Deploy', 'Bonding curve. LP locks.', false, Icons.rocket],
              ['Graduate', 'Migrate to DEX, leagues open.', false, Icons.crown],
              ['Conquest', 'Weekly meme leagues, holder rewards.', false, Icons.flame],
            ].map(([t, d, active, ic], i) => (
              <div key={t} className="mw-card" style={{
                padding: 20, position: 'relative',
                borderColor: active ? 'var(--mw-amber)' : 'var(--mw-line)',
                background: active
                  ? 'linear-gradient(180deg, rgba(255,155,28,0.10), var(--mw-bg-2))'
                  : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mw-mono" style={{ color: active ? 'var(--mw-amber)' : 'var(--mw-text-4)' }}>PHASE 0{i+1}</span>
                  <span style={{ color: active ? 'var(--mw-amber)' : 'var(--mw-text-4)' }}>{ic}</span>
                </div>
                <div className="mw-stencil" style={{ fontSize: 24, marginTop: 12 }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--mw-text-3)', marginTop: 6, lineHeight: 1.5 }}>{d}</div>
                {active && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--mw-amber)' }}>
                    <span className="mw-led" style={{ width: 6, height: 6 }}/> ACTIVE
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* TRANSMISSIONS */}
        <section style={{ padding: '40px 32px 60px', maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 24 }}>
            <div className="mw-rule"/>
            <h2 className="mw-stencil" style={{ fontSize: 32, margin: 0 }}>Transmissions</h2>
            <span className="mw-mono">// 127 INTERCEPTED</span>
            <div style={{ flex: 1 }}/>
            <button className="mw-btn mw-btn-primary" style={{ height: 38 }}>{Icons.send}Send transmission</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { handle: '@whalepaw', t: '2h', body: "early bag, easy alpha. squad assembled.", reaction: '🔥', color: '#5a8a3a' },
              { handle: '@xenon_sol', t: '5h', body: "art is unhinged. the lore section sold me.", reaction: '💎', color: '#3a5a8a' },
              { handle: '@grunt_404', t: '1d', body: "LP lock + zero tax = notify-on-launch armed. send.", reaction: '🚀', color: '#8a5a3a' },
              { handle: '@meme_recon', t: '2d', body: "this is the one. mark my words. bunker is filling fast.", reaction: '🐰', color: '#8a3a5a' },
            ].map((c, i) => (
              <div key={i} className="mw-card" style={{ padding: 18, display: 'flex', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                  background: `linear-gradient(135deg, ${c.color}, #1a1006)`,
                  border: '1px solid var(--mw-line-2)',
                }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.handle}</span>
                    <span className="mw-mono" style={{ fontSize: 10 }}>{c.t}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mw-text-2)', marginTop: 4, lineHeight: 1.45 }}>{c.body}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, color: 'var(--mw-text-3)' }}>
                    <span>{c.reaction} 14</span>
                    <span style={{ cursor: 'pointer' }}>↑ 12</span>
                    <span style={{ cursor: 'pointer' }}>Reply</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FINAL DEPLOY CTA */}
        <section style={{ padding: '40px 32px 80px', maxWidth: 1240, margin: '0 auto' }}>
          <div className="mw-card mw-card-elevated mw-brackets" style={{
            padding: 48, textAlign: 'center', position: 'relative', overflow: 'hidden',
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,90,30,0.20), var(--mw-bg-2) 70%)',
          }}>
            <div className="mw-tape" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6 }}/>
            <div className="mw-tape" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6 }}/>

            <div className="mw-mono" style={{ color: 'var(--mw-amber)', marginBottom: 12 }}>// T-MINUS 11 DAYS</div>
            <h3 className="mw-stencil" style={{
              fontSize: 64, margin: 0,
              background: 'linear-gradient(180deg, #fff, #ff7a4a)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>BE FIRST IN.</h3>
            <p style={{ color: 'var(--mw-text-2)', fontSize: 16, margin: '12px auto 28px', maxWidth: 520 }}>
              {coin.notify.toLocaleString()} recruits already armed. The moment $MWZ hits the bonding curve, your alert fires.
            </p>
            <div style={{ display: 'flex', gap: 8, maxWidth: 520, margin: '0 auto' }}>
              <input className="mw-input" placeholder="you@warzone.com or wallet" style={{ flex: 1, height: 48, fontSize: 14 }}/>
              <button className="mw-btn mw-btn-primary" style={{ height: 48, padding: '0 24px' }}>Arm me</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

window.VarB = VarB;
