import { createHash, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
import { users } from '@/lib/db/schema/auth/tables'
import { conditions, outcomes } from '@/lib/db/schema/events/tables'
import { orders } from '@/lib/db/schema/orders/tables'

const MICRO = 1_000_000n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const INITIAL_LOCAL_USDC_MICRO = 10_000n * MICRO
const LOCAL_SIGNATURE_PREFIX = '0xlocal'

type Db = typeof db
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type UserRow = typeof users.$inferSelect
type OutcomeRow = typeof outcomes.$inferSelect
type OrderRow = typeof orders.$inferSelect

interface ParsedOrderRequest {
  order: Record<string, unknown>
  orderType: string
  tokenId: string
  side: 'BUY' | 'SELL'
  isBuy: boolean
  maker: string
  signer: string
  taker: string
  makerAmount: bigint
  takerAmount: bigint
  priceMicro: bigint
  sizeMicro: bigint
  expiration: bigint
  salt: bigint
  nonce: bigint
  feeRateBps: number
  signatureType: number
  signature: string
  timestamp: bigint
  metadata: string
  builder: string
}

interface TradeRow {
  id: string
  buyer_address: string
  seller_address: string
  token_id: string
  condition_id: string
  price_micro: string
  size_micro: string
  settlement_micro: string
  transaction_hash: string
  timestamp: Date
}

export async function GET(req: NextRequest) {
  return handleRequest(req)
}

export async function POST(req: NextRequest) {
  return handleRequest(req)
}

export async function PUT(req: NextRequest) {
  return handleRequest(req)
}

export async function DELETE(req: NextRequest) {
  return handleRequest(req)
}

async function handleRequest(req: NextRequest) {
  await ensureLocalClobTables()

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/tellwise-clob/, '')

  try {
    if (path === '/fee-rate') {
      return NextResponse.json({
        base_fee: '10',
        maker_fee: '0',
        takerRateBps: 10,
        makerRateBps: 0,
      })
    }

    if (path === '/books') {
      return getOrderBooks(req)
    }

    if (path === '/prices' || path === '/midpoints') {
      return getPrices(req, path)
    }

    if (path === '/last-trades-prices') {
      return getLastTradePrices(req)
    }

    if (path === '/order' && req.method === 'POST') {
      return submitOrder(req)
    }

    if (path === '/order' && req.method === 'DELETE') {
      return cancelOrder(req)
    }

    if (path === '/cancel-market-orders') {
      return cancelMarketOrders(req)
    }

    if (path === '/data/orders') {
      return getOpenOrders(url)
    }

    if (path === '/trades') {
      return getTrades(url)
    }

    if (path === '/positions') {
      return getPositions(url)
    }

    if (path === '/balances') {
      return getBalances(url)
    }

    if (path === '/value') {
      return getPortfolioValue(url)
    }

    if (path === '/batch-prices-history') {
      return getBatchPricesHistory(req)
    }

    if (path === '/profile/username-availability') {
      return getUsernameAvailability(url)
    }

    if (path === '/other' || path === '/holders') {
      return NextResponse.json([])
    }

    if (path === '/activity') {
      return getActivity(url)
    }

    if (path === '/transaction' || path.startsWith('/transaction')) {
      return NextResponse.json({
        success: true,
        hash: createLedgerHash(`local-transaction:${Date.now()}:${randomUUID()}`),
        status: 'success',
      })
    }

    if (path === '/auth/user-data') {
      return NextResponse.json({ success: true })
    }

    if (path === '/api-keys') {
      return NextResponse.json({
        key: createLocalCredential('key'),
        secret: createLocalCredential('secret'),
      })
    }

    return NextResponse.json({ success: true })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Local CLOB request failed'
    console.error('Tellwise local CLOB failed:', error)
    return NextResponse.json({ success: false, errorMsg: message }, { status: 400 })
  }
}

