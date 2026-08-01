import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { UserRepository } from '@/lib/db/queries/user'
import { getPublicAssetUrl, uploadPublicAsset } from '@/lib/storage'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const STAFF_ROLES = new Set(['ADMIN', 'EDITOR'])
const ASSET_KINDS = new Set(['eventImage', 'optionImage', 'teamLogo', 'sideCardImage'])

export async function POST(request: Request) {
  const currentUser = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  const role = String(currentUser?.role || '').toUpperCase()
  if (!currentUser || (!currentUser.is_admin && !STAFF_ROLES.has(role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  const kind = String(formData?.get('kind') || '')
  if (!(file instanceof File) || !ASSET_KINDS.has(kind)) {
    return NextResponse.json({ error: 'A valid image and asset type are required.' }, { status: 400 })
  }

  const extension = IMAGE_EXTENSIONS[file.type]
  const maxBytes = kind === 'sideCardImage' ? 2 * 1024 * 1024 : MAX_IMAGE_BYTES
  const sideCardTypeAccepted = kind !== 'sideCardImage' || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  if (!extension || !sideCardTypeAccepted || file.size <= 0 || file.size > maxBytes) {
    const error = kind === 'sideCardImage'
      ? 'Use a PNG, JPG, or WebP image up to 2 MB.'
      : 'Use a PNG, JPG, WebP, GIF, or AVIF image up to 8 MB.'
    return NextResponse.json({ error }, { status: 400 })
  }

  const storagePath = kind === 'sideCardImage'
    ? `home-featured/side-card-${randomUUID()}.${extension}`
    : `events/${currentUser.id}/${kind}/${randomUUID()}.${extension}`
  const { error } = await uploadPublicAsset(storagePath, await file.arrayBuffer(), {
    contentType: file.type,
    cacheControl: 'public, max-age=31536000, immutable',
    upsert: false,
  })
  if (error) {
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json({
    asset: {
      publicUrl: getPublicAssetUrl(storagePath),
      storagePath,
      fileName: file.name,
      contentType: file.type,
    },
  })
}
