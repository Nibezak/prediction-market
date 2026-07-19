/* eslint-disable style/max-statements-per-line */
import type { SettlementAdapter } from './types'
import { PlayMoneySettlementAdapter } from './play-money'

export function getSettlementAdapter(): SettlementAdapter {
  const selected = process.env.SETTLEMENT_ADAPTER?.trim().toLowerCase() || 'play_money'
  if (selected === 'play_money') { return new PlayMoneySettlementAdapter() }
  throw new Error(`Settlement adapter "${selected}" is not installed.`)
}

export type { SettlementAdapter, SettlementRequest, SettlementResult } from './types'