async function ensureLocalClobTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tellwise_clob_balances (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      usdc_balance_micro BIGINT NOT NULL DEFAULT 10000000000,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT tellwise_clob_balances_non_negative CHECK (usdc_balance_micro >= 0)
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tellwise_clob_positions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL REFERENCES outcomes(token_id) ON DELETE CASCADE,
      condition_id TEXT NOT NULL REFERENCES conditions(id) ON DELETE CASCADE,
      shares_micro BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      PRIMARY KEY (user_id, token_id),
      CONSTRAINT tellwise_clob_positions_non_negative CHECK (shares_micro >= 0)
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tellwise_clob_trades (
      id TEXT PRIMARY KEY DEFAULT generate_ulid(),
      buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      seller_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      buyer_address TEXT NOT NULL,
      seller_address TEXT NOT NULL,
      token_id TEXT NOT NULL REFERENCES outcomes(token_id) ON DELETE CASCADE,
      condition_id TEXT NOT NULL REFERENCES conditions(id) ON DELETE CASCADE,
      price_micro BIGINT NOT NULL,
      size_micro BIGINT NOT NULL,
      settlement_micro BIGINT NOT NULL,
      transaction_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT tellwise_clob_trades_positive_price CHECK (price_micro > 0),
      CONSTRAINT tellwise_clob_trades_positive_size CHECK (size_micro > 0),
      CONSTRAINT tellwise_clob_trades_positive_settlement CHECK (settlement_micro >= 0)
    )
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tellwise_clob_trades_token_time_idx
    ON tellwise_clob_trades (token_id, timestamp DESC)
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tellwise_clob_trades_condition_time_idx
    ON tellwise_clob_trades (condition_id, timestamp DESC)
  `)
}

async function getOrderBooks(req: NextRequest) {
  const body = await optionalJson(req)
  const requested = Array.isArray(body) ? body : []
  const tokenIds = requested
    .map(item => String(item?.token_id ?? item?.asset_id ?? '').trim())
    .filter(Boolean)

  const books = await Promise.all((tokenIds.length ? tokenIds : ['']).map(async (tokenId) => {
    const [buyOrders, sellOrders] = await Promise.all([
      db.select().from(orders).where(and(eq(orders.token_id, tokenId), eq(orders.side, 0))),
      db.select().from(orders).where(and(eq(orders.token_id, tokenId), eq(orders.side, 1))),
    ])

    return {
      token_id: tokenId,
      asset_id: tokenId,
      bids: aggregateBookSide(buyOrders, true),
      asks: aggregateBookSide(sellOrders, false),
    }
  }))

  return NextResponse.json(books)
}

async function getPrices(req: NextRequest, path: string) {
  const body = await optionalJson(req)
  const tokenIds = Array.isArray(body)
    ? body.map(item => String(item?.token_id ?? item?.asset_id ?? item).trim()).filter(Boolean)
    : Object.keys(body ?? {})

  const prices: Record<string, unknown> = {}
  for (const tokenId of tokenIds) {
    const lastPriceMicro = await getLastPriceMicro(tokenId)
    const normalized = formatMicroPrice(lastPriceMicro ?? MICRO / 2n)
    prices[tokenId] = path === '/midpoints'
      ? normalized
      : {
          BUY: formatMicroPrice(clampPriceMicro((lastPriceMicro ?? MICRO / 2n) + 10_000n)),
          SELL: formatMicroPrice(clampPriceMicro((lastPriceMicro ?? MICRO / 2n) - 10_000n)),
        }
  }

  return NextResponse.json(prices)
}

async function getLastTradePrices(req: NextRequest) {
  const body = await optionalJson(req)
  const tokenIds = Array.isArray(body)
    ? body.map(item => String(item?.token_id ?? item?.asset_id ?? item).trim()).filter(Boolean)
    : []

  const response = await Promise.all(tokenIds.map(async (tokenId) => ({
    token_id: tokenId,
    price: formatMicroPrice(await getLastPriceMicro(tokenId) ?? MICRO / 2n),
    side: 'BUY',
  })))

  return NextResponse.json(response)
}

async function submitOrder(req: NextRequest) {
  const body = await req.json()
  const parsed = parseOrderRequest(body)
  validateLocalSignature(parsed)

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.tokenId}))`)

    const [user, outcome] = await Promise.all([
      findUserByAddress(tx, parsed.maker),
      tx.select().from(outcomes).where(eq(outcomes.token_id, parsed.tokenId)).limit(1).then(rows => rows[0] as OutcomeRow | undefined),
    ])

    if (!user) {
      throw new Error('User not found in local DB.')
    }
    if (!outcome) {
      throw new Error('Token id is not a known local outcome.')
    }

    await ensureBalance(tx, user.id)
    await ensurePosition(tx, user.id, parsed.tokenId, outcome.condition_id)

    if (parsed.isBuy) {
      await assertSpendableUsdc(tx, user.id, requiredBuyReserveMicro(parsed.sizeMicro, parsed.priceMicro))
    }
    else {
      await assertSpendableShares(tx, user.id, parsed.tokenId, parsed.sizeMicro)
    }

    let remainingSizeMicro = parsed.sizeMicro
    const orderId = createOrderId(parsed)
    const candidates = await loadMatchingCandidates(tx, parsed)

    for (const candidate of candidates) {
      if (remainingSizeMicro <= 0n) {
        break
      }

      const resting = describeOrder(candidate)
      const matchSizeMicro = minBigint(remainingSizeMicro, resting.sizeMicro)
      const settlementMicro = mulDiv(matchSizeMicro, resting.priceMicro, MICRO)

      if (parsed.isBuy) {
        await executeTrade(tx, {
          buyer: user,
          sellerAddress: candidate.maker,
          tokenId: parsed.tokenId,
          conditionId: outcome.condition_id,
          priceMicro: resting.priceMicro,
          sizeMicro: matchSizeMicro,
          settlementMicro,
          sellerSharesReserved: true,
        })
      }
      else {
        await executeTrade(tx, {
          buyerAddress: candidate.maker,
          seller: user,
          tokenId: parsed.tokenId,
          conditionId: outcome.condition_id,
          priceMicro: resting.priceMicro,
          sizeMicro: matchSizeMicro,
          settlementMicro,
          buyerUsdcReserved: true,
        })
      }

      const remainingRestingSize = resting.sizeMicro - matchSizeMicro
      if (remainingRestingSize <= 0n) {
        await tx.delete(orders).where(eq(orders.id, candidate.id))
      }
      else {
        await updateRestingOrderSize(tx, candidate.id, candidate.side === 0, resting.priceMicro, remainingRestingSize)
      }

      remainingSizeMicro -= matchSizeMicro
    }

    const shouldRest = remainingSizeMicro > 0n && ['GTC', 'GTD'].includes(parsed.orderType)
    if (shouldRest) {
      await insertRestingOrder(tx, parsed, user.id, outcome.condition_id, orderId, remainingSizeMicro)
      if (parsed.isBuy) {
        await debitUsdc(tx, user.id, requiredBuyReserveMicro(remainingSizeMicro, parsed.priceMicro))
      }
      else {
        await debitShares(tx, user.id, parsed.tokenId, remainingSizeMicro)
      }
    }

    return {
      orderId,
      status: remainingSizeMicro === parsed.sizeMicro ? 'OPEN' : remainingSizeMicro > 0n ? 'PARTIALLY_FILLED' : 'FILLED',
      remainingSize: formatMicroAmount(remainingSizeMicro),
    }
  })

  return NextResponse.json({
    success: true,
    orderID: result.orderId,
    orderId: result.orderId,
    status: result.status,
    remainingSize: result.remainingSize,
  })
}

