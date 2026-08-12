import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const outDir = path.join(root, 'dist')
const manifestPath = path.join(contentDir, 'page-manifest.json')

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { content: raw }
  }

  const fence = /\r?\n---\r?\n/
  const match = fence.exec(raw)
  if (!match) return { content: raw }

  return {
    content: raw.slice(match.index + match[0].length)
  }
}

function extractMarkdownLinks(markdown) {
  const links = []
  const { content } = parseFrontmatter(markdown)
  const pattern = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match

  while ((match = pattern.exec(content))) {
    links.push(match[2])
  }

  return links
}

function countWords(markdown) {
  const { content } = parseFrontmatter(markdown)
  return content
    .replace(/[`*_>#-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length
}

function normalizeCanonicalRoute(route) {
  if (!route || route === '/') return '/introduction'
  return route.endsWith('/') ? route.slice(0, -1) : route
}

function buildAliasIndex(pages) {
  const aliases = new Map()
  const sourceRoutes = new Map()

  for (const page of pages) {
    const canonicalRoute = normalizeCanonicalRoute(page.route)
    for (const alias of page.aliases) {
      aliases.set(normalizeCanonicalRoute(alias), canonicalRoute)
    }

    const sourceRoute = `/${page.source.replace(/\.md$/, '')}`
    sourceRoutes.set(sourceRoute, canonicalRoute)
    if (sourceRoute.endsWith('/index')) {
      sourceRoutes.set(sourceRoute.slice(0, -'/index'.length) || '/', canonicalRoute)
    }
  }

  return { aliases, sourceRoutes }
}

function classifyLink(href, page, aliasIndex) {
  if (!href) return null
  if (/^(http:\/\/|https:\/\/|mailto:|tel:)/i.test(href)) {
    const url = new URL(href, 'https://docs.memewar.zone')
    if (url.origin !== 'https://docs.memewar.zone') return { kind: 'external', href }
  }

  if (/\.[a-z0-9]+(?=[#?]|$)/i.test(href) && !/\.md(?=[#?]|$)/i.test(href)) {
    return { kind: 'asset', href }
  }

  if (href.startsWith('#')) {
    return { kind: 'internal', href: `${normalizeCanonicalRoute(page.route)}${href}` }
  }

  const currentSourceRoute = `/${page.source.replace(/\.md$/, '')}`
  const baseSourceDir = currentSourceRoute.endsWith('/index')
    ? currentSourceRoute.slice(0, -'/index'.length)
    : currentSourceRoute.split('/').slice(0, -1).join('/') || '/'
  const resolved = new URL(href.replace(/\.md(?=[#?]|$)/, ''), `https://docs.memewar.zone${baseSourceDir.endsWith('/') ? baseSourceDir : `${baseSourceDir}/`}`)
  let pathname = resolved.pathname
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1)
  pathname = pathname.replace(/\/index$/, '') || '/introduction'
  const normalized = normalizeCanonicalRoute(pathname)

  return {
    kind: 'internal',
    href: `${aliasIndex.aliases.get(normalized) || aliasIndex.sourceRoutes.get(normalized) || normalized}${resolved.hash}`
  }
}

if (!fs.existsSync(outDir)) {
  throw new Error('dist does not exist. Run the Vite build before generating docs coverage artifacts.')
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const aliasIndex = buildAliasIndex(manifest.pages)

const pages = manifest.pages.map((page) => {
  const markdown = fs.readFileSync(path.join(contentDir, page.source), 'utf8')
  const links = extractMarkdownLinks(markdown)
  const classifiedLinks = links
    .map((href) => classifyLink(href, page, aliasIndex))
    .filter(Boolean)

  return {
    route: page.route,
    title: page.title,
    group: page.group,
    status: page.status,
    aliases: page.aliases,
    source: page.source,
    wordCount: countWords(markdown),
    internalLinks: classifiedLinks.filter((entry) => entry.kind === 'internal').map((entry) => entry.href),
    externalLinks: classifiedLinks.filter((entry) => entry.kind === 'external').map((entry) => entry.href),
    assetLinks: classifiedLinks.filter((entry) => entry.kind === 'asset').map((entry) => entry.href)
  }
})

const summary = {
  generatedAt: new Date().toISOString(),
  totalPages: pages.length,
  byStatus: pages.reduce((acc, page) => {
    acc[page.status] = (acc[page.status] || 0) + 1
    return acc
  }, {}),
  byGroup: pages.reduce((acc, page) => {
    acc[page.group] = (acc[page.group] || 0) + 1
    return acc
  }, {})
}

fs.writeFileSync(
  path.join(outDir, 'docs-coverage.json'),
  `${JSON.stringify({ summary, pages }, null, 2)}\n`
)

const markdown = [
  '# Docs Coverage',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  `Total pages: ${summary.totalPages}`,
  '',
  '## Status',
  ...Object.entries(summary.byStatus).map(([status, count]) => `- ${status}: ${count}`),
  '',
  '## Groups',
  ...Object.entries(summary.byGroup).map(([group, count]) => `- ${group}: ${count}`),
  '',
  '## Pages',
  ...pages.flatMap((page) => [
    `- ${page.route} | ${page.status} | ${page.wordCount} words | ${page.internalLinks.length} internal links`
  ]),
  ''
].join('\n')

fs.writeFileSync(path.join(outDir, 'docs-coverage.md'), `${markdown}\n`)

console.log(`Generated docs coverage artifacts for ${pages.length} canonical pages`)
