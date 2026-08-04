import postgres from 'postgres'

const sql = postgres('postgresql://neondb_owner:npg_o3Z5SJLIObFy@ep-lively-hat-ax6gmssq-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require')

async function run() {
  const evs = await sql`SELECT id, slug, title, icon_url, created_at FROM events ORDER BY created_at DESC LIMIT 10`
  console.log('ALL RECENT EVENTS:', JSON.stringify(evs, null, 2))
  const tagsRes = await sql`SELECT * FROM tags`
  console.log('ALL TAGS:', JSON.stringify(tagsRes, null, 2))
  const eventTagsRes = await sql`SELECT * FROM event_tags`
  console.log('ALL EVENT TAGS:', JSON.stringify(eventTagsRes, null, 2))
}

run().then(() => sql.end()).catch(console.error)
