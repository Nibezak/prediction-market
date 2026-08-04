import type { QueryResult } from '@/types'
import { and, desc, eq, sql } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import { cacheTags } from '@/lib/cache-tags'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { runQuery } from '@/lib/db/utils/run-query'
import { db } from '@/lib/drizzle'

export const NotificationRepository = {
  async getByUserId(user_id: string): Promise<QueryResult<typeof notifications.$inferSelect[]>> {
    return runQuery(async () => {
      const data = await db
        .select()
        .from(notifications)
        .where(eq(notifications.user_id, user_id))
        .orderBy(desc(notifications.created_at))

      return { data, error: null }
    })
  },

  async deleteById(notificationId: string, user_id: string): Promise<QueryResult<null>> {
    return runQuery(async () => {
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.user_id, user_id),
          ),
        )

      updateTag(cacheTags.notifications(user_id))

      return { data: null, error: null }
    })
  },

  async markAllReadByUserId(user_id: string): Promise<QueryResult<{ updated: number }>> {
    return runQuery(async () => {
      const rows = await db
        .update(notifications)
        .set({ read_at: new Date() })
        .where(
          and(
            eq(notifications.user_id, user_id),
            sql`${notifications.read_at} IS NULL`,
          ),
        )
        .returning({ id: notifications.id })

      updateTag(cacheTags.notifications(user_id))

      return { data: { updated: rows.length }, error: null }
    })
  },
}