async function cancelOrder(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const orderId = String(body.id ?? body.orderId ?? '').trim()
  if (!orderId) {
    return NextResponse.json({ success: false, errorMsg: 'Order id is required.' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    const existing = await tx.select().from(orders).where(eq(orders.clob_order_id, orderId)).limit(1).then(rows => rows[0])
    if (!existing) {
      return
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${existing.token_id}))`)
    await releaseRestingReserve(tx, existing)
    await tx.delete(orders).where(eq(orders.clob_order_id, orderId))
  })

  return NextResponse.json({ success: true })
}

async function cancelMarketOrders(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const conditionId = String(body.market ?? body.conditionId ?? '').trim()
  if (!conditionId) {
    return NextResponse.json({ success: false, errorMsg: 'Market/condition id is required.' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    const rows = await tx.select().from(orders).where(eq(orders.condition_id, conditionId))
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${conditionId}))`)
    for (const row of rows) {
      await releaseRestingReserve(tx, row)
    }
    await tx.delete(orders).where(eq(orders.condition_id, conditionId))
  })

  return NextResponse.json({ success: true })
}

async function getOpenOrders(url: URL) {
  const makerAddress = url.searchParams.get('makerAddress')?.toLowerCase() ?? ''
  const conditionId = url.searchParams.get('market') ?? url.searchParams.get('conditionId')

  const whereParts = [
    makerAddress ? eq(sql`LOWER(${orders.maker})`, makerAddress) : undefined,
    conditionId ? eq(orders.condition_id, conditionId) : undefined,
  ].filter(Boolean)

  const openOrders = await db
    .select()
    .from(orders)
    .where(whereParts.length ? and(...whereParts as any) : undefined)
    .orderBy(desc(orders.created_at))

  return NextResponse.json(openOrders.map(formatOpenOrder))
}

async function getTrades(url: URL) {
  const tokenId = url.searchParams.get('tokenId') || url.searchParams.get('asset_id')
  const conditionId = url.searchParams.get('conditionId') || url.searchParams.get('market')

  const whereClause = tokenId
    ? sql`WHERE token_id = ${tokenId}`
    : conditionId
      ? sql`WHERE condition_id = ${conditionId}`
      : sql``

  const trades = await db.execute(sql<TradeRow>`
    SELECT id, buyer_address, seller_address, token_id, condition_id, price_micro, size_micro,
           settlement_micro, transaction_hash, timestamp
    FROM tellwise_clob_trades
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT 50
  `)

  return NextResponse.json(trades.map(formatTrade))
}

