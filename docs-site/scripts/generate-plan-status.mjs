import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'dist')
const manifestPath = path.join(root, 'src', 'content', 'page-manifest.json')
const factMatrixPath = path.join(root, 'src', 'content', 'internal', 'fact-matrix.json')

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath))
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
      'Use the production deep link smoke after each release to confirm the live domain'
    ]
  },
  {
    phase: 'Phase 1',
    title: 'Freeze intelligence and facts',
    status: exists('src/content/internal/fact-matrix.json') && exists('src/components/ReadinessBanner.tsx') ? 'partial' : 'open',
    notes: [
      `Fact matrix entries: ${factMatrix.facts.length}`,
      'Readiness banner exists',
      'Owner sign off and evidence refresh remain open for deployment sensitive values'
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
    status: hasManifestRoute('/platform/chain-readiness') && hasManifestRoute('/platform/solana-operations') && hasManifestRoute('/platform/graduation') ? 'partial' : 'open',
    notes: [
      'Core BNB and Solana manual pages exist',
      'Historical graduation contradictions have been retired from the public manual',
      'Diagram and final evidence sign off still remain open'
    ]
  },
  {
    phase: 'Phase 4',
    title: 'Document creator and trader operations',
    status: hasManifestRoute('/creators/direct-and-draft') && hasManifestRoute('/creators/promotion-and-push-live') && hasManifestRoute('/traders/war-trade-room') ? 'partial' : 'open',
    notes: [
      'Creator launch route coverage exists for Direct, Draft, promotion, and Push Live',
      'War Trade Room state coverage exists',
      'Final screenshot and troubleshooting wave still remain open'
    ]
  },
  {
    phase: 'Phase 5',
    title: 'Document leagues, rewards and command center',
    status: hasManifestRoute('/command-center') && hasManifestRoute('/command-center/claims') && hasManifestRoute('/command-center/recruiter') ? 'partial' : 'open',
    notes: [
      'Command Center overview, recruiter, squad, airdrops, claims, coins, and settings pages exist',
      'League and reward coverage is public across weekly and monthly competition lanes',
      'Reward policy and jurisdiction sign off still remain open'
    ]
  },
  {
    phase: 'Phase 6',
    title: 'Document the post grad battlefield',
    status: hasManifestRoute('/arena') && hasManifestRoute('/arena/live-battles') && hasManifestRoute('/arena/events') ? 'partial' : 'open',
    notes: [
      'Arena, battles, Major War League, events, sponsorship, and War Pool pages exist',
      'Readiness labels distinguish live, partial, and planned surfaces',
      'Settlement proof and legal sign off still remain open for some battlefield surfaces'
    ]
  },
  {
    phase: 'Phase 7',
    title: 'Open the Solana front',
    status: hasManifestRoute('/platform/solana-operations') ? 'partial' : 'open',
    notes: [
      'Public Solana docs now cover the live create, trade, and UpVote route',
      'Graduation, reward parity, and post graduation routing gaps remain clearly marked where not proven',
      'Mainnet style copy is blocked from overstating unproven parity'
    ]
  },
  {
    phase: 'Phase 8',
    title: 'Validate, deploy and hold the line',
    status: exists('scripts/check-doc-links.mjs') && exists('scripts/check-stale-copy.mjs') && exists('scripts/generate-doc-coverage.mjs') ? 'partial' : 'open',
    notes: [
      'Route, link, stale copy, fact, shell, and coverage controls exist',
      'Production deep link smoke can be executed with the shipped test command',
      'Release review cadence and final asset completion still remain open'
    ]
  }
]

const closeout = [
  {
    gate: 'Shell',
    status: 'done',
    note: 'One SPA shell owns nested routes and the deep link smoke path is in place'
  },
  {
    gate: 'Architecture',
    status: 'done',
    note: 'One page manifest drives routes, navigation, aliases, sitemap, and feed'
  },
  {
    gate: 'Coverage',
    status: 'partial',
    note: 'Public coverage is broad, but screenshots, diagrams, and some legal or owner sign off remain open'
  },
  {
    gate: 'Quality',
    status: 'partial',
    note: 'Build controls are in place, but release discipline still depends on repeat smoke, visual review, and asset completion'
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
