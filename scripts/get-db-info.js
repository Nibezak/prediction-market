import path from 'node:path'
import dotenv from 'dotenv'
import postgres from 'postgres'

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const url = process.env.POSTGRES_URL
if (!url) {
  console.error('POSTGRES_URL not set in env')
  process.exit(1)
}

const sql = postgres(url, { max: 1 })

async function run() {
  try {
    const users = await sql`SELECT id, username, address, deposit_wallet_address FROM users LIMIT 10`
    console.log('USERS:')
    console.log(JSON.stringify(users, null, 2))

    const outcomes = await sql`SELECT token_id, condition_id, outcome_text FROM outcomes LIMIT 10`
    console.log('OUTCOMES:')
    console.log(JSON.stringify(outcomes, null, 2))

    const localBalances = await sql`
      SELECT b.*, u.address
      FROM tellwise_clob_balances b
      JOIN users u ON u.id = b.user_id
      LIMIT 10
    `
    console.log('LOCAL CLOB BALANCES:')
    console.log(JSON.stringify(localBalances, null, 2))

    const localPositions = await sql`
      SELECT p.*, u.address
      FROM tellwise_clob_positions p
      JOIN users u ON u.id = p.user_id
      LIMIT 10
    `
    console.log('LOCAL CLOB POSITIONS:')
    console.log(JSON.stringify(localPositions, null, 2))
  }
  catch (err) {
    console.error(err)
  }
  finally {
    await sql.end()
  }
}

run()