async function getPositions(url: URL) {
  const userAddress = url.searchParams.get('userAddress') || url.searchParams.get('makerAddress')
  if (!userAddress) {
    return NextResponse.json([])
  }

  const user = await findUserByAddress(db, userAddress)
  if (!user) {
    return NextResponse.json([])
  }

  const rows = await db.execute<{
    token_id: string
    condition_id: string
    shares_micro: string
    avg_price_micro: string | null
    last_price_micro: string | null
  }>(sql`
    WITH buys AS (
      SELECT token_id, SUM(size_micro) AS bought_size, SUM(settlement_micro) AS bought_cost
      FROM tellwise_clob_trades
      WHERE buyer_user_id = ${user.id}
      GROUP BY token_id
    ),
    last_trade AS (
      SELECT DISTINCT ON (token_id) token_id, price_micro
      FROM tellwise_clob_trades
      ORDER BY token_id, timestamp DESC
    )
    SELECT p.token_id, p.condition_id, p.shares_micro,
           CASE WHEN b.bought_size > 0 THEN b.bought_cost * ${MICRO} / b.bought_size ELSE NULL END AS avg_price_micro,
           l.price_micro AS last_price_micro
    FROM tellwise_clob_positions p
    LEFT JOIN buys b ON b.token_id = p.token_id
    LEFT JOIN last_trade l ON l.token_id = p.token_id
    WHERE p.user_id = ${user.id} AND p.shares_micro > 0
  `)

  return NextResponse.json(rows.map((row) => {
    const shares = BigInt(row.shares_micro)
    const avg = BigInt(row.avg_price_micro ?? String(MICRO / 2n))
    const current = BigInt(row.last_price_micro ?? row.avg_price_micro ?? String(MICRO / 2n))
    const outcomeIndex = row.token_id.endsWith('1') ? 0 : 1

    return {
      proxyWallet: userAddress,
      asset: row.token_id,
      conditionId: row.condition_id,
      size: formatMicroAmount(shares),
      avgPrice: formatMicroPrice(avg),
      initialValue: formatMicroAmount(mulDiv(shares, avg, MICRO)),
      currentValue: formatMicroAmount(mulDiv(shares, current, MICRO)),
      realizedPnl: '0.00',
      percentPnl: avg > 0n ? (((Number(current) - Number(avg)) / Number(avg)) * 100).toFixed(2) : '0.00',
      curPrice: formatMicroPrice(current),
      title: outcomeIndex === 0 ? 'YES' : 'NO',
      outcome: outcomeIndex === 0 ? 'YES' : 'NO',
      outcomeIndex,
    }
  }))
}

async function getBalances(url: URL) {
  const userAddress = url.searchParams.get('userAddress') || ''
  const user = userAddress ? await findUserByAddress(db, userAddress) : null

  let usdcMicro = INITIAL_LOCAL_USDC_MICRO
  const shareMap: Record<string, { YES: number, NO: number }> = {}

  if (user) {
    await ensureBalance(db, user.id)
    const balance = await db.execute<{ usdc_balance_micro: string }>(sql`
      SELECT usdc_balance_micro FROM tellwise_clob_balances WHERE user_id = ${user.id}
    `)
    usdcMicro = BigInt(balance[0]?.usdc_balance_micro ?? INITIAL_LOCAL_USDC_MICRO)

    const positions = await db.execute<{ condition_id: string, token_id: string, shares_micro: string }>(sql`
      SELECT condition_id, token_id, shares_micro
      FROM tellwise_clob_positions
      WHERE user_id = ${user.id} AND shares_micro > 0
    `)

    for (const position of positions) {
      const bucket = shareMap[position.condition_id] ?? { YES: 0, NO: 0 }
      if (position.token_id.endsWith('1')) {
        bucket.YES += Number(formatMicroAmount(BigInt(position.shares_micro)))
      }
      else {
        bucket.NO += Number(formatMicroAmount(BigInt(position.shares_micro)))
      }
      shareMap[position.condition_id] = bucket
    }
  }

  return NextResponse.json({
    usdc: Number(formatMicroAmount(usdcMicro)),
    shares: shareMap,
  })
}

async function getPortfolioValue(url: URL) {
  const userAddress = url.searchParams.get('user') || url.searchParams.get('userAddress') || ''
  const user = userAddress ? await findUserByAddress(db, userAddress) : null
  if (!user) {
    return NextResponse.json({ value: 0, volume: 0, traded: 0 })
  }

  const [balance, positions, volume] = await Promise.all([
    db.execute<{ usdc_balance_micro: string }>(sql`
      SELECT usdc_balance_micro FROM tellwise_clob_balances WHERE user_id = ${user.id}
    `),
    db.execute<{ value_micro: string }>(sql`
      WITH last_trade AS (
        SELECT DISTINCT ON (token_id) token_id, price_micro
        FROM tellwise_clob_trades
        ORDER BY token_id, timestamp DESC
      )
      SELECT COALESCE(SUM(p.shares_micro * COALESCE(l.price_micro, ${MICRO / 2n}) / ${MICRO}), 0) AS value_micro
      FROM tellwise_clob_positions p
      LEFT JOIN last_trade l ON l.token_id = p.token_id
      WHERE p.user_id = ${user.id}
    `),
    db.execute<{ volume_micro: string, traded: string }>(sql`
      SELECT COALESCE(SUM(settlement_micro), 0) AS volume_micro, COUNT(*) AS traded
      FROM tellwise_clob_trades
      WHERE buyer_user_id = ${user.id} OR seller_user_id = ${user.id}
    `),
  ])

  const total = BigInt(balance[0]?.usdc_balance_micro ?? '0') + BigInt(positions[0]?.value_micro ?? '0')
  return NextResponse.json({
    value: Number(formatMicroAmount(total)),
    volume: Number(formatMicroAmount(BigInt(volume[0]?.volume_micro ?? '0'))),
    traded: Number(volume[0]?.traded ?? 0),
  })
}

