import { db } from '../src/lib/drizzle'
import { sql } from 'drizzle-orm'
import { events, markets, outcomes, event_tags, tags, conditions } from '../src/lib/db/schema/events/tables'
import { users } from '../src/lib/db/schema/auth/tables'

async function run() {
  console.log('Seeding fake users...')
  for (let i = 0; i < 100; i++) {
    const id = `user_${Date.now()}_${i}`
    await db.insert(users).values({
      id,
      username: `trader_${Math.floor(Math.random() * 100000)}`,
      email: `trader_${i}@example.com`,
      address: `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}`,
      deposit_wallet_address: `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}`,
    }).onConflictDoNothing()
  }

  console.log('Seeding tag categories...')
  const carouselTags = [
    { slug: 'politics', name: 'Politics' },
    { slug: 'crypto', name: 'Crypto & Web3' },
    { slug: 'sports', name: 'Sports' },
    { slug: 'ai', name: 'Artificial Intelligence' },
    { slug: 'pop-culture', name: 'Pop Culture' },
    { slug: 'mega', name: 'Mega Markets' },
  ]
  const tagIds: Record<string, number> = {}
  for (const tag of carouselTags) {
    let [inserted] = await db.insert(tags).values({
      slug: tag.slug,
      name: tag.name,
    }).onConflictDoNothing().returning({ id: tags.id })
    
    if (!inserted) {
      const existing = await db.execute<{id: number}>(sql`SELECT id FROM tags WHERE slug = ${tag.slug}`)
      inserted = { id: existing[0].id }
    }
    tagIds[tag.slug] = inserted.id
  }

  console.log('Seeding 200 events...')
  const templates = [
    { title: 'Who will be the next democrat nominie?', tag: 'politics' },
    { title: 'Will Donald Trump win the 2024 Election?', tag: 'politics' },
    { title: 'Bitcoin to hit $100k by 2024?', tag: 'crypto' },
    { title: 'Ethereum ETF Approval?', tag: 'crypto' },
    { title: 'Solana flipped Ethereum in market cap?', tag: 'crypto' },
    { title: 'Will OpenAI release GPT-5 this year?', tag: 'ai' },
    { title: 'Will AGI be achieved before 2030?', tag: 'ai' },
    { title: 'Will Taylor Swift win Album of the Year?', tag: 'pop-culture' },
    { title: 'Will GTA VI release be delayed to 2026?', tag: 'pop-culture' },
    { title: 'Super Bowl 2025 Winner', tag: 'sports' },
    { title: 'Will LeBron James retire after this season?', tag: 'sports' },
    { title: 'Fed rate cut in September?', tag: 'mega' },
    { title: 'Will US Economy enter a recession in 2024?', tag: 'mega' }
  ]

  for (let i = 0; i < 200; i++) {
    const template = templates[i % templates.length]
    const title = `${template.title} #${i}`
    const conditionId = `cond_${Date.now()}_${i}`

    const [insertedEvent] = await db.insert(events).values({
      slug: `event-${i}-${Date.now()}`,
      title: title,
      status: 'active',
      is_hidden: false,
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).returning({ id: events.id })

    const eventId = insertedEvent.id

    await db.insert(conditions).values({
      id: conditionId,
      oracle: '0x0000000000000000000000000000000000000000',
      question_id: `q_${Date.now()}_${i}`,
      resolved: false,
    })

    await db.insert(markets).values({
      event_id: eventId,
      condition_id: conditionId,
      title: title,
      slug: `market-${i}-${Date.now()}`,
      is_active: true,
      volume: String(i * 1000000),
      volume_24h: String(i * 500000),
    })

    await db.insert(outcomes).values([
      { condition_id: conditionId, outcome_index: 0, outcome_text: 'Yes', token_id: `tok_${Date.now()}_${i}_0` },
      { condition_id: conditionId, outcome_index: 1, outcome_text: 'No', token_id: `tok_${Date.now()}_${i}_1` }
    ])

    await db.insert(event_tags).values({
      event_id: eventId,
      tag_id: tagIds[template.tag]
    })
  }

  console.log('Seeding completed successfully!')
  process.exit(0)
}

run().catch(console.error)
