import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const projectRoot = process.cwd()
const standaloneRoot = resolve(projectRoot, '.next', 'standalone')
const serverPath = resolve(standaloneRoot, 'server.js')
const staticSource = resolve(projectRoot, '.next', 'static')
const staticTarget = resolve(standaloneRoot, '.next', 'static')
const publicSource = resolve(projectRoot, 'public')
const publicTarget = resolve(standaloneRoot, 'public')

process.env.SKIP_STARTUP_WARMUP ??= 'true'

if (!existsSync(serverPath)) {
  throw new Error('Standalone build not found. Run `npm run build` before `npm start`.')
}

if (existsSync(staticSource)) {
  cpSync(staticSource, staticTarget, { recursive: true })
}

if (existsSync(publicSource)) {
  cpSync(publicSource, publicTarget, { recursive: true })
}

process.chdir(standaloneRoot)
await import(pathToFileURL(serverPath).href)

async function warmPublicCache() {
  if (process.env.STARTUP_WARMUP !== 'true') {
    return
  }

  const port = process.env.PORT || '3000'
  const origin = `http://127.0.0.1:${port}`
  const routes = [
    '/api/events?status=active&offset=0&locale=en&includeBookmarkState=false',
    '/en/sports/live',
    '/en',
  ]

  let warmed = 0
  for (const route of routes) {
    try {
      const response = await fetch(`${origin}${route}`, {
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      await response.arrayBuffer()
      warmed += 1
    }
    catch (error) {
      console.warn(`Failed to warm ${route}:`, error)
    }
  }

  console.log(`Warmed ${warmed}/${routes.length} public routes.`)
}

void warmPublicCache().catch((error) => {
  console.warn('Public route warmup failed:', error)
})