async function getBatchPricesHistory(req: NextRequest) {
  const body = await optionalJson(req)
  const tokenIds = Array.isArray(body?.markets) ? body.markets.map(String).filter(Boolean) : []
  const history: Record<string, Array<{ t: number, p: number }>> = {}

  for (const tokenId of tokenIds) {
    const rows = await db.execute<{ price_micro: string, timestamp: Date }>(sql`
      SELECT price_micro, timestamp
      FROM tellwise_clob_trades
      WHERE token_id = ${tokenId}
      ORDER BY timestamp ASC
    `)

    history[tokenId] = rows.map(row => ({
      t: Math.floor(new Date(row.timestamp).getTime() / 1000),
      p: Number(formatMicroPrice(BigInt(row.price_micro))),
    }))
  }

  return NextResponse.json({ history })
}

async function getUsernameAvailability(url: URL) {
  const username = url.searchParams.get('username')?.trim()
  if (!username) {
    return NextResponse.json({ available: false })
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`LOWER(${users.username})`, username.toLowerCase()))
    .limit(1)

  return NextResponse.json({ available: existing.length === 0 })
}

async function getActivity(url: URL) {
  const userAddress = url.searchParams.get('user') || ''
  const user = userAddress ? await findUserByAddress(db, userAddress) : null
  if (!user) {
    return NextResponse.json([])
  }

  const trades = await db.execute<TradeRow>(sql`
    SELECT id, buyer_address, seller_address, token_id, condition_id, price_micro, size_micro,
           settlement_micro, transaction_hash, timestamp
    FROM tellwise_clob_trades
    WHERE buyer_user_id = ${user.id} OR seller_user_id = ${user.id}
    ORDER BY timestamp DESC
    LIMIT 20
  `)

  return NextResponse.json(trades.map((trade) => {
    const isBuyer = trade.buyer_address.toLowerCase() === userAddress.toLowerCase()
    return {
      proxyWallet: userAddress,
      timestamp: Math.floor(new Date(trade.timestamp).getTime() / 1000),
      conditionId: trade.condition_id,
      type: 'TRADE',
      size: formatMicroAmount(BigInt(trade.size_micro)),
      usdcSize: formatMicroAmount(BigInt(trade.settlement_micro)),
      transactionHash: trade.transaction_hash,
      price: formatMicroPrice(BigInt(trade.price_micro)),
      asset: trade.token_id,
      side: isBuyer ? 'BUY' : 'SELL',
      outcome: trade.token_id.endsWith('1') ? 'YES' : 'NO',
      outcomeIndex: trade.token_id.endsWith('1') ? 0 : 1,
    }
  }))
}

function parseOrderRequest(body: any): ParsedOrderRequest {
  const source = body?.order ?? body
  if (!source || typeof source !== 'object') {
    throw new Error('Invalid order structure.')
  }

  const sideValue = String(source.side ?? body?.side ?? '').toUpperCase()
  const side = sideValue === 'BUY' || sideValue === '0'
    ? 'BUY'
    : sideValue === 'SELL' || sideValue === '1'
      ? 'SELL'
      : null

  if (!side) {
    throw new Error('Order side must be BUY or SELL.')
  }

  const tokenId = requiredString(source.tokenId ?? source.token_id, 'tokenId')
  const maker = normalizeAddress(requiredString(source.maker, 'maker'))
  const signer = normalizeAddress(String(source.signer ?? source.maker))
  const taker = normalizeAddress(String(source.taker ?? ZERO_ADDRESS))
  const makerAmount = requiredPositiveBigint(source.makerAmount ?? source.maker_amount, 'makerAmount')
  const takerAmount = requiredPositiveBigint(source.takerAmount ?? source.taker_amount, 'takerAmount')
  const isBuy = side === 'BUY'
  const priceMicro = isBuy
    ? mulDiv(makerAmount, MICRO, takerAmount)
    : mulDiv(takerAmount, MICRO, makerAmount)
  const sizeMicro = isBuy ? takerAmount : makerAmount

  if (priceMicro <= 0n || priceMicro > MICRO) {
    throw new Error('Order price must be greater than 0 and less than or equal to 1.00.')
  }

  return {
    order: source,
    orderType: String(body?.orderType ?? source.type ?? body?.type ?? 'GTC').toUpperCase(),
    tokenId,
    side,
    isBuy,
    maker,
    signer,
    taker,
    makerAmount,
    takerAmount,
    priceMicro,
    sizeMicro,
    expiration: optionalBigint(source.expiration, 0n),
    salt: optionalBigint(source.salt, BigInt(Date.now())),
    nonce: optionalBigint(source.nonce, 0n),
    feeRateBps: Number(source.fee_rate_bps ?? source.feeRateBps ?? 0),
    signatureType: Number(source.signature_type ?? source.signatureType ?? 3),
    signature: requiredString(source.signature ?? body?.signature, 'signature'),
    timestamp: optionalBigint(source.timestamp, BigInt(Date.now())),
    metadata: String(source.metadata ?? '0x0000000000000000000000000000000000000000000000000000000000000000'),
    builder: String(source.builder ?? '0x0000000000000000000000000000000000000000000000000000000000000000'),
  }
}

