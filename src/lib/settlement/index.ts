/* eslint-disable style/max-statements-per-line */
import type { SettlementAdapter } from './types'
import { SlimefishBackendSettlementAdapter } from './slimefish-backend'

export function getSettlementAdapter(): SettlementAdapter {
  const selected = process.env.SETTLEMENT_ADAPTER?.trim().toLowerCase() || 'slimefish_backend'
  if (selected === 'slimefish_backend') { return new SlimefishBackendSettlementAdapter() }
  throw new Error(`Settlement adapter "${selected}" is not installed.`)
}

export type { SettlementAdapter, SettlementRequest, SettlementResult } from './types'
