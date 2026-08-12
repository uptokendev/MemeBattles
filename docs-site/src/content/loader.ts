import { parseFrontmatter } from '../lib/frontmatter'
import { canonicalPages, routeAliases } from './sidebar'

// Load all markdown content at build-time.
// Paths are exported as: /src/content/<slug>.md
// Vite 5+: use `query: '?raw'` instead of deprecated `as: 'raw'`.
const pages = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

type PageIndex = Record<string, string>

const index: PageIndex = {}
const canonicalRouteToSourcePath = new Map<string, string>()

for (const [k, v] of Object.entries(pages)) {
  // k example: './how-it-works/lifecycle.md'
  const slug = k
    .replace(/^\.\//, '')
    .replace(/\.md$/, '')

  index[`/${slug}`] = v
}

for (const page of canonicalPages) {
  canonicalRouteToSourcePath.set(page.route, `/${page.source.replace(/\.md$/, '')}`)
}

export function normalizePath(pathname: string) {
  const p = pathname.split('?')[0].split('#')[0]
  // Root should land on a high-level intro page (GitBook-like behavior)
  if (p === '' || p === '/') return '/introduction'

  const normalized = p.endsWith('/') ? p.slice(0, -1) : p
  if (routeAliases[normalized]) return routeAliases[normalized]
  if (canonicalRouteToSourcePath.has(normalized)) return normalized

  if (normalized.endsWith('/index')) {
    const withoutIndex = normalized.slice(0, -'/index'.length) || '/'
    if (routeAliases[withoutIndex]) return routeAliases[withoutIndex]
    if (canonicalRouteToSourcePath.has(withoutIndex)) return withoutIndex
  }

  return normalized
}

export function getSourcePathByRoute(path: string): string | null {
  return canonicalRouteToSourcePath.get(path) ?? null
}

export function getPageByPath(path: string): string | null {
  const sourcePath = getSourcePathByRoute(path)
  if (!sourcePath) return null
  return index[sourcePath]
}

export function getFrontmatterTitle(path: string): string | null {
  const raw = getPageByPath(path)
  if (!raw) return null
  const { data } = parseFrontmatter(raw)
  return (data.title as string) || null
}
