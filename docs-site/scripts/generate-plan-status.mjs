import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'dist')
const manifestPath = path.join(root, 'src', 'content', 'page-manifest.json')
const factMatrixPath = path.join(root, 'src', 'content', 'internal', 'fact-matrix.json')
const repoRoot = path.resolve(root, '..')

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath))
}

function existsRepo(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath))
}

function hasManifestRoute(route) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  return manifest.pages.some((page) => page.route === route)
}

if (!fs.existsSync(outDir)) {
  throw new Error('dist does not exist. Run the Vite build before generating plan status artifacts.')
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const factMatrix = JSON.parse(fs.readFileSync(factMatrixPath, 'utf8'))

const phaseStatus = [
  {
    phase: 'Phase 0',
    title: 'Restore the command shell',
    status: exists('scripts/assert-dist-shell.mjs') && exists('scripts/smoke-deep-links.mjs') ? 'done' : 'open',
    notes: [
      'Root shell assertion exists',
      'Netlify SPA fallback exists',
      'Production deploy still requires a fresh docs-site release'
    ]
  },
  {
    phase: 'Phase 1',
    title: 'Freeze intelligence and facts',
    status: exists('src/content/internal/fact-matrix.json') && exists('src/components/ReadinessBanner.tsx') ? 'partial' : 'open',
    notes: [
      `Fact matrix entries: ${factMatrix.facts.length}`,
      'Readiness banner exists',
      'Owner sign off and evidence refresh still open'
    ]
  },
  {
    phase: 'Phase 2',
    title: 'Rebuild navigation and docs engine',
    status: exists('src/content/page-manifest.json') && exists('scripts/validate-doc-routes.mjs') ? 'done' : 'open',
    notes: [
      `Canonical pages in manifest: ${manifest.pages.length}`,
      'Sidebar and prev next derive from the manifest',
      'Sitemap and docs feed derive from canonical pages'
    ]
  },
  {
    phase: 'Phase 3',
    title: 'Publish the core cross chain field manual',
    status: hasManifestRoute('/platform/campaign-lifecycle') && hasManifestRoute('/platform/graduation') ? 'partial' : 'open',
    notes: [
      'Core BNB manual pages exist',
      'Chain split wording has improved',
      'Solana and post graduation detail still need expansion'
    ]
  },
  {
    phase: 'Phase 4',
    title: 'Document creator and trader operations',
    status: hasManifestRoute('/creators/create-a-campaign') && hasManifestRoute('/traders/trading-basics') ? 'partial' : 'open',
    notes: [
      'Creator and trader guides exist',
      'Draft, Direct, and War Trade Room state coverage remain incomplete'
    ]
  },
  {
    phase: 'Phase 5',
    title: 'Document leagues, rewards and command center',
    status: hasManifestRoute('/leagues') && hasManifestRoute('/rewards/epochs-and-claims') ? 'partial' : 'open',
    notes: [
      'League and reward pages exist',
      'Command Center and monthly sealing detail still need buildout'
    ]
  },
  {
    phase: 'Phase 6',
    title: 'Document the post grad battlefield',
    status: 'open',
    notes: [
      'Arena, battles, events, tournaments, war pools, and sponsorship docs are not yet in the public manifest'
    ]
  },
  {
    phase: 'Phase 7',
    title: 'Open the Solana front',
    status: existsRepo('docs/solana/devnet-go-live-status.md') ? 'partial' : 'open',
    notes: [
      'Solana evidence exists in the repo',
      'Public Solana docs are not yet in the docs-site manifest'
    ]
  },
  {
    phase: 'Phase 8',
    title: 'Validate, deploy and hold the line',
    status: exists('scripts/check-doc-links.mjs') && exists('scripts/check-stale-copy.mjs') && exists('scripts/generate-doc-coverage.mjs') ? 'partial' : 'open',
    notes: [
      'Route, link, stale copy, shell, and coverage controls exist',
      'Production deep link verification still depends on redeploy'
    ]
  }
]

const closeout = [
  {
    gate: 'Shell',
    status: 'partial',
    note: 'Repo side controls exist, production still serves the old crawler page'
  },
  {
    gate: 'Architecture',
    status: 'done',
    note: 'One manifest drives routes, navigation, aliases, sitemap, and feed'
  },
  {
    gate: 'Coverage',
    status: 'partial',
    note: 'Coverage artifacts exist, but post grad and Solana surfaces are not fully represented'
  },
  {
    gate: 'Quality',
    status: 'partial',
    note: 'Local build controls exist, production deep link pass is still open'
  }
]

const summary = {
  generatedAt: new Date().toISOString(),
  netlifyOnly: true,
  totalCanonicalPages: manifest.pages.length,
  totalFacts: factMatrix.facts.length
}

fs.writeFileSync(
  path.join(outDir, 'docs-plan-status.json'),
  `${JSON.stringify({ summary, phaseStatus, closeout }, null, 2)}\n`
)

const markdown = [
  '# Docs Plan Status',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  `Canonical pages: ${summary.totalCanonicalPages}`,
  `Fact entries: ${summary.totalFacts}`,
  `Deployment target: Netlify`,
  '',
  '## Phases',
  ...phaseStatus.flatMap((phase) => [
    `- ${phase.phase} | ${phase.status} | ${phase.title}`,
    ...phase.notes.map((note) => `  ${note}`)
  ]),
  '',
  '## Closeout',
  ...closeout.map((gate) => `- ${gate.gate} | ${gate.status} | ${gate.note}`),
  ''
].join('\n')

fs.writeFileSync(path.join(outDir, 'docs-plan-status.md'), `${markdown}\n`)

console.log(`Generated docs plan status artifacts for ${phaseStatus.length} phases`)
