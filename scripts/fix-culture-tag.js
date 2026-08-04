import postgres from 'postgres'

const sql = postgres('postgresql://neondb_owner:npg_o3Z5SJLIObFy@ep-lively-hat-ax6gmssq-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require')

async function run() {
  const cultureTag = await sql`SELECT id FROM tags WHERE slug = 'culture'`.then(r => r[0])
  console.log('Culture Tag ID:', cultureTag.id)

  const events = await sql`SELECT id, slug, title FROM events WHERE title ILIKE '%Oscar%' OR title ILIKE '%Picture%'`
  console.log('Events to update:', events)

  for (const ev of events) {
    const cleanId = ev.id.trim()
    await sql`INSERT INTO event_tags (event_id, tag_id) VALUES (${cleanId}, ${cultureTag.id}) ON CONFLICT DO NOTHING`
    console.log(`Linked event ${cleanId} (${ev.title}) to Culture tag (id: ${cultureTag.id})`)
  }
}

run().then(() => sql.end()).catch(console.error)
