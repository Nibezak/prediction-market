require('dotenv').config()
const postgres = require('postgres')

const roles = {
  'editor.test@slimefish.local': 'EDITOR',
  'moderator.test@slimefish.local': 'MODERATOR',
  'finance.test@slimefish.local': 'FINANCE',
  'resolver.test@slimefish.local': 'RESOLVER',
  'support.test@slimefish.local': 'SUPPORT',
}

async function main() {
  const sql = postgres(process.env.POSTGRES_URL)
  try {
    for (const [email, role] of Object.entries(roles)) {
      await sql`
        update users
        set settings = coalesce(settings, '{}'::jsonb) || ${sql.json({ staff_role: role })}
        where email = ${email}
      `
    }
    const rows = await sql`
      select email, settings->>'staff_role' as role
      from users
      where email like '%.test@slimefish.local'
      order by email
    `
    console.table(rows)
  }
  finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
