import { SparkleIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { cn } from '@/lib/utils'

interface NewBadgeProps {
  variant?: 'plain' | 'soft'
  className?: string
}

export function NewBadge({ variant = 'plain', className }: NewBadgeProps) {
  const t = useExtracted()

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] leading-none font-bold rounded-md bg-yes text-background px-2 py-1 shadow-sm uppercase tracking-wider',
        className,
      )}
    >
      <SparkleIcon className="size-2.5 text-background fill-background" strokeWidth={2.5} />
      <span>{t('New')}</span>
    </span>
  )
}
