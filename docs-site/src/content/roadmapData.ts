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
    shortText: 'Core systems were prepared for the May 12 Prepare Mode rollout.',
    status: 'completed'
  },
  {
    id: 'quest-system',
    month: 'Before May 12',
    title: 'Quest System Deployment',
    shortText: 'Quest system deployed to drive community growth before launch.',
    status: 'incoming'
  },
  {
    id: 'prepare-mode-live',
    month: 'May 12',
    title: 'Prepare Mode Live',
    shortText: 'Creators, recruiters, and squads start preparing before full deployment.',
    status: 'incoming'
  },
  {
    id: 'launchpad-live',
    month: 'June 9',
    title: 'Launchpad Live',
    shortText: 'Draft campaigns can deploy into the live MemeWarzone battlefield.',
    status: 'scheduled'
  },
  {
    id: 'marketing-wave-one',
    month: 'June',
    title: 'Marketing Wave I',
    shortText: 'First heavy marketing push begins after the launchpad opens.',
    status: 'scheduled'
  },
  {
    id: 'marketing-wave-two',
    month: 'July',
    title: 'Marketing Wave II',
    shortText: 'Second heavy marketing wave tests scale, retention, and growth channels.',
    status: 'planned'
  },
  {
    id: 'solana-expansion',
    month: 'July',
    title: 'Solana Expansion',
    shortText: 'MemeWarzone expands beyond BNB Chain into Solana.',
    status: 'planned'
  },
  {
    id: 'next-chain-prep',
    month: 'August',
    title: 'Next Chain Prep',
    shortText: 'Preparation begins for Tron, Base, and Ethereum expansion.',
    status: 'planned'
  },
  {
    id: 'three-chain-deployment',
    month: 'August',
    title: 'Three-Chain Deployment',
    shortText: 'MemeWarzone deploys on Tron, Base, and Ethereum.',
    status: 'planned'
  },
  {
    id: 'integrated-bridge',
    month: 'September',
    title: 'Integrated Bridge',
    shortText: 'Chains connect through an integrated bridge experience.',
    status: 'future'
  },
  {
    id: 'launchpad-domination',
    month: 'October',
    title: 'Launchpad Domination',
    shortText: 'MemeWarzone pushes to dominate the competitive launchpad space.',
    status: 'future'
  }
]
