'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PortfolioTransaction {
  id: string
  direction: string
  status: string
  sourceCurrency: string
  destinationCurrency: string
  grossAmount: string
  providerFee: string
  netAmount: string
  externalReference: string | null
  failureMessage: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

function formatTransactionAmount(transaction: PortfolioTransaction) {
  const amountKes = typeof transaction.metadata?.amountKes === 'number'
    ? transaction.metadata.amountKes
    : Number(transaction.grossAmount)
  if (transaction.direction === 'deposit') {
    return `KES ${Number(transaction.grossAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `KES ${Number(amountKes).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-KE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function PortfolioTransactionsList() {
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setIsLoading(true)
    fetch('/api/user/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || 'Failed to load transactions.')
        return body?.data ?? []
      })
      .then((rows) => {
        if (active) {
          setTransactions(rows)
          setError('')
        }
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Failed to load transactions.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (error) {
    return <p className="p-4 text-sm text-destructive sm:p-6">{error}</p>
  }

  if (transactions.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground sm:p-6">No deposits or withdrawals yet.</p>
  }

  return (
    <div className="divide-y">
      {transactions.map(transaction => (
        <div key={transaction.id} className="flex items-center justify-between gap-4 p-4 sm:p-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold capitalize text-foreground">
              {transaction.direction}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(transaction.createdAt)}
              {transaction.externalReference ? ` - ${transaction.externalReference}` : ''}
            </p>
            {transaction.failureMessage && (
              <p className="mt-1 text-xs text-destructive">{transaction.failureMessage}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-foreground">{formatTransactionAmount(transaction)}</p>
            <p
              className={cn(
                'text-xs capitalize',
                transaction.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {transaction.status.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
