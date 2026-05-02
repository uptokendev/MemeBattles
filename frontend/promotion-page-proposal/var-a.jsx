// Variation A — "RECON DOSSIER" (safer)
// Public draft preview of a memecoin's promotion page.
// Layout: clean tactical dossier — single column hero + sidebar of stats/socials,
// then sections the creator chose. Uses warzone language ("recon", "deploy",
// "recruit") but stays composed and readable.

const VarA = () => {
  const coin = {
    name: 'BARRACK BUNNY',
    ticker: '$BUNNY',
    tagline: 'The fluffiest grunt in the warzone.',
    chain: 'Solana',
    creator: { handle: '@MEMEWARZONE', avatar: '#5a3a2a', joined: 'Mar 2026', launched: 4 },
    accent: '#ff7a4a',
    bgAccent: '#3a1a14',
    deploy: 'May 14',
    notify: 1843,
    watch: 412,
  };

  return (
    <div className="mw-root mw-grid-bg mw-topomap" style={{ minHeight: '100%', position: 'relative' }}>
      <div className="mw-noise"/>
      <div className="mw-vignette"/>

      {/* TOP NAV */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        height: 56, padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--mw-line)',
        background: 'rgba(10,8,6,0.85)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <MWLogo size={28}/>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {['Discover', 'Live launches', 'Leagues', 'Recruiters'].map((l, i) => (
              <a key={l} style={{
                padding: '8px 12px', fontSize: 13, color: i === 0 ? 'var(--mw-amber)' : 'var(--mw-text-3)',
                cursor: 'pointer', borderRadius: 6,
              }}>{l}</a>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input className="mw-input" placeholder="Search coins, creators..." style={{ width: 240, paddingLeft: 32 }}/>
            <div style={{ position: 'absolute', left: 10, top: 11, color: 'var(--mw-text-3)' }}>{Icons.search}</div>
          </div>
          <button className="mw-btn mw-btn-ghost">Sign in</button>
          <button className="mw-btn mw-btn-primary">Launch a coin</button>
        </div>
      </header>

      {/* DRAFT CALLOUT BAR */}
      <div style={{
        padding: '10px 32px', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid var(--mw-line)',
        background: 'linear-gradient(90deg, rgba(255,155,28,0.08), transparent 60%)',
      }}>
        <DraftStatus deployTarget={coin.deploy.toUpperCase()}/>
        <span style={{ fontSize: 12, color: 'var(--mw-text-3)' }}>
          This is a recon page shared by the creator. The coin hasn't deployed yet — you can register to be notified the moment it goes live.
        </span>
      </div>

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 32px 80px' }}>
        {/* HERO */}
        <section className="mw-rise" style={{
          display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start',
        }}>
          {/* LEFT — coin identity */}
          <div className="mw-card mw-card-elevated mw-brackets" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
            {/* Subtle radial behind avatar */}
            <div style={{
              position: 'absolute', top: -40, right: -40, width: 280, height: 280,
              background: `radial-gradient(circle, ${coin.accent}30 0%, transparent 60%)`,
              pointerEvents: 'none',
            }}/>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <span className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// DOSSIER</span>
              <span className="mw-mono">· #4471 · CHAIN: {coin.chain.toUpperCase()}</span>
            </div>

            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', position: 'relative' }}>
              <CoinAvatar size={120} ticker={coin.ticker} accent={coin.accent} bg={coin.bgAccent}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mw-mono" style={{ marginBottom: 6 }}>{coin.ticker}</div>
                <h1 className="mw-stencil" style={{
                  fontSize: 56, lineHeight: 0.95, margin: 0,
                  letterSpacing: '0.01em',
                  background: 'linear-gradient(180deg, #fff 30%, #c8bfae 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  {coin.name}
                </h1>
                <p style={{ fontSize: 17, color: 'var(--mw-text-2)', marginTop: 12, marginBottom: 0, maxWidth: 460, lineHeight: 1.5 }}>
                  {coin.tagline}
                </p>

                <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                  <button className="mw-btn mw-btn-primary">{Icons.bell}Get notified on launch</button>
                  <button className="mw-btn">{Icons.star}Watchlist</button>
                  <button className="mw-btn mw-btn-ghost">{Icons.share}Share</button>
                </div>
              </div>
            </div>

            {/* Creator strip */}
            <div style={{
              marginTop: 28, paddingTop: 20, borderTop: '1px dashed var(--mw-line-2)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 999,
                  background: 'linear-gradient(135deg, #5a3a2a, #2a1a14)',
                  border: '1px solid var(--mw-line-2)',
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'Bebas Neue', fontSize: 15, color: 'var(--mw-amber-2)',
                }}>CK</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Built by <span style={{ color: 'var(--mw-amber-2)' }}>{coin.creator.handle}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mw-text-3)' }}>
                    Recruiter since {coin.creator.joined} · {coin.creator.launched} prior launches
                  </div>
                </div>
              </div>
              <button className="mw-btn mw-btn-ghost" style={{ height: 32, fontSize: 12 }}>View profile</button>
            </div>
          </div>

          {/* RIGHT — STATS / SOCIALS */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Countdown */}
            <div className="mw-card" style={{ padding: 20 }}>
              <div className="mw-mono" style={{ marginBottom: 12 }}>// DEPLOY WINDOW</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['11', 'D'], ['08', 'H'], ['42', 'M'], ['17', 'S']].map(([n, l]) => (
                  <div key={l} style={{
                    flex: 1, padding: '12px 0', textAlign: 'center',
                    background: 'rgba(0,0,0,0.4)', borderRadius: 8,
                    border: '1px solid var(--mw-line)',
                  }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 30, color: 'var(--mw-amber)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
                    <div className="mw-mono" style={{ fontSize: 9, marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--mw-text-3)', textAlign: 'center' }}>
                Estimated deploy: <span style={{ color: 'var(--mw-text-2)' }}>{coin.deploy}, 18:00 UTC</span>
              </div>
            </div>

            {/* Stats */}
            <div className="mw-card" style={{ padding: 20 }}>
              <div className="mw-mono" style={{ marginBottom: 12 }}>// RECON SIGNAL</div>
              {[
                ['Notifications armed', coin.notify.toLocaleString(), Icons.bell],
                ['On watchlists', coin.watch.toString(), Icons.star],
                ['Comments', '127', Icons.message],
                ['Shares', '93', Icons.share],
              ].map(([l, v, ic], i) => (
                <div key={l} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: i < 3 ? '1px solid var(--mw-line)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--mw-text-2)' }}>
                    <span style={{ color: 'var(--mw-amber)', display: 'flex' }}>{ic}</span>
                    {l}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Socials */}
            <div className="mw-card" style={{ padding: 16 }}>
              <div className="mw-mono" style={{ marginBottom: 10 }}>// COMMS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="mw-btn" style={{ height: 36, justifyContent: 'flex-start' }}>{Icons.x}<span style={{ fontSize: 12 }}>@barrackbunny</span></button>
                <button className="mw-btn" style={{ height: 36, justifyContent: 'flex-start' }}>{Icons.telegram}<span style={{ fontSize: 12 }}>t.me/bunny</span></button>
                <button className="mw-btn" style={{ height: 36, justifyContent: 'flex-start' }}>{Icons.discord}<span style={{ fontSize: 12 }}>Discord</span></button>
                <button className="mw-btn" style={{ height: 36, justifyContent: 'flex-start' }}>{Icons.globe}<span style={{ fontSize: 12 }}>bunny.cc</span></button>
              </div>
            </div>
          </aside>
        </section>

        {/* SECTION — STORY */}
        <section style={{ marginTop: 56 }}>
          <div className="mw-rule" style={{ marginBottom: 12 }}/>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="mw-stencil" style={{ fontSize: 28, margin: 0 }}>The Brief</h2>
            <span className="mw-mono">/ section 01 · added by creator</span>
          </div>
          <div className="mw-card" style={{ padding: 28 }}>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--mw-text-2)', margin: 0, maxWidth: 760 }}>
              Bunny was bred in a forgotten outpost of the warzone — too soft to fight, too stubborn to flee.
              When the supply lines collapsed, he became the unofficial mascot of every grunt who'd lost everything but kept laughing.
              <br/><br/>
              <span style={{ color: 'var(--mw-text)' }}>$BUNNY</span> is a tribute. 1B supply, no team allocation, no presale. Liquidity locks the moment we deploy.
              Holders compete in weekly leagues for the biggest meme — winners take a slice of trading fees.
            </p>
          </div>
        </section>

        {/* SECTION — TOKENOMICS (chosen template) */}
        <section style={{ marginTop: 48 }}>
          <div className="mw-rule" style={{ marginBottom: 12 }}/>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="mw-stencil" style={{ fontSize: 28, margin: 0 }}>Tokenomics</h2>
            <span className="mw-mono">/ section 02 · template: standard split</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="mw-card" style={{ padding: 24 }}>
              <div className="mw-mono" style={{ marginBottom: 10 }}>SUPPLY</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 44, color: 'var(--mw-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>1,000,000,000</div>
              <div className="mw-mono" style={{ marginTop: 6 }}>FIXED · NO MINT FUNCTION</div>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Liquidity pool', 80, 'var(--mw-amber)'],
                  ['Community rewards', 12, 'var(--mw-amber-2)'],
                  ['Creator (vested 6mo)', 5, '#ff7a4a'],
                  ['Marketing & leagues', 3, '#ffcc4a'],
                ].map(([l, p, c]) => (
                  <div key={l}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--mw-text-2)' }}>{l}</span>
                      <span style={{ fontFamily: 'JetBrains Mono', color: c }}>{p}%</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${p}%`, height: '100%', background: c }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mw-card" style={{ padding: 24 }}>
              <div className="mw-mono" style={{ marginBottom: 10 }}>RULES OF ENGAGEMENT</div>
              {[
                ['Tax on buys', '0%'],
                ['Tax on sells', '0%'],
                ['LP locked', '12 months'],
                ['Mint disabled', 'Yes'],
                ['Freeze authority', 'Revoked'],
                ['Bonding curve', '85 SOL → graduate'],
              ].map(([k, v], i) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '12px 0',
                  borderBottom: i < 5 ? '1px solid var(--mw-line)' : 'none', fontSize: 13,
                }}>
                  <span style={{ color: 'var(--mw-text-3)' }}>{k}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--mw-text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION — ROADMAP */}
        <section style={{ marginTop: 48 }}>
          <div className="mw-rule" style={{ marginBottom: 12 }}/>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="mw-stencil" style={{ fontSize: 28, margin: 0 }}>Mission Phases</h2>
            <span className="mw-mono">/ section 03 · template: roadmap</span>
          </div>
          <div className="mw-card" style={{ padding: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, position: 'relative' }}>
              <div style={{
                position: 'absolute', top: 14, left: '12.5%', right: '12.5%', height: 2,
                background: 'linear-gradient(90deg, var(--mw-amber) 0%, var(--mw-amber) 25%, var(--mw-line-2) 25%, var(--mw-line-2) 100%)',
              }}/>
              {[
                ['Recon', 'Gather recruits, build hype, lock visuals.', true],
                ['Deploy', 'Launch on bonding curve. LP locks.', false],
                ['Graduate', 'Hit 85 SOL, migrate to DEX, leagues open.', false],
                ['Conquest', 'Weekly meme leagues. Holder rewards.', false],
              ].map(([t, d, active], i) => (
                <div key={t} style={{ position: 'relative', paddingTop: 38, paddingRight: 16 }}>
                  <div style={{
                    position: 'absolute', top: 8, left: 0,
                    width: 14, height: 14, borderRadius: 999,
                    background: active ? 'var(--mw-amber)' : 'var(--mw-bg-3)',
                    border: `2px solid ${active ? 'var(--mw-amber)' : 'var(--mw-line-2)'}`,
                    boxShadow: active ? '0 0 12px var(--mw-amber-glow)' : 'none',
                  }}/>
                  <div className="mw-mono" style={{ fontSize: 10, color: active ? 'var(--mw-amber)' : 'var(--mw-text-4)' }}>PHASE 0{i+1}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: active ? 'var(--mw-text)' : 'var(--mw-text-2)' }}>{t}</div>
                  <div style={{ fontSize: 12, color: 'var(--mw-text-3)', marginTop: 6, lineHeight: 1.5 }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION — COMMENTS / REACTIONS */}
        <section style={{ marginTop: 48 }}>
          <div className="mw-rule" style={{ marginBottom: 12 }}/>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="mw-stencil" style={{ fontSize: 28, margin: 0 }}>The Bunker</h2>
            <span className="mw-mono">/ section 04 · 127 transmissions</span>
          </div>
          <div className="mw-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['🔥 142', '💎 88', '🚀 67', '😂 54', '🐰 31'].map(r => (
                <button key={r} className="mw-btn mw-btn-ghost" style={{ height: 32, padding: '0 12px', fontSize: 12 }}>
                  {r}
                </button>
              ))}
              <div style={{ flex: 1 }}/>
              <button className="mw-btn" style={{ height: 32, fontSize: 12 }}>{Icons.send}React</button>
            </div>

            {[
              { handle: '@whalepaw', t: '2h', avatar: '#5a8a3a', body: "early bag, easy alpha. squad assembled.", rep: 'Recruiter · 12 launches' },
              { handle: '@xenon_sol', t: '5h', avatar: '#3a5a8a', body: "art is unhinged. the lore section sold me.", rep: 'Holder' },
              { handle: '@grunt_404', t: '1d', avatar: '#8a5a3a', body: "ngl the LP lock + zero tax made me notify-on-launch right away. send.", rep: 'Recon · 84 watchlists' },
            ].map(c => (
              <div key={c.handle} style={{
                display: 'flex', gap: 14, padding: '16px 0',
                borderTop: '1px solid var(--mw-line)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                  background: `linear-gradient(135deg, ${c.avatar}, #2a1a14)`,
                  border: '1px solid var(--mw-line-2)',
                }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.handle}</span>
                    <span className="mw-mono" style={{ fontSize: 10 }}>{c.rep} · {c.t}</span>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--mw-text-2)', marginTop: 4, lineHeight: 1.5 }}>{c.body}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--mw-text-3)' }}>
                    <span style={{ cursor: 'pointer' }}>↑ 14</span>
                    <span style={{ cursor: 'pointer' }}>Reply</span>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--mw-line)' }}>
              <input className="mw-input" placeholder="Drop a transmission... (sign in to post)"/>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ marginTop: 56 }}>
          <div className="mw-card mw-card-elevated" style={{
            padding: 36, textAlign: 'center', position: 'relative', overflow: 'hidden',
            background: 'radial-gradient(circle at 50% 0%, rgba(255,155,28,0.15), var(--mw-bg-3) 60%)',
          }}>
            <div className="mw-tape" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4 }}/>
            <div className="mw-mono" style={{ color: 'var(--mw-amber)' }}>// DEPLOYMENT IMMINENT</div>
            <h3 className="mw-stencil" style={{ fontSize: 36, margin: '8px 0 6px' }}>Don't miss the drop.</h3>
            <p style={{ color: 'var(--mw-text-2)', fontSize: 14, margin: '0 auto 20px', maxWidth: 480 }}>
              Get pinged the second {coin.ticker} hits the bonding curve. No wallet sign required, just a heads-up.
            </p>
            <div style={{ display: 'flex', gap: 8, maxWidth: 460, margin: '0 auto' }}>
              <input className="mw-input" placeholder="you@warzone.com or wallet address" style={{ flex: 1 }}/>
              <button className="mw-btn mw-btn-primary">Notify me</button>
            </div>
            <div className="mw-mono" style={{ marginTop: 14 }}>
              <span style={{ color: 'var(--mw-amber)' }}>{coin.notify.toLocaleString()}</span> recruits already armed
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

window.VarA = VarA;
