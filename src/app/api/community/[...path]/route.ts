import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/drizzle'
import { events, markets } from '@/lib/db/schema/events/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { eq, or } from 'drizzle-orm'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const getAmmUrl = () => process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const LIKE_EMOJI = '\u{1F44D}'
const getServiceHeaders = (input: { url: string, method?: string, body?: string | null, extra?: Record<string, string> }) => {
  const tellwiseSecret = process.env.TELLWISE_SECRET || 'tellwise_super_secret_bypass_key_123'
  return signSlimefishBackendRequest({
    url: input.url,
    method: input.method,
    body: input.body,
    headers: {
    'x-tellwise-secret': tellwiseSecret,
      ...input.extra,
    },
  })
}

async function getMarketId(slug: string) {
  if (!slug) return undefined
  const [market] = await db
    .select({ condition_id: markets.condition_id })
    .from(markets)
    .leftJoin(events, eq(events.id, markets.event_id))
    .where(or(eq(markets.condition_id, slug), eq(markets.slug, slug), eq(events.slug, slug)))
    .limit(1)
  return market?.condition_id
}

async function getEventSlugForMarketId(marketId: string) {
  if (!marketId) return undefined
  const [row] = await db
    .select({ slug: events.slug })
    .from(markets)
    .leftJoin(events, eq(events.id, markets.event_id))
    .where(eq(markets.condition_id, marketId))
    .limit(1)
  return row?.slug
}

function isLikeReactionEmoji(emoji: unknown) {
  return emoji === LIKE_EMOJI || emoji === 'ðŸ‘'
}

