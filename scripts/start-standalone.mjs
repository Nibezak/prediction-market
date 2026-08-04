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

function startNotificationWorker() {
  if (process.env.ENABLE_EMBEDDED_NOTIFICATION_WORKER !== 'true') return
  const secret = process.env.JOB_RUNNER_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  if (!secret) return
  const port = process.env.PORT || '3000'
  const endpoint = `http://127.0.0.1:${port}/api/internal/jobs/notifications`
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'x-worker-id': `standalone-${process.pid}` },
        signal: AbortSignal.timeout(25_000),
      })
    }
    catch (error) {
      console.warn('Notification worker tick failed:', error)
    }
    finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), 60_000)
  timer.unref()
  setTimeout(() => void tick(), 10_000).unref()
}

startNotificationWorker()