function validateLocalSignature(order: ParsedOrderRequest) {
  if (order.signatureType !== 3) {
    throw new Error('Only Deposit Wallet signature type 3 is supported locally.')
  }
  if (order.maker !== order.signer) {
    throw new Error('Local orders require maker and signer to match.')
  }
  if (/^0x[0-9a-fA-F]{130,}$/.test(order.signature) && order.signature.length % 2 === 0) {
    return
  }
  if (
    process.env.NEXT_PUBLIC_TELLWISE_LOCAL_LOGIN === 'true'
    && order.signature.toLowerCase().startsWith(LOCAL_SIGNATURE_PREFIX)
  ) {
    return
  }
  throw new Error('Invalid local order signature. Expected a hex wallet signature.')
}

async function loadMatchingCandidates(tx: Tx, parsed: ParsedOrderRequest) {
  const side = parsed.isBuy ? 1 : 0
  const candidates = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.token_id, parsed.tokenId), eq(orders.side, side)))
    .orderBy(parsed.isBuy ? asc(orders.created_at) : asc(orders.created_at))

  return candidates
    .map(order => ({ ...order, description: describeOrder(order) }))
    .filter(({ description }) => parsed.isBuy
      ? description.priceMicro <= parsed.priceMicro
      : description.priceMicro >= parsed.priceMicro)
    .sort((left, right) => {
      if (left.description.priceMicro === right.description.priceMicro) {
        return left.created_at.getTime() - right.created_at.getTime()
      }
      return parsed.isBuy
        ? Number(left.description.priceMicro - right.description.priceMicro)
        : Number(right.description.priceMicro - left.description.priceMicro)
    })
}

async function executeTrade(tx: Tx, args: {
  buyer?: UserRow
  buyerAddress?: string
  seller?: UserRow
  sellerAddress?: string
  tokenId: string
  conditionId: string
  priceMicro: bigint
  sizeMicro: bigint
  settlementMicro: bigint
  buyerUsdcReserved?: boolean
  sellerSharesReserved?: boolean
}) {
  const buyer = args.buyer ?? await findUserByAddress(tx, args.buyerAddress ?? '')
  const seller = args.seller ?? await findUserByAddress(tx, args.sellerAddress ?? '')

  if (!buyer || !seller) {
    throw new Error('Matched order owner could not be resolved.')
  }

  await ensureBalance(tx, buyer.id)
  await ensureBalance(tx, seller.id)
  await ensurePosition(tx, buyer.id, args.tokenId, args.conditionId)
  await ensurePosition(tx, seller.id, args.tokenId, args.conditionId)
  if (!args.buyerUsdcReserved) {
    await assertSpendableUsdc(tx, buyer.id, args.settlementMicro)
  }
  if (!args.sellerSharesReserved) {
    await assertSpendableShares(tx, seller.id, args.tokenId, args.sizeMicro)
  }

  if (!args.buyerUsdcReserved) {
    await debitUsdc(tx, buyer.id, args.settlementMicro)
  }
  await creditUsdc(tx, seller.id, args.settlementMicro)
  await creditShares(tx, buyer.id, args.tokenId, args.conditionId, args.sizeMicro)
  if (!args.sellerSharesReserved) {
    await debitShares(tx, seller.id, args.tokenId, args.sizeMicro)
  }

  const seed = [
    buyer.id,
    seller.id,
    args.tokenId,
    args.conditionId,
    args.priceMicro.toString(),
    args.sizeMicro.toString(),
    Date.now().toString(),
    randomUUID(),
  ].join(':')

  await tx.execute(sql`
    INSERT INTO tellwise_clob_trades (
      buyer_user_id, seller_user_id, buyer_address, seller_address, token_id, condition_id,
      price_micro, size_micro, settlement_micro, transaction_hash
    )
    VALUES (
      ${buyer.id}, ${seller.id}, ${buyer.address}, ${seller.address}, ${args.tokenId}, ${args.conditionId},
      ${args.priceMicro}, ${args.sizeMicro}, ${args.settlementMicro}, ${createLedgerHash(seed)}
    )
  `)
}

async function insertRestingOrder(
  tx: Tx,
  parsed: ParsedOrderRequest,
  userId: string,
  conditionId: string,
  orderId: string,
  sizeMicro: bigint,
) {
  const makerAmount = parsed.isBuy ? mulDiv(sizeMicro, parsed.priceMicro, MICRO) : sizeMicro
  const takerAmount = parsed.isBuy ? sizeMicro : mulDiv(sizeMicro, parsed.priceMicro, MICRO)

  await tx.insert(orders).values({
    clob_order_id: orderId,
    user_id: userId,
    condition_id: conditionId,
    token_id: parsed.tokenId,
    side: parsed.isBuy ? 0 : 1,
    type: parsed.orderType,
    maker: parsed.maker,
    signer: parsed.signer,
    taker: parsed.taker,
    maker_amount: makerAmount,
    taker_amount: takerAmount,
    expiration: parsed.expiration,
    salt: parsed.salt,
    nonce: parsed.nonce,
    fee_rate_bps: parsed.feeRateBps,
    signature_type: parsed.signatureType,
    signature: parsed.signature,
  })
}

