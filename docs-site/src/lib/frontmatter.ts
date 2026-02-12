export type Frontmatter = Record<string, unknown>

/**
 * Tiny, browser-safe frontmatter parser.
 * Supports a minimal subset of YAML:
 *
 * ---
 * title: My Page
 * description: Short blurb
 * ---
 *
 * Everything after the closing --- is returned as `content`.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const input = raw ?? ''

  // Must start with frontmatter fence.
  if (!input.startsWith('---\n') && !input.startsWith('---\r\n')) {
    return { data: {}, content: input }
  }

  // Find the closing fence on its own line.
  const fence = /\r?\n---\r?\n/
  const m = fence.exec(input)
  if (!m) return { data: {}, content: input }

  const fmBlock = input.slice(4, m.index) // strip leading "---\n"
  const rest = input.slice(m.index + m[0].length)

  const data: Frontmatter = {}
  for (const line of fmBlock.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    data[key] = value
  }

  return { data, content: rest }
}
