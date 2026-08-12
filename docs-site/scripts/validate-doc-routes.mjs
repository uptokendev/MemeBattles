import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const sidebarPath = path.join(contentDir, 'sidebar.ts')
const loaderPath = path.join(contentDir, 'loader.ts')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.name.endsWith('.md')) return []
    return [full]
  })
}

function getRouteCandidates(file) {
  const rel = path.relative(contentDir, file).replace(/\\/g, '/')
  const slug = rel.replace(/\.md$/, '')
  const exactRoute = `/${slug}`
  const canonicalRoute = exactRoute.replace(/\/index$/, '') || '/'
  const isIndexVariant = exactRoute.endsWith('/index')

  return {
    file,
    exactRoute,
    canonicalRoute,
    isIndexVariant
  }
}

function collectRoutes() {
  const routes = new Map()
  const duplicates = []

  for (const file of walk(contentDir)) {
    const candidate = getRouteCandidates(file)
    const existing = routes.get(candidate.canonicalRoute)

    if (!existing) {
      routes.set(candidate.canonicalRoute, candidate)
      continue
    }

    const exactCanonicalPath = `${candidate.canonicalRoute === '/' ? '' : candidate.canonicalRoute}.md`
    const preferredExactFile = path.join(contentDir, exactCanonicalPath.replace(/^\//, ''))
    const preferredIndexFile = path.join(contentDir, candidate.canonicalRoute.replace(/^\//, ''), 'index.md')
    const allowedPair = [existing.file, candidate.file].sort().join('|') === [preferredExactFile, preferredIndexFile].sort().join('|')

    if (allowedPair) {
      const preferred = fs.existsSync(preferredExactFile)
        ? getRouteCandidates(preferredExactFile)
        : getRouteCandidates(preferredIndexFile)
      routes.set(candidate.canonicalRoute, preferred)
      continue
    }

    duplicates.push(`${candidate.canonicalRoute}: ${existing.file} and ${candidate.file}`)
  }

  return { routes, duplicates }
}

function parseSidebarItems() {
  const raw = fs.readFileSync(sidebarPath, 'utf8')
  const itemPattern = /\{\s*title:\s*'([^']+)'\s*,\s*href:\s*'([^']+)'\s*\}/g
  const items = []
  let match

  while ((match = itemPattern.exec(raw))) {
    items.push({
      title: match[1],
      href: match[2]
    })
  }

  return items
}

function parseAliases() {
  const raw = fs.readFileSync(loaderPath, 'utf8')
  const aliasBlockMatch = raw.match(/const routeAliases: Record<string, string> = \{([\s\S]*?)\n\}/)
  if (!aliasBlockMatch) return []

  const aliasPattern = /'([^']+)':\s*'([^']+)'/g
  const aliases = []
  let match

  while ((match = aliasPattern.exec(aliasBlockMatch[1]))) {
    aliases.push({
      from: match[1],
      to: match[2]
    })
  }

  return aliases
}

const { routes, duplicates } = collectRoutes()
const sidebarItems = parseSidebarItems()
const aliases = parseAliases()
const errors = []

if (duplicates.length > 0) {
  errors.push(`Duplicate canonical markdown routes detected: ${duplicates.join(' | ')}`)
}

const sidebarHrefCounts = new Map()
const sidebarTitleCounts = new Map()

for (const item of sidebarItems) {
  sidebarHrefCounts.set(item.href, (sidebarHrefCounts.get(item.href) || 0) + 1)
  sidebarTitleCounts.set(item.title, (sidebarTitleCounts.get(item.title) || 0) + 1)

  if (!routes.has(item.href)) {
    errors.push(`Sidebar route does not resolve to a markdown page: ${item.href}`)
  }
}

for (const [href, count] of sidebarHrefCounts.entries()) {
  if (count > 1) {
    errors.push(`Duplicate sidebar href detected: ${href}`)
  }
}

for (const [title, count] of sidebarTitleCounts.entries()) {
  if (count > 1) {
    errors.push(`Duplicate sidebar title detected: ${title}`)
  }
}

const aliasSources = new Map()

for (const alias of aliases) {
  aliasSources.set(alias.from, (aliasSources.get(alias.from) || 0) + 1)

  if (!routes.has(alias.to)) {
    errors.push(`Alias target does not resolve to a markdown page: ${alias.from} -> ${alias.to}`)
  }

  if (!sidebarHrefCounts.has(alias.to)) {
    errors.push(`Alias target is not a canonical sidebar route: ${alias.from} -> ${alias.to}`)
  }
}

for (const [aliasRoute, count] of aliasSources.entries()) {
  if (count > 1) {
    errors.push(`Duplicate alias route detected: ${aliasRoute}`)
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`)
  }
  process.exit(1)
}

console.log(
  `Validated ${sidebarItems.length} canonical sidebar entries, ${aliases.length} route aliases, and ${routes.size} canonical markdown routes`
)
