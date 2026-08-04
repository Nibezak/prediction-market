'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { cn } from '@/lib/utils'

type TimelineStepStatus = 'complete' | 'active' | 'pending' | 'failed'

export interface WalletTimelineStep {
  title: string
  description: string
  status: TimelineStepStatus
}

function normalizeReference(description: string) {
  return description
    .replace(/^Deposit to\s+/i, '')
    .replace(/^Withdrawal to\s+/i, '')
    .trim()
}

function TimelineMarker({ status, isLast }: { status: TimelineStepStatus, isLast: boolean }) {
  const isDone = status === 'complete'
  const isActive = status === 'active'
  const isFailed = status === 'failed'

  return (
    <div className="flex flex-col items-center">
      <span className={cn(
        'flex size-7 items-center justify-center rounded-full border transition-colors',
        isDone && 'border-primary bg-primary text-primary-foreground shadow-[0_0_0_6px_hsl(var(--primary)/0.08)]',
        isActive && 'border-primary bg-primary/10 text-primary shadow-[0_0_0_6px_hsl(var(--primary)/0.06)]',
        isFailed && 'border-destructive bg-destructive text-destructive-foreground',
        status === 'pending' && 'border-border bg-background text-muted-foreground',
      )}
      >
        {isDone && <CheckIcon className="size-3.5" />}
        {isActive && <Skeleton className="size-3 rounded-full bg-primary/70" />}
        {isFailed && <XIcon className="size-3.5" />}
        {status === 'pending' && <Skeleton className="size-3 rounded-full" />}
      </span>
      {!isLast && (
        <span className={cn(
          'h-8 w-px',
          isDone || isActive ? 'bg-primary/70' : 'bg-border',
        )}
        />
      )}
    </div>
  )
}

export default function WalletTransactionTimeline({
  title,
  description,
  amount,
  steps,
  failed = false,
  onRetry,
}: {
  title: string
  description: string
  amount?: string
  steps: readonly WalletTimelineStep[]
  failed?: boolean
  onRetry?: () => void
  note?: string
}) {
  const site = useSiteIdentity()
  const reference = normalizeReference(description)
  const isWithdrawal = `${title} ${description}`.toLowerCase().includes('withdraw')
    || `${title} ${description}`.toLowerCase().includes('payout')
  const method = isWithdrawal ? 'M-Pesa payout' : 'M-Pesa deposit'
  const heading = isWithdrawal ? 'Withdraw to M-Pesa' : 'M-Pesa deposit'
  const completed = !failed && steps.length > 0 && steps.every(step => step.status === 'complete')
  const summaryLabel = failed ? 'Failed' : completed ? 'Completed' : 'In progress'

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background text-foreground">
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <SiteLogoIcon
                logoSvg={site.logoSvg}
                logoImageUrl={site.logoImageUrl}
                alt={`${site.name} logo`}
                size={22}
                className="size-5"
                imageClassName="size-5 object-contain"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{site.name}</p>
              <p className="text-xs text-muted-foreground">{heading}</p>
            </div>
          </div>
          <span className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            failed ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary',
          )}
          >
            {summaryLabel}
          </span>
        </div>

        <div className="my-5 border-t border-dashed border-border" />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="mt-1 truncate font-semibold text-foreground">{amount ?? '-'}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Method</p>
            <p className="mt-1 truncate font-semibold text-foreground">{method}</p>
          </div>
          <div className="col-span-2 min-w-0">
            <p className="text-xs text-muted-foreground">Reference</p>
            <p className="mt-1 truncate font-semibold text-foreground">{reference || 'pending'}</p>
          </div>
        </div>

        <div className="my-5 border-t border-dashed border-border" />

        <div className="grid gap-0">
          {steps.map((step, index) => (
            <div key={step.title} className="grid grid-cols-[1.75rem_1fr] gap-4">
              <TimelineMarker status={step.status} isLast={index === steps.length - 1} />
              <div className={cn('pb-4', index === steps.length - 1 && 'pb-0')}>
                <p className={cn(
                  'text-sm font-semibold text-muted-foreground',
                  step.status === 'active' && 'text-foreground',
                  step.status === 'complete' && 'text-foreground',
                  step.status === 'failed' && 'text-destructive',
                )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {failed && onRetry && (
          <Button type="button" className="mt-5 h-11 w-full" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
