'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
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

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('en-KE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function PortfolioTransactionsList() {
  const { formatMoney } = useDisplayCurrency()
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setIsLoading(true)
    fetch('/api/user/transactions', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(body?.error || 'Failed to load transactions.')
        }
        return body?.data ?? []
      })
      .then((rows) => {
        if (active) {
          setTransactions(rows)
          setError('')
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load transactions.')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
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
            <p className="truncate text-sm font-semibold text-foreground capitalize">
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
            <p className="text-sm font-semibold text-foreground">{formatMoney(Number(transaction.netAmount))}</p>
            <Badge
              variant="outline"
              className={cn(
                'mt-1 border-transparent text-xs capitalize',
                transaction.status === 'failed'
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {transaction.status === 'succeeded' ? 'completed' : 'failed'}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
