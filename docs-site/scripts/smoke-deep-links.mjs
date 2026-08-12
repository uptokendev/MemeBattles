import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const sidebarPath = path.join(root, 'src', 'content', 'sidebar.ts')

function extractNestedRoutes() {
  const raw = fs.readFileSync(sidebarPath, 'utf8')
  const itemPattern = /\{\s*title:\s*'([^']+)'\s*,\s*href:\s*'([^']+)'\s*\}/g
  const routes = []
  let match

  while ((match = itemPattern.exec(raw))) {
    const route = match[2]
    if (route.split('/').filter(Boolean).length >= 2) {
      routes.push(route)
    }
  }

  return Array.from(new Set(routes)).slice(0, 3)
}

function contentTypeFor(file) {
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.json')) return 'application/json; charset=utf-8'
  if (file.endsWith('.svg')) return 'image/svg+xml'
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.ico')) return 'image/x-icon'
  if (file.endsWith('.xml')) return 'application/xml; charset=utf-8'
  return 'text/html; charset=utf-8'
}

function createServer() {
  const rootIndexPath = path.join(distDir, 'index.html')

  return http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    const candidatePath = path.join(distDir, pathname.replace(/^\/+/, ''))
    let filePath = candidatePath

    if (pathname.endsWith('/')) {
      filePath = path.join(candidatePath, 'index.html')
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'content-type': contentTypeFor(filePath) })
      res.end(fs.readFileSync(filePath))
      return
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(fs.readFileSync(rootIndexPath))
  })
}

async function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error('dist does not exist. Run the build before the deep-link smoke test.')
  }

  const sampleRoutes = extractNestedRoutes()
  if (sampleRoutes.length < 3) {
    throw new Error('Need at least three nested canonical routes for the deep-link smoke test.')
  }

  const server = createServer()
  await new Promise((resolve) => server.listen(4174, '127.0.0.1', resolve))

  const browser = await chromium.launch({ headless: true })

  try {
    const viewports = [
      { name: 'desktop', width: 1440, height: 960 },
      { name: 'mobile', width: 390, height: 844 }
    ]

    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport })

      for (const route of sampleRoutes) {
        const page = await context.newPage()
        await page.goto(`http://127.0.0.1:4174${route}`, { waitUntil: 'networkidle' })

        const pageTitle = (await page.locator('h1').first().textContent())?.trim()
        if (!pageTitle || pageTitle === 'Page not found') {
          throw new Error(`Cold load failed for ${route} at ${viewport.name}: page content did not resolve`)
        }

        if (!(await page.locator('img[alt="MemeWarzone"]').first().isVisible())) {
          throw new Error(`Cold load failed for ${route} at ${viewport.name}: top bar logo is missing`)
        }

        if (viewport.name === 'desktop') {
          if (!(await page.locator('input[placeholder="Search docs…"]').first().isVisible())) {
            throw new Error(`Cold load failed for ${route} at desktop: sidebar search is missing`)
          }
        } else {
          const toggle = page.locator('button[aria-label="Toggle navigation"]').first()
          if (!(await toggle.isVisible())) {
            throw new Error(`Cold load failed for ${route} at mobile: mobile menu button is missing`)
          }
          await toggle.click()
          if (!(await page.locator('input[placeholder="Search docs…"]').first().isVisible())) {
            throw new Error(`Cold load failed for ${route} at mobile: mobile navigation did not open`)
          }
        }

        const prevNextCount = await page.locator('text=Previous').count() + await page.locator('text=Next').count()
        if (prevNextCount === 0) {
          throw new Error(`Cold load failed for ${route} at ${viewport.name}: previous and next controls are missing`)
        }

        await page.close()
      }

      await context.close()
    }
  } finally {
    await browser.close()
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }

  console.log(`Deep-link smoke passed for ${sampleRoutes.length} nested routes on desktop and mobile`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
