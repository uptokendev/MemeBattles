import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const manifestPath = path.join(contentDir, 'page-manifest.json')

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

  return {
    file,
    exactRoute,
    canonicalRoute
  }
}

function collectMarkdownRoutes() {
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
      routes.set(
        candidate.canonicalRoute,
        fs.existsSync(preferredExactFile) ? getRouteCandidates(preferredExactFile) : getRouteCandidates(preferredIndexFile)
      )
      continue
    }

    duplicates.push(`${candidate.canonicalRoute}: ${existing.file} and ${candidate.file}`)
  }

  return { routes, duplicates }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const pages = manifest.pages
const { routes, duplicates } = collectMarkdownRoutes()
const errors = []

if (duplicates.length > 0) {
  errors.push(`Duplicate canonical markdown routes detected: ${duplicates.join(' | ')}`)
}

const canonicalRouteCounts = new Map()
const titleCounts = new Map()
const sourceCounts = new Map()
const aliasCounts = new Map()
const canonicalRoutes = new Set()

for (const page of pages) {
  canonicalRoutes.add(page.route)
  canonicalRouteCounts.set(page.route, (canonicalRouteCounts.get(page.route) || 0) + 1)
  titleCounts.set(page.title, (titleCounts.get(page.title) || 0) + 1)
  sourceCounts.set(page.source, (sourceCounts.get(page.source) || 0) + 1)

  const sourceFile = path.join(contentDir, page.source)
  if (!fs.existsSync(sourceFile)) {
    errors.push(`Manifest source does not exist for canonical route ${page.route}: ${page.source}`)
  }

  const resolved = routes.get(page.route)
  if (!resolved) {
    errors.push(`Canonical route does not resolve to a markdown page: ${page.route}`)
  } else if (path.relative(contentDir, resolved.file).replace(/\\/g, '/') !== page.source) {
    errors.push(`Manifest source does not match the canonical markdown route for ${page.route}: expected ${path.relative(contentDir, resolved.file).replace(/\\/g, '/')} but found ${page.source}`)
  }

  for (const alias of page.aliases) {
    aliasCounts.set(alias, (aliasCounts.get(alias) || 0) + 1)

    if (alias === page.route) {
      errors.push(`Alias duplicates its canonical route: ${alias}`)
    }
  }
}

for (const [route, count] of canonicalRouteCounts.entries()) {
  if (count > 1) {
    errors.push(`Duplicate canonical route detected in manifest: ${route}`)
  }
}

for (const [title, count] of titleCounts.entries()) {
  if (count > 1) {
    errors.push(`Duplicate canonical title detected in manifest: ${title}`)
  }
}

for (const [source, count] of sourceCounts.entries()) {
  if (count > 1) {
    errors.push(`Duplicate manifest source detected: ${source}`)
  }
}

for (const [alias, count] of aliasCounts.entries()) {
  if (count > 1) {
    errors.push(`Duplicate alias route detected: ${alias}`)
  }

  if (canonicalRoutes.has(alias)) {
    errors.push(`Alias conflicts with a canonical route: ${alias}`)
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`)
  }
  process.exit(1)
}

console.log(
  `Validated ${pages.length} canonical manifest pages, ${aliasCounts.size} route aliases, and ${routes.size} canonical markdown routes`
)
