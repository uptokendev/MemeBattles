import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const outDir = path.join(root, 'dist')
const siteUrl = process.env.DOCS_SITE_URL || 'https://docs.memewar.zone'

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const slugify = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.name.endsWith('.md')) return []
    return [full]
  })
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, content: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { data: {}, content: raw }
  const fm = raw.slice(3, end).trim()
  const content = raw.slice(end + 4).trim()
  const data = {}
  for (const line of fm.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '')
    data[key] = value
  }
  return { data, content }
}

function markdownToHtml(md) {
  const lines = md.split('\n')
  const html = []
  let listType = null
  let inCode = false
  let code = []

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = []
        inCode = false
      } else {
        closeList()
        inCode = true
      }
      continue
    }

    if (inCode) {
      code.push(rawLine)
      continue
    }

    if (!line.trim()) {
      closeList()
      continue
    }

    const heading = /^(#{2,4})\s+(.+)$/.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length
      const text = heading[2].trim()
      html.push(`<h${level} id="${slugify(text)}">${escapeHtml(text)}</h${level}>`)
      continue
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line.trim())
    if (unordered) {
      if (listType !== 'ul') {
        closeList()
        listType = 'ul'
        html.push('<ul>')
      }
      html.push(`<li>${escapeHtml(unordered[1])}</li>`)
      continue
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line.trim())
    if (ordered) {
      if (listType !== 'ol') {
        closeList()
        listType = 'ol'
        html.push('<ol>')
      }
      html.push(`<li>${escapeHtml(ordered[1])}</li>`)
      continue
    }

    closeList()
    html.push(`<p>${escapeHtml(line)}</p>`)
  }

  closeList()
  return html.join('\n')
}

function routeFromFile(file) {
  const rel = path.relative(contentDir, file).replace(/\\/g, '/')
  const slug = rel.replace(/\.md$/, '')
  return `/${slug}`.replace(/\/index$/, '')
}

function pageTemplate({ title, description, route, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | MemeWarzone Docs</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${siteUrl}${route}" />
  <style>
    body{margin:0;background:#0b0d10;color:#f2f2ee;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.65;padding:32px;max-width:920px}a{color:#ff8a2a}main{border:1px solid rgba(84,93,105,.35);border-radius:24px;padding:28px;background:linear-gradient(180deg,rgba(20,24,30,.9),rgba(13,16,20,.9))}h1,h2,h3{line-height:1.15}h1{font-size:40px}h2{margin-top:42px;color:#ff8a2a}p,li{color:#d8dde5}pre{overflow:auto;background:#080a0d;border-radius:14px;padding:14px}.crawler-note{margin-bottom:16px;color:#b5bcc6;font-size:14px}
  </style>
</head>
<body>
  <main>
    <p class="crawler-note">Static crawler version. Interactive docs are available at <a href="${route}">${siteUrl}${route}</a>.</p>
    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    ${body}
  </main>
</body>
</html>`
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const pages = walk(contentDir)
  .map((file) => {
    const raw = fs.readFileSync(file, 'utf8')
    const { data, content } = parseFrontmatter(raw)
    const route = routeFromFile(file)
    return {
      route,
      title: data.title || route.replace(/^\//, '') || 'Introduction',
      description: data.description || '',
      content,
      html: markdownToHtml(content)
    }
  })
  .sort((a, b) => a.route.localeCompare(b.route))

for (const page of pages) {
  const targetDir = path.join(outDir, page.route)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(path.join(targetDir, 'index.html'), pageTemplate({ ...page, body: page.html }))
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
  .map((p) => `  <url><loc>${siteUrl}${p.route}</loc></url>`)
  .join('\n')}\n</urlset>\n`
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap)

const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<docs generated="${new Date().toISOString()}">\n${pages
  .map(
    (p) => `  <page>\n    <loc>${siteUrl}${p.route}</loc>\n    <title>${escapeHtml(p.title)}</title>\n    <description>${escapeHtml(p.description)}</description>\n    <content>${escapeHtml(p.content)}</content>\n  </page>`
  )
  .join('\n')}\n</docs>\n`
fs.writeFileSync(path.join(outDir, 'docs-feed.xml'), feed)

console.log(`Generated ${pages.length} static doc pages, sitemap.xml, and docs-feed.xml`)
