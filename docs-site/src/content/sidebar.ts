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
    title: 'FAQ',
    items: [
      { title: 'FAQ', href: '/faq' }
    ]
  }
]

export const flatNav: NavItem[] = sidebar.flatMap(s => s.items)
