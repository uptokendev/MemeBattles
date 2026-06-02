const appBaseUrl = "https://app.memewar.zone";

const navItems = [
  { label: "Loop", href: "#loop" },
  { label: "Roles", href: "#roles" },
  { label: "Prepare", href: "#prepare" },
  { label: "Rewards", href: "#rewards" },
];

const loopSteps = [
  {
    kicker: "01",
    title: "Create or discover a campaign",
    body: "Creators launch meme coins with a visible battle plan. Traders and squads can read the field before they commit.",
  },
  {
    kicker: "02",
    title: "Prepare the push",
    body: "The community builds a pre-launch command post with objectives, recruiting hooks, and rewards before the market opens.",
  },
  {
    kicker: "03",
    title: "Fight through leagues",
    body: "Campaigns climb through trading, recruiting, and squad activity. Momentum is tracked in public, not hidden in a chat thread.",
  },
  {
    kicker: "04",
    title: "Graduate and get paid",
    body: "The best campaigns graduate into bigger arenas while contributors compete for claims, recognition, and reward pools.",
  },
];

const roles = [
  {
    title: "Creators",
    body: "Launch with a battlefield, not a blank chart. Put the mission, token story, and incentive loop in one public place.",
  },
  {
    title: "Traders",
    body: "Track active campaigns, compare momentum, and decide where to deploy based on more than noise.",
  },
  {
    title: "Recruiters",
    body: "Bring new fighters into a campaign, prove your reach, and climb recruiter boards tied to real activity.",
  },
  {
    title: "Squads",
    body: "Coordinate together, stack impact, and compete as a unit across campaigns, arenas, and reward cycles.",
  },
];

const leagueStats = [
  "Battle-ready launch pages",
  "Recruiter and squad leaderboards",
  "Arena progression",
  "Graduation tracks",
  "Airdrop and claim operations",
  "Command center profiles",
];

export default function LandingPage() {
  return (
    <div className="mwz-landing">
      <header className="mwz-landing__nav" aria-label="MemeWarzone public navigation">
        <a className="mwz-landing__brand" href="/" aria-label="MemeWarzone home">
          <img src="/assets/hero/logo.png" alt="" />
          <span>MemeWarzone</span>
        </a>
        <nav className="mwz-landing__links" aria-label="Landing page sections">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="mwz-landing__nav-cta" href={appBaseUrl}>
          Enter app
        </a>
      </header>

      <main>
        <section className="mwz-landing__hero" aria-labelledby="mwz-landing-title">
          <div className="mwz-landing__hero-copy">
            <p className="mwz-landing__eyebrow">Public command brief</p>
            <h1 id="mwz-landing-title">MemeWarzone</h1>
            <p className="mwz-landing__lead">
              A launchpad and battle arena for meme coin campaigns where creators brief the mission,
              traders read momentum, recruiters build reach, and squads compete for graduation.
            </p>
            <div className="mwz-landing__actions">
              <a className="mwz-landing__button mwz-landing__button--primary" href={appBaseUrl}>
                Launch app
              </a>
              <a className="mwz-landing__button" href="#loop">
                See the loop
              </a>
            </div>
          </div>
          <div className="mwz-landing__hero-panel" aria-label="Battlefield status">
            <span>Battlefield loop</span>
            <strong>Create. Prepare. Trade. Recruit. Graduate.</strong>
            <p>
              MemeWarzone turns a campaign into an operating field with visible roles, live objectives,
              arena progression, and reward paths.
            </p>
          </div>
        </section>

        <section className="mwz-landing__section" id="loop" aria-labelledby="loop-title">
          <div className="mwz-landing__section-heading">
            <p className="mwz-landing__eyebrow">What it is</p>
            <h2 id="loop-title">A public battlefield for the whole campaign cycle.</h2>
          </div>
          <div className="mwz-landing__loop-grid">
            {loopSteps.map((step) => (
              <article className="mwz-landing__panel" key={step.title}>
                <span>{step.kicker}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mwz-landing__section" id="roles" aria-labelledby="roles-title">
          <div className="mwz-landing__section-heading">
            <p className="mwz-landing__eyebrow">Roles</p>
            <h2 id="roles-title">Creators, traders, recruiters, and squads share the same map.</h2>
          </div>
          <div className="mwz-landing__roles-grid">
            {roles.map((role) => (
              <article className="mwz-landing__panel" key={role.title}>
                <h3>{role.title}</h3>
                <p>{role.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mwz-landing__feature" id="prepare" aria-labelledby="prepare-title">
          <div>
            <p className="mwz-landing__eyebrow">Prepare Mode</p>
            <h2 id="prepare-title">Build the campaign before the first major push.</h2>
            <p>
              Prepare Mode gives a token its staging ground: narrative, objectives, recruiter paths,
              squad coordination, and calls to action. The point is simple: make the mission readable
              before momentum gets expensive.
            </p>
          </div>
          <a className="mwz-landing__button mwz-landing__button--primary" href={`${appBaseUrl}/create`}>
            Start a campaign
          </a>
        </section>

        <section className="mwz-landing__section" aria-labelledby="league-title">
          <div className="mwz-landing__section-heading">
            <p className="mwz-landing__eyebrow">Trading, leagues, graduation</p>
            <h2 id="league-title">Momentum moves from launchpad to arena.</h2>
          </div>
          <div className="mwz-landing__stat-grid">
            {leagueStats.map((stat) => (
              <div className="mwz-landing__stat" key={stat}>
                {stat}
              </div>
            ))}
          </div>
        </section>

        <section className="mwz-landing__feature" id="rewards" aria-labelledby="rewards-title">
          <div>
            <p className="mwz-landing__eyebrow">Rewards</p>
            <h2 id="rewards-title">Recognition and claims stay connected to the battle.</h2>
            <p>
              Recruiters, squads, and active campaign contributors can compete for visible rank,
              claim windows, and reward operations that keep the incentive loop tied to the field.
            </p>
          </div>
          <a className="mwz-landing__button" href={`${appBaseUrl}/airdrops`}>
            View rewards
          </a>
        </section>

        <section className="mwz-landing__final" aria-labelledby="final-title">
          <p className="mwz-landing__eyebrow">Ready for deployment</p>
          <h2 id="final-title">Enter the warzone with the app experience.</h2>
          <div className="mwz-landing__actions">
            <a className="mwz-landing__button mwz-landing__button--primary" href={appBaseUrl}>
              Open app.memewar.zone
            </a>
            <a className="mwz-landing__button" href={`${appBaseUrl}/docs`}>
              Read docs
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
