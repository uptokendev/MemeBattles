import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const outDir = path.join(root, 'dist')
const sidebarPath = path.join(contentDir, 'sidebar.ts')
const siteUrl = process.env.DOCS_SITE_URL || 'https://docs.memewar.zone'

const escapeXml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.name.endsWith('.md')) return []
    return [full]
  })
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { data: {}, content: raw }
  }

  const fence = /\r?\n---\r?\n/
  const match = fence.exec(raw)
  if (!match) return { data: {}, content: raw }

  const data = {}
  const block = raw.slice(4, match.index)
  const content = raw.slice(match.index + match[0].length)

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    data[key] = value
  }

  return { data, content }
}

function extractSidebarRoutes() {
  const raw = fs.readFileSync(sidebarPath, 'utf8')
  const routePattern = /\{\s*title:\s*'([^']+)'\s*,\s*href:\s*'([^']+)'\s*\}/g
  const items = []
  let match

  while ((match = routePattern.exec(raw))) {
    items.push({
      navTitle: match[1],
      route: match[2]
    })
  }

  return items
}

function buildRouteIndex() {
  const exactRouteIndex = new Map()

  for (const file of walk(contentDir)) {
    const rel = path.relative(contentDir, file).replace(/\\/g, '/')
    const slug = rel.replace(/\.md$/, '')
    exactRouteIndex.set(`/${slug}`, file)
  }

  const routeIndex = new Map()

  for (const [exactRoute, file] of exactRouteIndex.entries()) {
    const canonicalRoute = exactRoute.replace(/\/index$/, '') || '/'
    const preferredExactRoute = canonicalRoute === '/' ? '/' : canonicalRoute
    const preferredExactFile = exactRouteIndex.get(preferredExactRoute)
    const preferredIndexFile = exactRouteIndex.get(`${preferredExactRoute}/index`)

    if (preferredExactFile) {
      routeIndex.set(canonicalRoute, preferredExactFile)
      continue
    }

    if (preferredIndexFile) {
      routeIndex.set(canonicalRoute, preferredIndexFile)
      continue
    }

    if (!routeIndex.has(canonicalRoute)) {
      routeIndex.set(canonicalRoute, file)
    }
  }

  return routeIndex
}

function loadCanonicalPages() {
  const routeIndex = buildRouteIndex()
  const seen = new Set()

  return extractSidebarRoutes()
    .filter((item) => {
      if (seen.has(item.route)) return false
      seen.add(item.route)
      return true
    })
    .map((item) => {
      const file = routeIndex.get(item.route)
      if (!file) {
        throw new Error(`Missing markdown source for canonical route ${item.route}`)
      }

      const raw = fs.readFileSync(file, 'utf8')
      const { data, content } = parseFrontmatter(raw)

      return {
        route: item.route,
        title: data.title || item.navTitle,
        description: data.description || '',
        content
      }
    })
}

if (!fs.existsSync(outDir)) {
  throw new Error('dist does not exist. Run the Vite build before generating docs artifacts.')
}

const pages = loadCanonicalPages()

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
  .map((page) => `  <url><loc>${siteUrl}${page.route}</loc></url>`)
  .join('\n')}\n</urlset>\n`

fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap)

const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<docs generated="${new Date().toISOString()}">\n${pages
  .map(
    (page) => `  <page>\n    <loc>${siteUrl}${page.route}</loc>\n    <title>${escapeXml(page.title)}</title>\n    <description>${escapeXml(page.description)}</description>\n    <content>${escapeXml(page.content.trim())}</content>\n  </page>`
  )
  .join('\n')}\n</docs>\n`

fs.writeFileSync(path.join(outDir, 'docs-feed.xml'), feed)

console.log(`Generated sitemap.xml and docs-feed.xml for ${pages.length} canonical pages`)
