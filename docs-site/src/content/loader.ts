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
  return p.endsWith('/') ? p.slice(0, -1) : p
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
