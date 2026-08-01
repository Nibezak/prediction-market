import { desc, eq, ilike, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { UserRepository } from '@/lib/db/queries/user'
import { users } from '@/lib/db/schema/auth/tables'
import { events } from '@/lib/db/schema/events/tables'
import { audit_events } from '@/lib/db/schema/risk/tables'
import { db } from '@/lib/drizzle'
import { getStaffPermissions, hasStaffPermission } from '@/lib/staff-permissions'

type SearchResult = {
  id: string
  type: 'Route' | 'User' | 'Market' | 'Audit'
  title: string
  subtitle: string
  href: string
  score: number
}

const adminRoutes = [
  ['Dashboard', '/admin/dashboard', 'Platform overview and live metrics', 'operations.view'],
  ['Market review', '/admin/market-review', 'Review staff and user market proposals', 'markets.view'],
  ['Events', '/admin/events', 'Manage active, closed, and resolved markets', 'markets.view'],
  ['Event calendar', '/admin/events/calendar', 'Calendar and market scheduling', 'markets.view'],
  ['Users', '/admin/users', 'Accounts, roles, blocks, and mirroring', 'users.view'],
  ['Risk signals', '/admin/risk', 'Fraud signals, holds, and investigations', 'risk.view'],
  ['Audit log', '/admin/audit', 'Search platform actions and request evidence', 'audit.view'],
  ['Finance and ledger', '/admin/finance', 'Balances, payments, and reconciliation', 'finance.view'],
  ['Approvals', '/admin/approvals', 'Governance and payout approvals', 'governance.approval.review'],
  ['Support', '/admin/support', 'Customer cases and account assistance', 'support.view'],
  ['Operations', '/admin/operations', 'Jobs, incidents, and maintenance', 'operations.view'],
  ['System health', '/admin/system', 'Service and dependency health', 'operations.health.view'],
  ['Access control', '/admin/access-control', 'Roles and granular permissions', 'users.permissions.manage'],
  ['Communications', '/admin/communications', 'Platform notifications and messages', 'community.notification.send'],
  ['Brand and settings', '/admin/settings', 'Brand, integrations, featured content, and geoblocking', 'settings.view'],
  ['Theme', '/admin/theme', 'Platform colors and appearance', 'settings.theme.manage'],
  ['Locales', '/admin/locales', 'Languages and translations', 'settings.locale.manage'],
  ['Categories', '/admin/categories', 'Market category management', 'markets.categories.manage'],
  ['Market context', '/admin/market-context', 'AI market context configuration', 'settings.ai.manage'],
  ['Affiliate and fees', '/admin/affiliate', 'AMM trade fees and affiliate sharing', 'settings.fees.manage'],
] as const

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim()
}

function editDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index)
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex]
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[second.length]
}

function fuzzyScore(query: string, value: string) {
  const normalizedQuery = normalize(query)
  const normalizedValue = normalize(value)
  if (normalizedValue === normalizedQuery) return 1
  if (normalizedValue.includes(normalizedQuery)) return 0.95
  const words = normalizedValue.split(' ')
  const nearest = Math.min(editDistance(normalizedQuery, normalizedValue), ...words.map(word => editDistance(normalizedQuery, word)))
  return 1 - nearest / Math.max(normalizedQuery.length, 1)
}

export async function GET(request: Request) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || getStaffPermissions(currentUser).length === 0) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  }

  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) ?? ''
  if (query.length < 2) {
    return NextResponse.json({ data: [] })
  }

  const results: SearchResult[] = adminRoutes
    .filter(([, , , permission]) => hasStaffPermission(currentUser, permission))
    .map(([title, href, subtitle]) => ({
      id: `route:${href}`,
      type: 'Route' as const,
      title,
      subtitle,
      href,
      score: fuzzyScore(query, `${title} ${subtitle}`),
    }))
    .filter(result => result.score >= 0.35)

  if (hasStaffPermission(currentUser, 'users.view') || hasStaffPermission(currentUser, 'users.search')) {
    const userRows = await db.select({
      id: users.id,
      email: users.email,
      username: users.username,
    })
      .from(users)
      .where(or(
        ilike(users.email, `%${query}%`),
        ilike(users.username, `%${query}%`),
        sql`similarity(lower(coalesce(${users.email}, '')), lower(${query})) > 0.18`,
        sql`similarity(lower(coalesce(${users.username}, '')), lower(${query})) > 0.18`,
      ))
      .limit(8)

    results.push(...userRows.map(user => ({
      id: `user:${user.id}`,
      type: 'User' as const,
      title: user.username?.trim() || user.email,
      subtitle: user.email,
      href: `/admin/users?search=${encodeURIComponent(user.email)}`,
      score: fuzzyScore(query, `${user.username ?? ''} ${user.email}`),
    })))
  }

  if (hasStaffPermission(currentUser, 'markets.view')) {
    const eventRows = await db.select({ id: events.id, title: events.title, slug: events.slug, status: events.status })
      .from(events)
      .where(or(
        ilike(events.title, `%${query}%`),
        ilike(events.slug, `%${query}%`),
        sql`similarity(lower(${events.title}), lower(${query})) > 0.18`,
      ))
      .limit(8)

    results.push(...eventRows.map(event => ({
      id: `market:${event.id.trim()}`,
      type: 'Market' as const,
      title: event.title,
      subtitle: `${event.status} market`,
      href: `/event/${event.slug}`,
      score: fuzzyScore(query, `${event.title} ${event.slug}`),
    })))
  }

  if (hasStaffPermission(currentUser, 'audit.view') || hasStaffPermission(currentUser, 'audit.search')) {
    const auditRows = await db.select({
      id: audit_events.id,
      action: audit_events.action,
      eventType: audit_events.event_type,
      ipAddress: audit_events.ip_address,
      outcome: audit_events.outcome,
    })
      .from(audit_events)
      .where(or(
        ilike(audit_events.action, `%${query}%`),
        ilike(audit_events.event_type, `%${query}%`),
        ilike(audit_events.ip_address, `%${query}%`),
        eq(audit_events.actor_user_id, query),
        eq(audit_events.subject_user_id, query),
      ))
      .orderBy(desc(audit_events.occurred_at))
      .limit(8)

    results.push(...auditRows.map(audit => ({
      id: `audit:${audit.id.trim()}`,
      type: 'Audit' as const,
      title: audit.action,
      subtitle: [audit.eventType, audit.ipAddress, audit.outcome].filter(Boolean).join(' · '),
      href: `/admin/audit?query=${encodeURIComponent(audit.ipAddress || audit.eventType || audit.action)}`,
      score: fuzzyScore(query, `${audit.action} ${audit.eventType} ${audit.ipAddress ?? ''}`),
    })))
  }

  const uniqueResults = Array.from(new Map(results.map(result => [result.id, result])).values())
    .sort((first, second) => second.score - first.score)
    .slice(0, 12)
    .map(({ score: _score, ...result }) => result)

  return NextResponse.json({ data: uniqueResults })
}