async function updateRestingOrderSize(tx: Tx, orderDbId: string, isBuy: boolean, priceMicro: bigint, sizeMicro: bigint) {
  await tx
    .update(orders)
    .set({
      maker_amount: isBuy ? mulDiv(sizeMicro, priceMicro, MICRO) : sizeMicro,
      taker_amount: isBuy ? sizeMicro : mulDiv(sizeMicro, priceMicro, MICRO),
      updated_at: new Date(),
    })
    .where(eq(orders.id, orderDbId))
}

async function releaseRestingReserve(tx: Tx, order: OrderRow) {
  const desc = describeOrder(order)
  if (order.side === 0) {
    await creditUsdc(tx, order.user_id, requiredBuyReserveMicro(desc.sizeMicro, desc.priceMicro))
  }
  else {
    await creditShares(tx, order.user_id, order.token_id, order.condition_id, desc.sizeMicro)
  }
}

function aggregateBookSide(orderRows: OrderRow[], isBuy: boolean) {
  const byPrice = new Map<string, bigint>()
  for (const order of orderRows) {
    const desc = describeOrder(order)
    const price = formatMicroPrice(desc.priceMicro)
    byPrice.set(price, (byPrice.get(price) ?? 0n) + desc.sizeMicro)
  }

  return Array.from(byPrice.entries())
    .map(([price, sizeMicro]) => ({ price, size: formatMicroAmount(sizeMicro) }))
    .sort((a, b) => isBuy ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price))
}

function describeOrder(order: Pick<OrderRow, 'side' | 'maker_amount' | 'taker_amount'>) {
  const makerAmount = BigInt(order.maker_amount ?? 0)
  const takerAmount = BigInt(order.taker_amount ?? 0)
  const isBuy = order.side === 0
  return {
    priceMicro: isBuy ? mulDiv(makerAmount, MICRO, takerAmount) : mulDiv(takerAmount, MICRO, makerAmount),
    sizeMicro: isBuy ? takerAmount : makerAmount,
  }
}

function formatOpenOrder(order: OrderRow) {
  const isBuy = order.side === 0
  const desc = describeOrder(order)
  const outcomeIndex = order.token_id.endsWith('1') ? 0 : 1

  return {
    id: order.clob_order_id,
    status: 'OPEN',
    owner: order.maker,
    maker_address: order.maker,
    market: order.condition_id,
    asset_id: order.token_id,
    side: isBuy ? 'BUY' : 'SELL',
    original_size: formatMicroAmount(desc.sizeMicro),
    size_matched: '0',
    price: formatMicroPrice(desc.priceMicro),
    outcome: outcomeIndex === 0 ? 'YES' : 'NO',
    created_at: Math.floor(order.created_at.getTime() / 1000),
    expiration: order.expiration.toString(),
    order_type: order.type,
  }
}

function formatTrade(trade: TradeRow) {
  return {
    id: trade.id,
    market: trade.condition_id,
    asset_id: trade.token_id,
    price: formatMicroPrice(BigInt(trade.price_micro)),
    size: formatMicroAmount(BigInt(trade.size_micro)),
    side: 'BUY',
    outcome: trade.token_id.endsWith('1') ? 'YES' : 'NO',
    transaction_hash: trade.transaction_hash,
    match_time: trade.timestamp,
  }
}

async function findUserByAddress(client: Pick<Db, 'select'> | Tx, address: string) {
  const normalized = address.toLowerCase()
  return client
    .select()
    .from(users)
    .where(or(
      eq(sql`LOWER(${users.address})`, normalized),
      eq(sql`LOWER(${users.deposit_wallet_address})`, normalized),
    ))
    .limit(1)
    .then(rows => rows[0] as UserRow | undefined)
}

async function ensureBalance(client: Pick<Db, 'execute'> | Tx, userId: string) {
  await client.execute(sql`
    INSERT INTO tellwise_clob_balances (user_id, usdc_balance_micro)
    VALUES (${userId}, ${INITIAL_LOCAL_USDC_MICRO})
    ON CONFLICT (user_id) DO NOTHING
  `)
}

async function ensurePosition(client: Pick<Db, 'execute'> | Tx, userId: string, tokenId: string, conditionId: string) {
  await client.execute(sql`
    INSERT INTO tellwise_clob_positions (user_id, token_id, condition_id, shares_micro)
    VALUES (${userId}, ${tokenId}, ${conditionId}, 0)
    ON CONFLICT (user_id, token_id) DO NOTHING
  `)
}

async function assertSpendableUsdc(tx: Tx, userId: string, amountMicro: bigint) {
  if (amountMicro <= 0n) {
    return
  }
  const rows = await tx.execute<{ usdc_balance_micro: string }>(sql`
    SELECT usdc_balance_micro FROM tellwise_clob_balances WHERE user_id = ${userId} FOR UPDATE
  `)
  const available = BigInt(rows[0]?.usdc_balance_micro ?? '0')
  if (available < amountMicro) {
    throw new Error('Insufficient local USDC balance.')
  }
}

