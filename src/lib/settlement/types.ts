export type SettlementDirection = 'deposit' | 'withdrawal' | 'refund' | 'adjustment'

export interface SettlementRequest {
  paymentIntentId: string
  userId: string
  direction: SettlementDirection
  amount: string
  currency: string
  metadata?: Record<string, unknown>
}

export interface SettlementResult {
  status: 'succeeded' | 'pending' | 'failed'
  externalReference?: string
  ledgerTransactionId?: string
  failureCode?: string
  failureMessage?: string
}

export interface SettlementAdapter {
  readonly name: string
  settle: (request: SettlementRequest) => Promise<SettlementResult>
}
