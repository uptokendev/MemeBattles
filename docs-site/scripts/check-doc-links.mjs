import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const manifestPath = path.join(contentDir, 'page-manifest.json')

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

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

function extractAnchors(markdown) {
  const anchors = new Set()
  const { content } = parseFrontmatter(markdown)

  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (!heading) continue
    anchors.add(slugifyHeading(heading[2].trim()))
  }

  return anchors
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

function normalizeCanonicalRoute(route) {
  if (!route || route === '/') return '/introduction'
  return route.endsWith('/') ? route.slice(0, -1) : route
}

function buildManifestIndex(pages) {
  const canonicalByRoute = new Map()
  const canonicalBySourceRoute = new Map()
  const aliasToCanonical = new Map()
  const sourceAnchors = new Map()

  for (const page of pages) {
    const canonicalRoute = normalizeCanonicalRoute(page.route)
    const sourceRoute = `/${page.source.replace(/\.md$/, '')}`

    canonicalByRoute.set(canonicalRoute, page)
    canonicalBySourceRoute.set(sourceRoute, canonicalRoute)
    if (sourceRoute.endsWith('/index')) {
      canonicalBySourceRoute.set(sourceRoute.slice(0, -'/index'.length) || '/', canonicalRoute)
    }

    for (const alias of page.aliases) {
      aliasToCanonical.set(normalizeCanonicalRoute(alias), canonicalRoute)
    }

    const markdown = fs.readFileSync(path.join(contentDir, page.source), 'utf8')
    sourceAnchors.set(canonicalRoute, extractAnchors(markdown))
  }

  return {
    canonicalByRoute,
    canonicalBySourceRoute,
    aliasToCanonical,
    sourceAnchors
  }
}

function resolveInternalLinkTarget(href, page, manifestIndex) {
  if (!href || href.startsWith('#')) {
    return {
      route: normalizeCanonicalRoute(page.route),
      anchor: href.startsWith('#') ? href.slice(1) : ''
    }
  }

  if (/^(http:\/\/|https:\/\/|mailto:|tel:)/i.test(href)) {
    const url = new URL(href, 'https://docs.memewar.zone')
    if (url.origin !== 'https://docs.memewar.zone') {
      return null
    }

    const route = normalizeCanonicalRoute(url.pathname === '/' ? '/introduction' : url.pathname)
    return {
      route: manifestIndex.aliasToCanonical.get(route) || route,
      anchor: url.hash.replace(/^#/, '')
    }
  }

  if (/\.[a-z0-9]+(?=[#?]|$)/i.test(href) && !/\.md(?=[#?]|$)/i.test(href)) {
    return null
  }

  const currentSourceRoute = `/${page.source.replace(/\.md$/, '')}`
  const baseSourceDir = currentSourceRoute.endsWith('/index')
    ? currentSourceRoute.slice(0, -'/index'.length)
    : currentSourceRoute.split('/').slice(0, -1).join('/') || '/'
  const baseUrl = `https://docs.memewar.zone${baseSourceDir.endsWith('/') ? baseSourceDir : `${baseSourceDir}/`}`
  const resolved = new URL(href.replace(/\.md(?=[#?]|$)/, ''), baseUrl)
  let pathname = resolved.pathname

  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1)
  pathname = pathname.replace(/\/index$/, '') || '/introduction'

  const normalizedRoute = normalizeCanonicalRoute(pathname)
  const canonicalRoute =
    manifestIndex.aliasToCanonical.get(normalizedRoute)
    || manifestIndex.canonicalBySourceRoute.get(normalizedRoute)
    || normalizedRoute

  return {
    route: canonicalRoute,
    anchor: resolved.hash.replace(/^#/, '')
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const manifestIndex = buildManifestIndex(manifest.pages)
const errors = []

for (const page of manifest.pages) {
  const markdown = fs.readFileSync(path.join(contentDir, page.source), 'utf8')
  const links = extractMarkdownLinks(markdown)

  for (const href of links) {
    const target = resolveInternalLinkTarget(href, page, manifestIndex)
    if (!target) continue

    const targetPage = manifestIndex.canonicalByRoute.get(target.route)
    if (!targetPage) {
      errors.push(`${page.route} links to missing doc route ${target.route} via ${href}`)
      continue
    }

    if (target.anchor) {
      const anchors = manifestIndex.sourceAnchors.get(target.route) || new Set()
      if (!anchors.has(target.anchor)) {
        errors.push(`${page.route} links to missing anchor #${target.anchor} on ${target.route} via ${href}`)
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`)
  }
  process.exit(1)
}

console.log(`Validated internal markdown links across ${manifest.pages.length} canonical pages`)
