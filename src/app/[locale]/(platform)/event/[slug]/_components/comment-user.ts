import type { Comment } from '@/types'
import { truncateAddress } from '@/lib/formatters'

type CommentUser = Pick<Comment, 'username' | 'user_proxy_wallet_address' | 'user_address'>

function normalizeUsername(value?: string | null) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('firebase:') || trimmed.includes('firebase:')) {
    return ''
  }
  return trimmed
}

export function resolveCommentUserIdentity(comment: CommentUser) {
  const username = normalizeUsername(comment.username)
  const address = comment.user_proxy_wallet_address ?? comment.user_address ?? ''
  const displayName = username || (address ? truncateAddress(address) : 'Trader')
  const profileSlug = username || (address || 'trader')

  return { displayName, profileSlug }
}
