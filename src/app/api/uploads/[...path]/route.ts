import type { NextRequest } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params

  if (!path || path.length === 0) {
    return new NextResponse('Not found', { status: 404 })
  }

  // Prevent path traversal
  const normalizedPath = path.join('/')
  if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
    return new NextResponse('Bad request', { status: 400 })
  }

  try {
    const publicDir = join(process.cwd(), 'public', 'uploads')
    const filePath = join(publicDir, normalizedPath)

    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      return new NextResponse('Not found', { status: 404 })
    }

    const file = await readFile(filePath)

    // Determine content type based on extension
    let contentType = 'application/octet-stream'
    if (filePath.endsWith('.png')) { contentType = 'image/png' }
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) { contentType = 'image/jpeg' }
    else if (filePath.endsWith('.webp')) { contentType = 'image/webp' }
    else if (filePath.endsWith('.svg')) { contentType = 'image/svg+xml' }
    else if (filePath.endsWith('.pdf')) { contentType = 'application/pdf' }

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }
  catch (error) {
    return new NextResponse('Not found', { status: 404 })
  }
}
