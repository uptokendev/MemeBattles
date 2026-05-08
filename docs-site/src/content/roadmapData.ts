export type RoadmapStatus = 'completed' | 'incoming' | 'scheduled' | 'planned' | 'future'

export type RoadmapMilestone = {
  id: string
  month: string
  title: string
  shortText: string
  status: RoadmapStatus
}

export const roadmapMilestones: RoadmapMilestone[] = [
  {
    id: 'idea-war-plan',
    month: 'November',
    title: 'Idea & War Plan',
    shortText: 'MemeWarzone concept formed and the first battle plan was written.',
    status: 'completed'
  },
  {
    id: 'first-test-version',
    month: 'February',
    title: 'First Test Version',
    shortText: 'Early version went online with core structure and initial security logic.',
    status: 'completed'
  },
  {
    id: 'first-docs-online',
    month: 'February',
    title: 'First Docs Online',
    shortText: 'The first public documentation went live.',
    status: 'completed'
  },
  {
    id: 'leagues-recruiters-build',
    month: 'March',
    title: 'Leagues & Recruiters',
    shortText: 'Battle Leagues and Recruiter Program systems entered build phase.',
    status: 'completed'
  },
  {
    id: 'recruiter-online',
    month: 'April',
    title: 'Recruiter Program Online',
    shortText: 'Recruiter signup and onboarding went live through the landing page.',
    status: 'completed'
  },
  {
    id: 'reward-pools-built',
    month: 'April',
    title: 'Reward Pools Built',
    shortText: 'Squad Pool and Warzone Airdrop Pool were designed and built.',
    status: 'completed'
  },
  {
    id: 'fortress-security',
    month: 'April',
    title: 'Fortress Security',
    shortText: 'The full security system was built, hardened, and tested.',
    status: 'completed'
  },
  {
    id: 'prepare-mode-systems',
    month: 'April',
    title: 'Prepare Mode Systems',
    shortText: 'Drafts, Promotion Pages, scheduled status, and Prepare Mode launch flows were prepared.',
    status: 'completed'
  },
  {
    id: 'war-missions',
    month: 'Before May 12',
    title: 'War Missions / Quest System',
    shortText: 'Quest system deployment to drive onboarding, social growth, and recruiter applications before launch.',
    status: 'incoming'
  },
  {
    id: 'prepare-mode-live',
    month: 'May 12, 2026',
    title: 'Prepare Mode Live',
    shortText: 'Creators, recruiters, squads, traders, and communities start preparing before full live deployment.',
    status: 'incoming'
  },
  {
    id: 'bnb-live-launch',
    month: 'June 9, 2026',
    title: 'BNB Live Launch',
    shortText: 'Full BNB battlefield opens with live campaign deployment, bonding-curve trading, UpVotes, Leagues, rewards, and claims.',
    status: 'scheduled'
  },
  {
    id: 'solana-expansion',
    month: 'End June 2026',
    title: 'Solana Expansion',
    shortText: 'MemeWarzone expands beyond BNB Chain into Solana and starts the multi-chain battlefield phase.',
    status: 'scheduled'
  },
  {
    id: 'marketing-growth-engine',
    month: 'June-July 2026',
    title: 'Marketing Growth Engine',
    shortText: 'Automated Telegram, Discord, and X pushes, Shill & Chill spaces, weekly podcast, and campaign recaps scale activity.',
    status: 'planned'
  },
  {
    id: 'tron-base-eth-expansion',
    month: 'End August 2026',
    title: 'Tron, Base & Ethereum',
    shortText: 'MemeWarzone expands to Tron, Base, and Ethereum to become a serious multi-chain launchpad.',
    status: 'planned'
  },
  {
    id: 'internal-bridge',
    month: 'Mid-October 2026',
    title: 'Internal Bridge',
    shortText: 'The internal bridge target moves MemeWarzone from multi-chain presence toward one connected interchain battlefield.',
    status: 'future'
  },
  {
    id: 'interchain-battlefield',
    month: 'After bridge',
    title: 'Full Interchain Battlefield',
    shortText: 'Cross-chain discovery, profiles, rankings, reputation, chain choice, and unified reward dashboards expand the ecosystem.',
    status: 'future'
  },
  {
    id: 'market-share-push',
    month: 'Year one',
    title: '20% Per-Chain Target',
    shortText: 'The strategic target is 20% market share on each chain MemeWarzone launches on, not only 20% across all chains combined.',
    status: 'future'
  }
]