async function assertSpendableShares(tx: Tx, userId: string, tokenId: string, amountMicro: bigint) {
  if (amountMicro <= 0n) {
    return
  }
  const rows = await tx.execute<{ shares_micro: string }>(sql`
    SELECT shares_micro FROM tellwise_clob_positions
    WHERE user_id = ${userId} AND token_id = ${tokenId}
    FOR UPDATE
  `)
  const available = BigInt(rows[0]?.shares_micro ?? '0')
  if (available < amountMicro) {
    throw new Error('Insufficient local shares.')
  }
}

async function debitUsdc(tx: Tx, userId: string, amountMicro: bigint) {
  await tx.execute(sql`
    UPDATE tellwise_clob_balances
    SET usdc_balance_micro = usdc_balance_micro - ${amountMicro}, updated_at = NOW()
    WHERE user_id = ${userId}
  `)
}

async function creditUsdc(tx: Tx, userId: string, amountMicro: bigint) {
  await tx.execute(sql`
    UPDATE tellwise_clob_balances
    SET usdc_balance_micro = usdc_balance_micro + ${amountMicro}, updated_at = NOW()
    WHERE user_id = ${userId}
  `)
}

async function debitShares(tx: Tx, userId: string, tokenId: string, amountMicro: bigint) {
  await tx.execute(sql`
    UPDATE tellwise_clob_positions
    SET shares_micro = shares_micro - ${amountMicro}, updated_at = NOW()
    WHERE user_id = ${userId} AND token_id = ${tokenId}
  `)
}

async function creditShares(tx: Tx, userId: string, tokenId: string, conditionId: string, amountMicro: bigint) {
  await ensurePosition(tx, userId, tokenId, conditionId)
  await tx.execute(sql`
    UPDATE tellwise_clob_positions
    SET shares_micro = shares_micro + ${amountMicro}, updated_at = NOW()
    WHERE user_id = ${userId} AND token_id = ${tokenId}
  `)
}

async function getLastPriceMicro(tokenId: string) {
  const rows = await db.execute<{ price_micro: string }>(sql`
    SELECT price_micro
    FROM tellwise_clob_trades
    WHERE token_id = ${tokenId}
    ORDER BY timestamp DESC
    LIMIT 1
  `)
  return rows[0]?.price_micro ? BigInt(rows[0].price_micro) : null
}

async function optionalJson(req: NextRequest) {
  try {
    return await req.json()
  }
  catch {
    return null
  }
}

function requiredString(value: unknown, field: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    throw new Error(`${field} is required.`)
  }
  return normalized
}

function normalizeAddress(value: string) {
  const normalized = value.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    throw new Error(`Invalid address: ${value}`)
  }
  return normalized.toLowerCase()
}

function requiredPositiveBigint(value: unknown, field: string) {
  const parsed = optionalBigint(value, 0n)
  if (parsed <= 0n) {
    throw new Error(`${field} must be greater than zero.`)
  }
  return parsed
}

function optionalBigint(value: unknown, fallback: bigint) {
  if (typeof value === 'bigint') {
    return value
  }
  const normalized = String(value ?? '').trim()
  if (!normalized) {
    return fallback
  }
  return BigInt(normalized)
}

function minBigint(left: bigint, right: bigint) {
  return left < right ? left : right
}

function mulDiv(left: bigint, right: bigint, denominator: bigint) {
  if (denominator <= 0n) {
    throw new Error('Invalid division by zero in local CLOB math.')
  }
  return (left * right) / denominator
}

function requiredBuyReserveMicro(sizeMicro: bigint, priceMicro: bigint) {
  return mulDiv(sizeMicro, priceMicro, MICRO)
}

function formatMicroPrice(value: bigint) {
  return formatFixed(value, 6, 2)
}

function formatMicroAmount(value: bigint) {
  return formatFixed(value, 6, 6).replace(/\.?0+$/, '')
}

function formatFixed(value: bigint, decimals: number, displayDecimals: number) {
  const scale = 10n ** BigInt(decimals)
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const whole = absolute / scale
  const fraction = (absolute % scale).toString().padStart(decimals, '0').slice(0, displayDecimals)
  return displayDecimals > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`
}

function clampPriceMicro(value: bigint) {
  if (value < 1n) {
    return 1n
  }
  if (value > MICRO) {
    return MICRO
  }
  return value
}

function createOrderId(order: ParsedOrderRequest) {
  return `tw-order-${createHash('sha256')
    .update([
      order.maker,
      order.tokenId,
      order.side,
      order.makerAmount.toString(),
      order.takerAmount.toString(),
      order.salt.toString(),
      order.signature,
    ].join(':'))
    .digest('hex')
    .slice(0, 24)}`
}

function createLedgerHash(seed: string) {
  return `0x${createHash('sha256').update(seed).digest('hex')}`
}

function createLocalCredential(kind: 'key' | 'secret') {
  return `tw-local-${kind}-${createHash('sha256')
    .update(`${kind}:${process.env.POSTGRES_URL ?? ''}`)
    .digest('hex')
    .slice(0, 32)}`
}
