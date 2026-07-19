'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/drizzle'
import { tags } from '@/lib/db/schema/events/tables'
import { UserRepository } from '@/lib/db/queries/user'
function slugify(text: string) { return text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-'); }

export async function createCategoryAction(data: { name: string; is_main_category: boolean }) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !currentUser.is_admin) {
    return { error: 'Unauthorized' }
  }

  const slug = slugify(data.name)

  try {
    const existing = await db.query.tags.findFirst({
      where: eq(tags.slug, slug)
    })

    if (existing) {
      return { error: 'A category with this name or slug already exists.' }
    }

    await db.insert(tags).values({
      name: data.name,
      slug: slug,
      is_main_category: data.is_main_category,
    })

    revalidatePath('/[locale]/admin/categories', 'page')
    return { success: true }
  } catch (error) {
    console.error('Error creating category:', error)
    return { error: 'Failed to create category.' }
  }
}

