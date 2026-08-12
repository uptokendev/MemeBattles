import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const redirectsPath = path.join(root, 'public', '_redirects')
const netlifyConfigPath = path.join(root, 'netlify.toml')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return [full]
  })
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(fs.existsSync(distDir), 'dist does not exist. Run the build before asserting the shell output.')

const rootIndexPath = path.join(distDir, 'index.html')
assert(fs.existsSync(rootIndexPath), 'dist/index.html is missing')

const nestedIndexes = walk(distDir).filter((file) => {
  if (file === rootIndexPath) return false
  return path.basename(file) === 'index.html'
})

assert(
  nestedIndexes.length === 0,
  `Nested route index.html files are not allowed in dist: ${nestedIndexes.map((file) => path.relative(distDir, file)).join(', ')}`
)

const rootIndex = fs.readFileSync(rootIndexPath, 'utf8')
assert(!rootIndex.includes('crawler-note'), 'Root application shell still contains crawler-only markup')
assert(!rootIndex.includes('Static crawler version.'), 'Root application shell still contains crawler-only copy')

for (const asset of ['logo.png', 'favicon.ico']) {
  assert(fs.existsSync(path.join(distDir, asset)), `Missing required public asset in dist: ${asset}`)
}

assert(fs.existsSync(redirectsPath), 'public/_redirects is missing')
assert(
  fs.readFileSync(redirectsPath, 'utf8').includes('/* /index.html 200'),
  'Netlify SPA fallback is missing from public/_redirects'
)

assert(fs.existsSync(netlifyConfigPath), 'netlify.toml is missing')
const netlifyConfig = fs.readFileSync(netlifyConfigPath, 'utf8')
assert(netlifyConfig.includes('publish = "dist"'), 'Netlify publish directory is not set to dist')

console.log('Verified the docs shell build output and Netlify deployment rewrites')
