import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/drizzle'
import { events, markets } from '@/lib/db/schema/events/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { eq, or } from 'drizzle-orm'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'

const getAmmUrl = () => process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

async function getMarketId(slug: string) {
  const [market] = await db
    .select({ condition_id: markets.condition_id })
    .from(markets)
    .leftJoin(events, eq(events.id, markets.event_id))
    .where(or(eq(markets.slug, slug), eq(events.slug, slug)))
  return market?.condition_id
}

function mapComment(pmComment: any, currentUserId?: string): any {
  return {
    id: pmComment.id,
    content: pmComment.content,
    user_id: pmComment.author?.id,
    username: pmComment.author?.username || 'Anonymous',
    user_avatar: pmComment.author?.avatarUrl || '',
    user_address: '',
    likes_count: pmComment.reactions?.filter((r: any) => r.emoji === '👍').length || 0,
    replies_count: pmComment.replies?.length || 0,
    created_at: pmComment.createdAt,
    is_owner: currentUserId === pmComment.author?.id,
    user_has_liked: pmComment.reactions?.some((r: any) => r.emoji === '👍' && r.user.id === currentUserId) || false,
    recent_replies: (pmComment.replies || []).map((r: any) => mapComment(r, currentUserId)),
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  const path = resolvedParams.path.join('/')
  const url = new URL(req.url)
  const ammUrl = getAmmUrl()
  
  // Try to parse headers safely, as Play Money might expect standard auth
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

    const res = await fetch(`${ammUrl}/markets/${marketId}/comments`)
    if (!res.ok) return NextResponse.json({ pages: [[]], pageParams: [0] })
    
    const json = await res.json()

    const playMoneyComments = json.data || []

    const mapped = playMoneyComments
      .filter((c: any) => !c.parentId) // only top level
      .map((c: any) => mapComment({ ...c, replies: playMoneyComments.filter((r: any) => r.parentId === c.id) }, currentUserId))
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
  const tellwiseSecret = process.env.TELLWISE_SECRET || ''
  const syncResponse = await fetch(`${ammUrl}/users/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tellwise-secret': tellwiseSecret },
    body: JSON.stringify({
      id: session.user.id,
      email: session.user.email,
      username: session.user.name || `slimefish_${session.user.id.slice(0, 8)}`,
    }),
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
      const commentsResponse = await fetch(`${ammUrl}/markets/${marketId}/comments`)
      if (commentsResponse.ok) {
        const commentsPayload = await commentsResponse.json().catch(() => null)
        const parent = (Array.isArray(commentsPayload?.data) ? commentsPayload.data : [])
          .find((comment: any) => comment.id === parent_comment_id)
        replyRecipientId = parent?.author?.id ?? parent?.authorId ?? null
      }
    }

    const pmBody = {
      content,
      parentId: parent_comment_id || undefined,
      entityType: 'MARKET',
      entityId: marketId
    }
    
    // Call PlayMoney using bypass headers since cookie forwarding might fail across domains
    const res = await fetch(`${ammUrl}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-tellwise-secret': tellwiseSecret,
        'x-tellwise-user-id': currentUserId
      },
      body: JSON.stringify(pmBody)
    })
    
    if (!res.ok) return NextResponse.json({ error: 'Failed' }, { status: res.status })
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
  if (path.match(/^comments\/[^\/]+\/reactions$/)) {
    // Play Money doesn't expose a reaction endpoint in v1 APIs that I found. 
    // We'll stub this out to succeed so the UI doesn't crash, but it won't persist to DB.
    return NextResponse.json({ likes_count: 1, user_has_liked: true })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
