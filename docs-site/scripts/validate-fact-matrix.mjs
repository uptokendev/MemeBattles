import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const matrixPath = path.join(root, 'src', 'content', 'internal', 'fact-matrix.json')
const repoRoot = path.resolve(root, '..')

const allowedStatuses = new Set(['active', 'planned', 'partial', 'historical'])
const allowedVisibility = new Set(['public', 'internal'])

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(fs.existsSync(matrixPath), 'Fact matrix is missing at src/content/internal/fact-matrix.json')

const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
assert(Array.isArray(matrix.facts), 'Fact matrix must expose a facts array')

const seenIds = new Set()

for (const fact of matrix.facts) {
  assert(typeof fact.id === 'string' && fact.id.length > 0, 'Each fact must define a non empty id')
  assert(!seenIds.has(fact.id), `Duplicate fact id detected: ${fact.id}`)
  seenIds.add(fact.id)

  for (const field of ['label', 'value', 'unit', 'environment', 'status', 'visibility', 'owner']) {
    assert(typeof fact[field] === 'string' && fact[field].length > 0, `Fact ${fact.id} is missing ${field}`)
  }

  assert(allowedStatuses.has(fact.status), `Fact ${fact.id} uses unsupported status ${fact.status}`)
  assert(allowedVisibility.has(fact.visibility), `Fact ${fact.id} uses unsupported visibility ${fact.visibility}`)
  assert(Array.isArray(fact.evidence) && fact.evidence.length > 0, `Fact ${fact.id} must include evidence paths`)

  for (const evidencePath of fact.evidence) {
    if (evidencePath.endsWith('.docx')) continue
    const fullPath = path.join(repoRoot, evidencePath)
    assert(fs.existsSync(fullPath), `Fact ${fact.id} points to missing evidence path ${evidencePath}`)
  }
}

console.log(`Validated fact matrix with ${matrix.facts.length} fact entries`)
