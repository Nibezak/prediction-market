'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { AdminEventRow } from '@/app/[locale]/admin/events/_hooks/useAdminEvents'
import { ArrowUpDownIcon, BadgeInfoIcon, CheckCircleIcon, EyeIcon, EyeOffIcon, LockIcon, RadioIcon, RepeatIcon, Trash2Icon, TrophyIcon, UsersIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import AppLink from '@/components/AppLink'
import EventIconImage from '@/components/EventIconImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCompactCurrency, formatDate } from '@/lib/formatters'
import { isSportsAuxiliaryEventSlug } from '@/lib/sports-event-slugs'
import { cn } from '@/lib/utils'

interface EventColumnOptions {
  onToggleHidden: (event: AdminEventRow, nextValue: boolean) => void
  onOpenAdditionalContextModal: (event: AdminEventRow) => void
  onOpenLivestreamModal: (event: AdminEventRow) => void
  onOpenSportsFinalModal: (event: AdminEventRow) => void
  onOpenResolutionModal: (event: AdminEventRow) => void
  onOpenCloseModal: (event: AdminEventRow) => void
  onOpenDeleteModal?: (event: AdminEventRow) => void
  onOpenTradersModal?: (event: AdminEventRow) => void
  isUpdatingHidden: (eventId: string) => boolean
  canResolve: boolean
  canEdit: boolean
  canModerate: boolean
  canClose: boolean
}

function resolveStatusVariant(status: AdminEventRow['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'active') {
    return 'default'
  }
  if (status === 'resolved') {
    return 'secondary'
  }
  if (status === 'archived') {
    return 'outline'
  }
  return 'destructive'
}

function formatSeriesRecurrenceLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  if (/^\d+[a-z]+$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`
}

export function useAdminEventsColumns({
  onToggleHidden,
  onOpenAdditionalContextModal,
  onOpenLivestreamModal,
  onOpenSportsFinalModal,
  onOpenResolutionModal,
  onOpenCloseModal,
  onOpenDeleteModal,
  onOpenTradersModal,
  isUpdatingHidden,
  canResolve,
  canEdit,
  canModerate,
  canClose,
}: EventColumnOptions): ColumnDef<AdminEventRow>[] {
  const t = useExtracted()

  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'title',
      id: 'title',
      header: ({ column }) => (
        <Button
          type="button"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-auto gap-0 p-0 text-xs font-medium text-muted-foreground uppercase hover:text-foreground"
        >
          {t('Event')}
          <ArrowUpDownIcon className="size-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const event = row.original
        return (
          <div className="max-w-lg min-w-[16rem]">
            <div className="flex items-start gap-3">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted/40">
                {event.icon_url
                  ? (
                      <EventIconImage
                        src={event.icon_url}
                        alt={event.title}
                        sizes="40px"
                        containerClassName="size-full"
                      />
                    )
                  : (
                      <div className={cn(`
                        flex size-full items-center justify-center text-xs font-semibold text-muted-foreground
                      `)}
                      >
                        {event.title.slice(0, 1).toUpperCase()}
                      </div>
                    )}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <AppLink
                    intentPrefetch
                    href={`/event/${event.slug}`}
                    className={cn(`
                      line-clamp-2 text-sm font-medium text-wrap underline-offset-4
                      hover:underline
                      ${event.is_hidden ? 'text-muted-foreground' : 'text-foreground'}
                    `)}
                  >
                    {event.title}
                  </AppLink>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">{event.slug}</span>
                  {event.series_slug && (
                    <span
                      className={cn(`
                        inline-flex items-center gap-1 rounded-sm border border-border/70 bg-background px-1.5 py-0.5
                        text-2xs font-medium text-muted-foreground
                      `)}
                    >
                      <RepeatIcon className="size-3" />
                      <span>{formatSeriesRecurrenceLabel(event.series_recurrence ?? event.series_slug) ?? t('Series')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      },
      enableHiding: false,
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: ({ column }) => (
        <Button
          type="button"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-auto gap-0 p-0 text-xs font-medium text-muted-foreground uppercase hover:text-foreground"
        >
          {t('Status')}
          <ArrowUpDownIcon className="size-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const event = row.original
        return (
          <Badge variant={resolveStatusVariant(event.status)} className="capitalize">
            {event.status}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'volume',
      id: 'volume',
      header: () => (
        <div className="text-xs font-medium text-muted-foreground uppercase">
          {t('Volume (24h/Total)')}
        </div>
      ),
      cell: ({ row }) => {
        const event = row.original
        return (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {formatCompactCurrency(event.volume_24h)}
            {' / '}
            {formatCompactCurrency(event.volume)}
          </span>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'created_at',
      id: 'created_at',
      header: ({ column }) => (
        <Button
          type="button"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-auto gap-0 p-0 text-xs font-medium text-muted-foreground uppercase hover:text-foreground"
        >
          {t('Created')}
          <ArrowUpDownIcon className="size-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatDate(new Date(row.original.created_at))}
        </span>
      ),
    },
    {
      accessorKey: 'end_date',
      id: 'end_date',
      header: ({ column }) => (
        <Button
          type="button"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="h-auto gap-0 p-0 text-xs font-medium text-muted-foreground uppercase hover:text-foreground"
        >
          {t('End')}
          <ArrowUpDownIcon className="size-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const endDate = row.original.end_date ? new Date(row.original.end_date) : null
        return (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {endDate ? formatDate(endDate) : t('Not set')}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: () => (
        <div className="w-full text-right text-xs font-medium text-muted-foreground uppercase">
          {t('Actions')}
        </div>
      ),
      cell: ({ row }) => {
        const event = row.original
        const hiddenUpdatePending = isUpdatingHidden(event.id)
        const nextHiddenState = !event.is_hidden
        const shouldHideSportsAdminControls = isSportsAuxiliaryEventSlug(event.slug)

        return (
          <div className="flex w-full items-center justify-end gap-1">
            {canResolve && event.is_sports_games_moneyline && !shouldHideSportsAdminControls && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`size-8 ${event.sports_ended
                      ? 'text-primary hover:text-primary'
                      : 'text-muted-foreground'}`}
                    onClick={() => onOpenSportsFinalModal(event)}
                    aria-label={t('Set sports final status')}
                  >
                    <TrophyIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Set sports final status')}</TooltipContent>
              </Tooltip>
            )}

            {canResolve && !shouldHideSportsAdminControls && event.status !== 'resolved' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onOpenResolutionModal(event)}
                    aria-label={t('Resolve Market')}
                  >
                    <CheckCircleIcon className="size-4 text-green-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Resolve Market')}</TooltipContent>
              </Tooltip>
            )}

            {canClose && event.status === 'active' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-amber-500 hover:text-amber-500"
                    onClick={() => onOpenCloseModal(event)}
                    aria-label={t('Close market')}
                  >
                    <LockIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Close market')}</TooltipContent>
              </Tooltip>
            )}

            {canEdit && !shouldHideSportsAdminControls && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onOpenLivestreamModal(event)}
                    aria-label={event.livestream_url ? t('Edit livestream URL') : t('Add livestream URL')}
                  >
                    <RadioIcon className={`size-4 ${event.livestream_url ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {event.livestream_url ? t('Edit livestream URL') : t('Add livestream URL')}
                </TooltipContent>
              </Tooltip>
            )}

            {canEdit && !shouldHideSportsAdminControls && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onOpenAdditionalContextModal(event)}
                    aria-label={t({ id: 'adminEventsAddAdditionalContext', message: 'Add Additional Context' })}
                  >
                    <BadgeInfoIcon
                      className={`size-[18px] ${event.additional_context
                        ? 'fill-primary/12 text-primary'
                        : 'fill-muted-foreground/10 text-muted-foreground'}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t({ id: 'adminEventsAddAdditionalContext', message: 'Add Additional Context' })}
                </TooltipContent>
              </Tooltip>
            )}

            {onOpenTradersModal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onOpenTradersModal(event)}
                    aria-label={t('View users')}
                  >
                    <UsersIcon className="size-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('View users')}</TooltipContent>
              </Tooltip>
            )}

            {canModerate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`size-8 ${event.is_hidden ? 'text-red-500 hover:text-red-500' : 'text-muted-foreground'}`}
                    onClick={() => onToggleHidden(event, nextHiddenState)}
                    disabled={hiddenUpdatePending}
                    aria-label={event.is_hidden ? t('Show event') : t('Hide event')}
                  >
                    {event.is_hidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {event.is_hidden ? t('Show event') : t('Hide event')}
                </TooltipContent>
              </Tooltip>
            )}

            {canModerate && onOpenDeleteModal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onOpenDeleteModal(event)}
                    aria-label={t('Delete event')}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Delete event')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
