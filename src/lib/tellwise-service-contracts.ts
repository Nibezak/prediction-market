export type TellwiseOrderSide = 'BUY' | 'SELL'
export type TellwiseOrderType = 'LIMIT' | 'MARKET'
export type TellwiseOrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED'

export interface TellwiseSignedOrderRequest {
  marketId: string
  outcomeId: string
  side: TellwiseOrderSide
  type: TellwiseOrderType
  price: string
  size: string
  nonce: string
  expiresAt?: string
  signature: string
}

export interface TellwiseOrder {
  id: string
  userId: string
  marketId: string
  outcomeId: string
  side: TellwiseOrderSide
  price: string
  originalSize: string
  remainingSize: string
  status: TellwiseOrderStatus
  createdAt: string
  updatedAt: string
}

export interface TellwiseOrderbookLevel {
  price: string
  size: string
}

export interface TellwiseOrderbookSnapshot {
  marketId: string
  outcomeId: string
  bids: TellwiseOrderbookLevel[]
  asks: TellwiseOrderbookLevel[]
  sequence: number
  updatedAt: string
}

export interface TellwiseTrade {
  id: string
  marketId: string
  outcomeId: string
  price: string
  size: string
  takerSide: TellwiseOrderSide
  makerOrderId: string
  takerOrderId: string
  createdAt: string
}

export interface TellwiseUserPnlPosition {
  marketId: string
  outcomeId: string
  quantity: string
  averagePrice: string
  realizedPnl: string
  unrealizedPnl: string
  markPrice: string
}

export interface TellwiseUserPnlResponse {
  userId: string
  currency: 'USDC'
  realizedPnl: string
  unrealizedPnl: string
  totalPnl: string
  positions: TellwiseUserPnlPosition[]
  updatedAt: string
}

export interface TellwisePriceReferenceTick {
  marketId: string
  outcomeId?: string
  price: string
  source: string
  confidence?: string
  observedAt: string
}

export interface TellwiseBalanceUpdate {
  userId: string
  currency: 'USDC'
  available: string
  locked: string
  total: string
  sequence: number
  updatedAt: string
}

export interface TellwisePositionUpdate {
  userId: string
  marketId: string
  outcomeId: string
  quantity: string
  averagePrice: string
  sequence: number
  updatedAt: string
}

export type TellwiseRealtimeEvent
  = | { type: 'orderbook.snapshot', payload: TellwiseOrderbookSnapshot }
    | { type: 'orderbook.delta', payload: TellwiseOrderbookSnapshot }
    | { type: 'trade.created', payload: TellwiseTrade }
    | { type: 'user.order', payload: TellwiseOrder }
    | { type: 'user.balance', payload: TellwiseBalanceUpdate }
    | { type: 'user.position', payload: TellwisePositionUpdate }
    | { type: 'comment.created', payload: { id: string, marketId: string, userId: string, body: string, createdAt: string } }
    | { type: 'price_reference.tick', payload: TellwisePriceReferenceTick }
    | { type: 'market.status', payload: { marketId: string, status: string, updatedAt: string } }

export type TellwiseRampProvider = 'pretium' | 'kotani' | 'honeycoin' | 'sandbox'

export interface TellwiseRampQuoteRequest {
  fiatCurrency: 'KES'
  fiatAmount: string
  cryptoCurrency: 'USDC'
}

export interface TellwiseRampQuoteResponse {
  fiatCurrency: 'KES'
  fiatAmount: string
  cryptoCurrency: 'USDC'
  cryptoAmount: string
  exchangeRate: string
  feeFiat: string
  provider: TellwiseRampProvider
  settlementChain: string
  expiresAt: string
}

export interface TellwiseRampInitiateRequest extends TellwiseRampQuoteRequest {
  phoneNumber: string
  walletAddress?: string | null
}

export interface TellwiseRampInitiateResponse extends TellwiseRampQuoteResponse {
  depositId: string
  status: 'PENDING_PROVIDER' | 'PENDING_STK' | 'COMPLETED' | 'FAILED'
  phoneNumber: string
  message: string
}