function mapComment(pmComment: any, currentUserId?: string): any {
  return {
    id: pmComment.id,
    content: pmComment.content,
    user_id: pmComment.author?.id,
    username: pmComment.author?.username || 'Anonymous',
    user_avatar: pmComment.author?.avatarUrl || '',
    user_address: '',
    likes_count: pmComment.reactions?.filter((r: any) => isLikeReactionEmoji(r.emoji)).length || 0,
    replies_count: pmComment.replies?.length || 0,
    created_at: pmComment.createdAt,
    is_owner: currentUserId === pmComment.author?.id,
    user_has_liked: pmComment.reactions?.some((r: any) => isLikeReactionEmoji(r.emoji) && r.user.id === currentUserId) || false,
    recent_replies: (pmComment.replies || []).map((r: any) => mapComment(r, currentUserId)),
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  const path = resolvedParams.path.join('/')
  const url = new URL(req.url)
  const ammUrl = getAmmUrl()
  
  // Try to parse headers safely, as Slimefish ledger might expect standard auth
  let currentUserId: string | undefined
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    currentUserId = session?.user?.id
  } catch (e) {
    // Ignore
  }

  if (path === 'comments') {
    const eventSlug = url.searchParams.get('event_slug')
    if (!eventSlug) return NextResponse.json({ error: 'event_slug required' }, { status: 400 })

    const marketId = await getMarketId(eventSlug)
    if (!marketId) return NextResponse.json({ pages: [[]], pageParams: [0] })

    const commentsUrl = `${ammUrl}/markets/${marketId}/comments`
    const res = await fetch(commentsUrl, { headers: getServiceHeaders({ url: commentsUrl }) })
    if (!res.ok) return NextResponse.json({ pages: [[]], pageParams: [0] })
    
    const json = await res.json()

    const slimefishBackendComments = json.data || []

    const mapped = slimefishBackendComments
      .filter((c: any) => !c.parentId) // only top level
      .map((c: any) => mapComment({ ...c, replies: slimefishBackendComments.filter((r: any) => r.parentId === c.id) }, currentUserId))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    return NextResponse.json({ pages: [mapped], pageParams: [0] })
  }
  
  if (path === 'comments/metrics') {
    return NextResponse.json({ comments_count: 0 })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  const path = resolvedParams.path.join('/')
  const ammUrl = getAmmUrl()
  
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let currentUserId = session.user.id
  const syncUrl = `${ammUrl}/users/sync`
  const syncBody = JSON.stringify({
    id: session.user.id,
    email: session.user.email,
    username: session.user.name || `slimefish_${session.user.id.slice(0, 8)}`,
  })
  const syncResponse = await fetch(syncUrl, {
    method: 'POST',
    headers: getServiceHeaders({ url: syncUrl, method: 'POST', body: syncBody, extra: { 'Content-Type': 'application/json' } }),
    body: syncBody,
  })
  if (syncResponse.ok) {
    const synced = await syncResponse.json()
    currentUserId = synced.userId || synced.user?.id || currentUserId
  }

  if (path === 'comments') {
    const body = await req.json()
    const { event_slug, content, parent_comment_id } = body
    
    const marketId = await getMarketId(event_slug)
    if (!marketId) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    
    let replyRecipientId: string | null = null
    if (parent_comment_id) {
      const commentsUrl = `${ammUrl}/markets/${marketId}/comments`
      const commentsResponse = await fetch(commentsUrl, { headers: getServiceHeaders({ url: commentsUrl }) })
      if (commentsResponse.ok) {
        const commentsPayload = await commentsResponse.json().catch(() => null)
        const parent = (Array.isArray(commentsPayload?.data) ? commentsPayload.data : [])
          .find((comment: any) => comment.id === parent_comment_id)
        replyRecipientId = parent?.author?.id ?? parent?.authorId ?? null
      }
    }

    const pmBody = {
      content,
      parentId: parent_comment_id || null,
      entityType: 'MARKET',
      entityId: marketId,
    }
    
    // Call SlimefishBackend using bypass headers since cookie forwarding might fail across domains
    const createCommentUrl = `${ammUrl}/comments`
    const createCommentBody = JSON.stringify(pmBody)
    const res = await fetch(createCommentUrl, {
      method: 'POST',
      headers: getServiceHeaders({ url: createCommentUrl, method: 'POST', body: createCommentBody, extra: {
        'Content-Type': 'application/json',
        'x-tellwise-user-id': currentUserId,
      } }),
      body: createCommentBody,
    })
    
    if (!res.ok) {
      const details = await res.json().catch(() => null)
      const message = details?.error?.message || details?.error || details?.message || 'Failed to post comment'
      return NextResponse.json({ error: message }, { status: res.status })
    }
    const json = await res.json()

    await recordAuditEvent({ eventType: parent_comment_id ? 'community.reply.created' : 'community.comment.created', category: 'community', action: parent_comment_id ? 'Replied to a market comment' : 'Created a market comment', actorUserId: currentUserId, subjectUserId: replyRecipientId, entityType: 'comment', entityId: json.data?.id, metadata: { marketId, eventSlug: event_slug, parentCommentId: parent_comment_id || null, contentLength: String(content || '').length }, ...requestAuditContext(req.headers) })

    if (replyRecipientId && replyRecipientId !== currentUserId) {
      const actorName = (session.user as any).username || session.user.name || 'Someone'
      await db.insert(notifications).values({
        user_id: replyRecipientId,
        category: 'comment_reply',
        title: `${actorName} replied to your comment`,
        description: String(content).slice(0, 180),
        metadata: { comment_id: json.data?.id, event_slug },
        link_type: 'internal',
        link_target: `/event/${event_slug}#${json.data?.id}`,
        link_url: `/event/${event_slug}#${json.data?.id}`,
        link_label: 'View reply',
      }).catch((error) => console.error('Failed to store reply notification', error))
    }
    
    const c = json.data
    c.author = { id: currentUserId, username: session.user.name, avatarUrl: session.user.image }
    return NextResponse.json(mapComment(c, currentUserId))
  }
  
  // comments/[id]/reactions
  const reactionMatch = path.match(/^comments\/([^\/]+)\/reactions$/) || path.match(/^comments\/([^\/]+)\/reaction$/)
  if (reactionMatch) {
    const commentId = reactionMatch[1]
    const reactionUrl = `${ammUrl}/comments/${commentId}/reaction`
    const reactionBody = JSON.stringify({ emoji: LIKE_EMOJI })
    const res = await fetch(reactionUrl, {
      method: 'POST',
      headers: getServiceHeaders({ url: reactionUrl, method: 'POST', body: reactionBody, extra: {
        'Content-Type': 'application/json',
        'x-tellwise-user-id': currentUserId,
      } }),
      body: reactionBody,
    })

    if (!res.ok) {
      const details = await res.json().catch(() => null)
      return NextResponse.json({ error: details?.error || 'Failed to toggle reaction' }, { status: res.status })
    }

    const commentUrl = `${ammUrl}/comments/${commentId}`
    const commentRes = await fetch(commentUrl, { headers: getServiceHeaders({ url: commentUrl }) }).catch(() => null)
    if (commentRes && commentRes.ok) {
      const commentJson = await commentRes.json().catch(() => null)
      if (commentJson?.data) {
        const reactions = Array.isArray(commentJson.data.reactions) ? commentJson.data.reactions : []
        const likes_count = reactions.filter((r: any) => isLikeReactionEmoji(r.emoji)).length
        const user_has_liked = reactions.some((r: any) => isLikeReactionEmoji(r.emoji) && (r.userId === currentUserId || r.user?.id === currentUserId))
        const recipientId = commentJson.data.author?.id ?? commentJson.data.authorId ?? null
        if (user_has_liked && recipientId && recipientId !== currentUserId) {
          const eventSlug = await getEventSlugForMarketId(commentJson.data.entityId).catch(() => undefined)
          const actorName = (session.user as any).username || session.user.name || 'Someone'
          await db.insert(notifications).values({
            user_id: recipientId,
            category: 'comment_reaction',
            title: `${actorName} liked your comment`,
            description: String(commentJson.data.content || '').slice(0, 180),
            metadata: { comment_id: commentId, event_slug: eventSlug ?? null, reaction: 'like' },
            link_type: 'internal',
            link_target: eventSlug ? `/event/${eventSlug}#${commentId}` : null,
            link_url: eventSlug ? `/event/${eventSlug}#${commentId}` : null,
            link_label: 'View comment',
          }).catch((error) => console.error('Failed to store comment reaction notification', error))
        }
        return NextResponse.json({ likes_count, user_has_liked })
      }
    }

    return NextResponse.json({ likes_count: res.status === 204 ? 0 : 1, user_has_liked: res.status !== 204 })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
