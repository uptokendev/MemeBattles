import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
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

async function withServer(run) {
  const server = createServer()
  await new Promise((resolve) => server.listen(4174, '127.0.0.1', resolve))

  try {
    await run()
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

async function runShellOnlySmoke(sampleRoutes) {
  const profiles = [
    {
      name: 'desktop',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
    },
    {
      name: 'mobile',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
    }
  ]

  await withServer(async () => {
    for (const profile of profiles) {
      for (const route of sampleRoutes) {
        const response = await fetch(`http://127.0.0.1:4174${route}`, {
          headers: {
            'user-agent': profile.userAgent
          }
        })

        const html = await response.text()

        assert(response.ok, `Deep-link shell smoke failed for ${route} at ${profile.name}: expected HTTP 200`)
        assert(html.includes('<div id="root"></div>'), `Deep-link shell smoke failed for ${route} at ${profile.name}: SPA root shell was not served`)
        assert(!html.includes('crawler-note'), `Deep-link shell smoke failed for ${route} at ${profile.name}: crawler-only markup was served`)
        assert(!html.includes('Static crawler version.'), `Deep-link shell smoke failed for ${route} at ${profile.name}: crawler-only copy was served`)
      }
    }
  })

  console.log(`Deep-link shell smoke passed for ${sampleRoutes.length} nested routes on desktop and mobile`)
  console.log('Playwright not installed. Ran shell-only route verification.')
}

async function runBrowserSmoke(sampleRoutes, chromium) {
  await withServer(async () => {
    let browser

    try {
      browser = await chromium.launch({ headless: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('Executable doesn\'t exist')) {
        throw new Error('Playwright browser runtime is missing. Run npx playwright install chromium and retry.')
      }
      throw error
    }

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
    }
  })

  console.log(`Deep-link smoke passed for ${sampleRoutes.length} nested routes on desktop and mobile`)
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
      return null
    }
    throw error
  }
}

async function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error('dist does not exist. Run the build before the deep-link smoke test.')
  }

  const sampleRoutes = extractNestedRoutes()
  if (sampleRoutes.length < 3) {
    throw new Error('Need at least three nested canonical routes for the deep-link smoke test.')
  }

  const playwright = await loadPlaywright()
  if (!playwright?.chromium) {
    await runShellOnlySmoke(sampleRoutes)
    return
  }

  await runBrowserSmoke(sampleRoutes, playwright.chromium)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
