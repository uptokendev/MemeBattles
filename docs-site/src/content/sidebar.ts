export type NavItem = { title: string; href: string }
export type NavSection = { title: string; items: NavItem[] }

export const sidebar: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { title: 'Introduction', href: '/introduction' },
      { title: 'Why we built this', href: '/why-we-built-this' },
      { title: 'What is MemeBattles?', href: '/what-is-memebattles' },
      { title: 'What problem does it solve?', href: '/problem-we-solve' },
      { title: 'Getting Started', href: '/getting-started' },
    ]
  },
  {
    title: 'Core Concepts',
    items: [
      { title: 'Campaigns', href: '/core-concepts/campaigns' },
      { title: 'Bonding Curve', href: '/core-concepts/bonding-curve' },
      { title: 'Graduation', href: '/core-concepts/graduation' },
      { title: 'UpVotes', href: '/core-concepts/upvotes' },
      { title: 'Leagues', href: '/core-concepts/leagues' },
      { title: 'Fees & Treasury', href: '/core-concepts/fees-and-treasury' },
      { title: 'Claims', href: '/core-concepts/claims' }
    ]
  },
  {
    title: 'For traders',
    items: [
      { title: 'Overview', href: '/traders' },
      { title: 'Trading basics', href: '/traders/trading-basics' },
      { title: 'Bonding curve (trader view)', href: '/traders/bonding-curve' },
      { title: 'UpVotes for traders', href: '/traders/upvotes' },
      { title: 'Leagues for traders', href: '/traders/leagues' },
      { title: 'Claiming rewards', href: '/traders/claiming-rewards' },
      { title: 'Troubleshooting', href: '/traders/troubleshooting' }
    ]
  },
   {
    title: 'For creators',
    items: [
      { title: 'Overview', href: '/creators' },
      { title: 'Create a campaign', href: '/creators/create-a-campaign' },
      { title: 'Branding & best practices', href: '/creators/branding-best-practices' },
      { title: 'Graduation (creator view)', href: '/creators/graduation' },
      { title: 'Creator earnings', href: '/creators/creator-earnings' },
      { title: 'Growth loop', href: '/creators/growth-loop' }
    ]
  },
  {
    title: 'Fees & economics',
    items: [
      { title: 'Overview', href: '/fees' },
      { title: 'Where fees go', href: '/fees/where-fees-go' },
      { title: 'Examples (BNB + USD)', href: '/fees/examples' },
      { title: 'Trading fees', href: '/fees/trading' },
      { title: 'UpVote fees', href: '/fees/upvotes' },
      { title: 'Finalize (graduation)', href: '/fees/finalize' }
    ]
  },
  {
    title: 'Leagues',
    items: [
      { title: 'Overview', href: '/leagues/overview' },
      { title: 'Epochs', href: '/leagues/epochs' },
      { title: 'Claims', href: '/leagues/claims' }
    ]
  },
  {
    title: 'Treasury & transparency',
    items: [
      { title: 'Overview', href: '/treasury' },
      { title: 'Wallet model', href: '/treasury/wallet-model' },
      { title: 'Weekly distribution', href: '/treasury/weekly-distribution' },
      { title: 'Where does revenue go?', href: '/treasury/where-does-revenue-go' }
    ]
  },
  {
    title: 'Security & safety',
    items: [
      { title: 'Overview', href: '/security/overview' },
      { title: 'Risk disclosure', href: '/security/risk-disclosure' },
      { title: 'Avoid scams', href: '/security/avoid-scams' },
      { title: 'Incident response', href: '/security/incident-response' }
    ]
  },
  {
    title: 'FAQ',
    items: [
      { title: 'FAQ', href: '/faq' },
      { title: 'Glossary', href: '/glossary' }
    ]
  }
]

export const flatNav: NavItem[] = sidebar.flatMap(s => s.items)
