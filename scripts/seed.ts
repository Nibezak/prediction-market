import { db } from '../src/lib/drizzle'
import { tags } from '../src/lib/db/schema/events/tables'

async function run() {
  console.log('Seeding tag categories...')
  const carouselTags = [
    { slug: 'politics', name: 'Politics' },
    { slug: 'crypto', name: 'Crypto & Web3' },
    { slug: 'sports', name: 'Sports' },
    { slug: 'ai', name: 'Artificial Intelligence' },
    { slug: 'pop-culture', name: 'Pop Culture' },
    { slug: 'mega', name: 'Mega Markets' },
  ]
  for (const tag of carouselTags) {
    await db.insert(tags).values({
      slug: tag.slug,
      name: tag.name,
    }).onConflictDoNothing()
  }

  console.log('Seeding completed successfully!')
  process.exit(0)
}

run().catch(console.error)
