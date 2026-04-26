export type NavItem = { title: string; href: string }
export type NavSection = { title: string; items: NavItem[] }

export const sidebar: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { title: 'Introduction', href: '/introduction' },
      { title: 'How MemeWarzone Works', href: '/how-memewarzone-works' },
      { title: 'Getting Started', href: '/getting-started' },
      { title: 'Prepare Mode', href: '/prepare-mode' },
      { title: 'Roadmap', href: '/roadmap' }
    ]
  },
  {
    title: 'Platform basics',
    items: [
      { title: 'Campaign System', href: '/platform/campaign-lifecycle' },
      { title: 'Bonding Curve', href: '/platform/bonding-curve' },
      { title: 'Graduation', href: '/platform/graduation' },
      { title: 'UpVotes', href: '/platform/upvotes' },
      { title: 'Leagues', href: '/leagues' },
      { title: 'War Room Chat', href: '/platform/war-room' }
    ]
  },
  {
    title: 'Rewards & incentives',
    items: [
      { title: 'Squad Pool', href: '/rewards/squad-pool' },
      { title: 'Warzone BNB Airdrops', href: '/rewards/warzone-airdrops' },
      { title: 'Epochs & Claims', href: '/rewards/epochs-and-claims' },
      { title: 'Dashboard & Rewards UX', href: '/rewards/dashboard-ux' }
    ]
  },
  {
    title: 'For creators',
    items: [
      { title: 'Creator Overview', href: '/creators' },
      { title: 'Create a Campaign', href: '/creators/create-a-campaign' },
      { title: 'Creator Earnings', href: '/creators/creator-earnings' },
      { title: 'Creator Growth Loop', href: '/creators/growth-loop' }
    ]
  },
  {
    title: 'For traders',
    items: [
      { title: 'Trader Overview', href: '/traders' },
      { title: 'Trading Basics', href: '/traders/trading-basics' },
      { title: 'UpVotes for Traders', href: '/traders/upvotes' },
      { title: 'Claiming Rewards', href: '/traders/claiming-rewards' }
    ]
  },
  {
    title: 'Recruiter Program',
    items: [
      { title: 'Program Overview', href: '/programs/recruiter-program' },
      { title: 'Attribution & Links', href: '/programs/attribution-and-links' },
      { title: 'Dashboard & Payouts', href: '/programs/dashboard-and-payouts' },
      { title: 'OG Recruiters', href: '/programs/og-recruiters' }
    ]
  },
  {
    title: 'Fees & treasury',
    items: [
      { title: 'Economic Model', href: '/economics' },
      { title: 'Fee Model', href: '/fees' },
      { title: 'Fee Routing', href: '/fees/fee-routing' },
      { title: 'Where Fees Go', href: '/fees/where-fees-go' },
      { title: 'Fee Examples', href: '/fees/examples' },
      { title: 'Treasury Structure', href: '/treasury' },
      { title: 'Weekly Distribution', href: '/treasury/weekly-distribution' }
    ]
  },
  {
    title: 'Security & trust',
    items: [
      { title: 'Protection Model', href: '/security/protection-model' },
      { title: 'Anti-Abuse System', href: '/security/anti-abuse' },
      { title: 'Transparency', href: '/security/transparency' },
      { title: 'Avoid Scams', href: '/security/avoid-scams' },
      { title: 'Risk Disclosure', href: '/security/risk-disclosure' },
      { title: 'Incident Response', href: '/security/incident-response' }
    ]
  },
  {
    title: 'FAQ',
    items: [
      { title: 'FAQ', href: '/faq' },
      { title: 'Glossary', href: '/glossary' },
      { title: 'Ranking System & Profiles', href: '/ranking-system' }
    ]
  }
]

export const flatNav: NavItem[] = sidebar.flatMap(s => s.items)
