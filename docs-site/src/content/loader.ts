import { parseFrontmatter } from '../lib/frontmatter'

// Load all markdown content at build-time.
// Paths are exported as: /src/content/<slug>.md
// Vite 5+: use `query: '?raw'` instead of deprecated `as: 'raw'`.
const pages = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

type PageIndex = Record<string, string>

const routeAliases: Record<string, string> = {
  '/what-is-memewarzone': '/introduction',
  '/what-is-memebattles': '/introduction',
  '/why-we-built-this': '/introduction',
  '/problem-we-solve': '/introduction',
  '/concepts': '/platform/campaign-lifecycle',
  '/core-concepts': '/platform/campaign-lifecycle',
  '/core-concepts/index': '/platform/campaign-lifecycle',
  '/core-concepts/campaigns': '/platform/campaign-lifecycle',
  '/core-concepts/bonding-curve': '/platform/bonding-curve',
  '/core-concepts/graduation': '/platform/graduation',
  '/core-concepts/upvotes': '/platform/upvotes',
  '/core-concepts/leagues': '/leagues',
  '/core-concepts/fees-and-treasury': '/fees',
  '/core-concepts/claims': '/rewards/epochs-and-claims',
  '/how-it-works/lifecycle': '/platform/campaign-lifecycle',
  '/how-it-works/bonding-curve': '/platform/bonding-curve',
  '/how-it-works/graduation': '/platform/graduation',
  '/leagues/overview': '/leagues',
  '/leagues/epochs': '/leagues/epochs-and-prizes',
  '/leagues/claims': '/rewards/epochs-and-claims',
  '/leagues/airdrops': '/rewards/warzone-airdrops',
  '/fees/trading': '/fees',
  '/fees/upvotes': '/platform/upvotes',
  '/fees/finalize': '/platform/graduation',
  '/treasury/wallet-model': '/treasury',
  '/treasury/where-does-revenue-go': '/fees/where-fees-go',
  '/security/overview': '/security/protection-model'
}

const index: PageIndex = {}

for (const [k, v] of Object.entries(pages)) {
  // k example: './how-it-works/lifecycle.md'
  const slug = k
    .replace(/^\.\//, '')
    .replace(/\.md$/, '')

  index[`/${slug}`] = v
}

export function normalizePath(pathname: string) {
  const p = pathname.split('?')[0].split('#')[0]
  // Root should land on a high-level intro page (GitBook-like behavior)
  if (p === '' || p === '/') return '/introduction'
  const normalized = p.endsWith('/') ? p.slice(0, -1) : p
  return routeAliases[normalized] ?? normalized
}

export function getPageByPath(path: string): string | null {
  if (index[path]) return index[path]
  // fallback: allow /x to map to /x/index
  const withIndex = `${path}/index`
  if (index[withIndex]) return index[withIndex]
  return null
}

export function getFrontmatterTitle(path: string): string | null {
  const raw = getPageByPath(path)
  if (!raw) return null
  const { data } = parseFrontmatter(raw)
  return (data.title as string) || null
}
