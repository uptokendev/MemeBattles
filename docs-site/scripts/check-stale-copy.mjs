import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')

const forbiddenPatterns = [
  {
    label: 'legacy BNB graduation claim',
    pattern: /\b50\s*BNB\s+graduation\b/i
  },
  {
    label: 'legacy initial graduation split',
    pattern: /\b80\s*%\s*LP\s*\/\s*20\s*%\s*creator\b/i
  },
  {
    label: 'legacy shorthand graduation split',
    pattern: /\b80\s*\/\s*20\s+graduation\b/i
  },
  {
    label: 'single-chain positioning',
    pattern: /\bBNB\s+only\b/i
  }
]

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.name.endsWith('.md')) return []
    return [full]
  })
}

const violations = []

for (const file of walk(contentDir)) {
  const rel = path.relative(contentDir, file).replace(/\\/g, '/')
  const raw = fs.readFileSync(file, 'utf8')

  for (const rule of forbiddenPatterns) {
    if (!rule.pattern.test(raw)) continue
    violations.push(`${rel}: ${rule.label}`)
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`ERROR: ${violation}`)
  }
  process.exit(1)
}

console.log(`Validated stale copy guardrails across ${walk(contentDir).length} markdown files`)
