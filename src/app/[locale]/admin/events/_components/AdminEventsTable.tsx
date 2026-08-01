'use client'

import type { RowSelectionState } from '@tanstack/react-table'
import type { AdminEventRow, AdminEventsView } from '@/app/[locale]/admin/events/_hooks/useAdminEvents'
import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon, FilterIcon, Loader2Icon, SearchIcon, SettingsIcon, TrophyIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataTable } from '@/app/[locale]/admin/_components/DataTable'
import { deleteAdminEventAction } from '@/app/[locale]/admin/events/_actions/delete-event'
import { updateEventAdditionalContextAction } from '@/app/[locale]/admin/events/_actions/update-event-additional-context'
import { updateEventLivestreamUrlAction } from '@/app/[locale]/admin/events/_actions/update-event-livestream-url'
import { updateEventSportsFinalStateAction } from '@/app/[locale]/admin/events/_actions/update-event-sports-final-state'
import { updateEventSyncSettingsAction } from '@/app/[locale]/admin/events/_actions/update-event-sync-settings'
import { updateEventVisibilityAction } from '@/app/[locale]/admin/events/_actions/update-event-visibility'
import { useAdminEventsColumns } from '@/app/[locale]/admin/events/_components/columns'
import { useAdminEventsTable } from '@/app/[locale]/admin/events/_hooks/useAdminEvents'
import AppLink from '@/components/AppLink'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { InputError } from '@/components/ui/input-error'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatDate } from '@/lib/formatters'
import type { PlatformRole } from '@/lib/staff-role'
import { cn } from '@/lib/utils'

interface AdminEventsTableProps {
  initialAutoDeployNewEventsEnabled: boolean
  mainCategoryOptions: { slug: string, name: string }[]
  role: PlatformRole
}

type AdminResolutionType = 'binary' | 'single-winner' | 'multiple-winner'

interface EventTraderRow {
  user: {
    id: string
    email: string | null
    username: string | null
    displayName: string | null
  }
  tradeCount: number
  firstTradeAt: string | null
  lastTradeAt: string | null
}

function parseSportsScoreParts(score: string | null | undefined) {
  const trimmed = score?.trim()
  if (!trimmed) {
    return { home: '', away: '' }
  }

  const match = trimmed.match(/(\d+)\D+(\d+)/)
  if (!match) {
    return { home: '', away: '' }
  }

  return {
    home: match[1] ?? '',
    away: match[2] ?? '',
  }
}

function parseMatchTeamsFromTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim() ?? ''
  if (!trimmedTitle) {
    return { home: 'Team 1', away: 'Team 2' }
  }

  const splitters = [/\s+vs\.?\s+/i, /\s+x\s+/i, /\s+v\s+/i]
  for (const splitter of splitters) {
    const parts = trimmedTitle.split(splitter).map(part => part.trim()).filter(Boolean)
    if (parts.length === 2) {
      return {
        home: parts[0]!,
        away: parts[1]!,
      }
    }
  }

  return { home: 'Team 1', away: 'Team 2' }
}

function resolveGameDateFromAdminEvent(event: AdminEventRow | null): Date | null {
  if (!event) {
    return null
  }

  if (event.end_date) {
    const parsedEndDate = new Date(event.end_date)
    if (!Number.isNaN(parsedEndDate.getTime())) {
      return parsedEndDate
    }
  }

  const slugMatch = event.slug.match(/(\d{4})-(\d{2})-(\d{2})$/)
  if (!slugMatch) {
    return null
  }

  const year = Number.parseInt(slugMatch[1] ?? '', 10)
  const monthIndex = Number.parseInt(slugMatch[2] ?? '', 10) - 1
  const day = Number.parseInt(slugMatch[3] ?? '', 10)
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return null
  }

  return new Date(year, monthIndex, day)
}

function formatDayMonthLabel(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

function useAdminEventsTableState(initialAutoDeployNewEventsEnabled: boolean, role: PlatformRole) {
  const t = useExtracted()
  const queryClient = useQueryClient()

  const {
    events,
    totalCount,
    isLoading,
    error,
    retry,
    pageIndex,
    pageSize,
    search,
    sortBy,
    sortOrder,
    mainCategorySlug,
    creator,
    creatorOptions,
    seriesSlug,
    seriesOptions,
    activeOnly,
    view,
    handleSearchChange,
    handleSortChange,
    handleMainCategoryChange,
    handleCreatorChange,
    handleSeriesSlugChange,
    handleActiveOnlyChange,
    handleViewChange,
    handlePageChange,
    handlePageSizeChange,
  } = useAdminEventsTable()

  const [pendingHiddenId, setPendingHiddenId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savedAutoDeployEnabled, setSavedAutoDeployEnabled] = useState(initialAutoDeployNewEventsEnabled)
  const [draftAutoDeployEnabled, setDraftAutoDeployEnabled] = useState(initialAutoDeployNewEventsEnabled)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [livestreamEvent, setLivestreamEvent] = useState<AdminEventRow | null>(null)
  const [livestreamUrlValue, setLivestreamUrlValue] = useState('')
  const [livestreamError, setLivestreamError] = useState<string | null>(null)
  const [isSavingLivestream, setIsSavingLivestream] = useState(false)
  const [additionalContextEvent, setAdditionalContextEvent] = useState<AdminEventRow | null>(null)
  const [additionalContextValue, setAdditionalContextValue] = useState('')
  const [additionalContextError, setAdditionalContextError] = useState<string | null>(null)
  const [isSavingAdditionalContext, setIsSavingAdditionalContext] = useState(false)
  const [sportsFinalEvent, setSportsFinalEvent] = useState<AdminEventRow | null>(null)
  const [sportsEndedValue, setSportsEndedValue] = useState(false)
  const [sportsScoreHomeValue, setSportsScoreHomeValue] = useState('')
  const [sportsScoreAwayValue, setSportsScoreAwayValue] = useState('')
  const [sportsFinalError, setSportsFinalError] = useState<string | null>(null)
  const [isSavingSportsFinal, setIsSavingSportsFinal] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftMainCategorySlug, setDraftMainCategorySlug] = useState(mainCategorySlug)
  const [draftCreator, setDraftCreator] = useState(creator)
  const [draftSeriesSlug, setDraftSeriesSlug] = useState(seriesSlug)
  const [resolveEvent, setResolveEvent] = useState<AdminEventRow | null>(null)
  const [resolveOutcomes, setResolveOutcomes] = useState<{ tokenId: string, outcomeText: string }[]>([])
  const [resolveType, setResolveType] = useState<AdminResolutionType>('binary')
  const [resolveSearch, setResolveSearch] = useState('')
  const [resolveSelectedTokenIds, setResolveSelectedTokenIds] = useState<string[]>([])
  const [isResolving, setIsResolving] = useState(false)
  const [isFetchingOutcomes, setIsFetchingOutcomes] = useState(false)
  const [closeEvent, setCloseEvent] = useState<AdminEventRow | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [deleteEvent, setDeleteEvent] = useState<AdminEventRow | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [tradersEvent, setTradersEvent] = useState<AdminEventRow | null>(null)
  const [eventTraders, setEventTraders] = useState<EventTraderRow[]>([])
  const [isLoadingTraders, setIsLoadingTraders] = useState(false)
  const [tradersError, setTradersError] = useState<string | null>(null)
  const filteredResolveOutcomes = useMemo(() => {
    const query = resolveSearch.trim().toLocaleLowerCase()
    return query
      ? resolveOutcomes.filter(outcome => outcome.outcomeText.toLocaleLowerCase().includes(query))
      : resolveOutcomes
  }, [resolveOutcomes, resolveSearch])

  const handleToggleHidden = useCallback(async (event: AdminEventRow, checked: boolean) => {
    setPendingHiddenId(event.id)

    try {
      const result = await updateEventVisibilityAction(event.id, checked)
      if (result.success) {
        toast.success(checked
          ? t('{name} is now hidden from public event lists.', { name: event.title })
          : t('{name} is now visible in public event lists.', { name: event.title }))
        void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      }
      else {
        toast.error(result.error || t('Failed to update event visibility'))
      }
    }
    catch (error) {
      console.error('Failed to update event visibility', error)
      toast.error(t('Failed to update event visibility'))
    }
    finally {
      setPendingHiddenId(null)
    }
  }, [queryClient, t])

  const handleOpenSettings = useCallback(() => {
    setDraftAutoDeployEnabled(savedAutoDeployEnabled)
    setSettingsOpen(true)
  }, [savedAutoDeployEnabled])

  const handleCloseSettings = useCallback(() => {
    if (isSavingSettings) {
      return
    }
    setDraftAutoDeployEnabled(savedAutoDeployEnabled)
    setSettingsOpen(false)
  }, [isSavingSettings, savedAutoDeployEnabled])

  const handleSaveSettings = useCallback(async () => {
    setIsSavingSettings(true)
    try {
      const result = await updateEventSyncSettingsAction(draftAutoDeployEnabled)
      if (result.success) {
        setSavedAutoDeployEnabled(draftAutoDeployEnabled)
        toast.success(draftAutoDeployEnabled
          ? t('New events will be auto-deployed.')
          : t('New events now require manual activation.'))
        setSettingsOpen(false)
      }
      else {
        toast.error(result.error || t('Failed to update event sync settings'))
      }
    }
    catch (error) {
      console.error('Failed to update event sync settings', error)
      toast.error(t('Failed to update event sync settings'))
    }
    finally {
      setIsSavingSettings(false)
    }
  }, [draftAutoDeployEnabled, t])

  const handleOpenFilters = useCallback(() => {
    setDraftMainCategorySlug(mainCategorySlug)
    setDraftCreator(creator)
    setDraftSeriesSlug(seriesSlug)
    setFiltersOpen(true)
  }, [mainCategorySlug, creator, seriesSlug])

  const handleApplyFilters = useCallback(() => {
    handleMainCategoryChange(draftMainCategorySlug)
    handleCreatorChange(draftCreator)
    handleSeriesSlugChange(draftSeriesSlug)
    setFiltersOpen(false)
  }, [
    draftMainCategorySlug,
    draftCreator,
    draftSeriesSlug,
    handleMainCategoryChange,
    handleCreatorChange,
    handleSeriesSlugChange,
  ])

  const handleClearFilters = useCallback(() => {
    handleMainCategoryChange('all')
    handleCreatorChange('all')
    handleSeriesSlugChange('all')
    handleActiveOnlyChange(false)
  }, [handleMainCategoryChange, handleCreatorChange, handleSeriesSlugChange, handleActiveOnlyChange])

  const handleOpenLivestreamModal = useCallback((event: AdminEventRow) => {
    setLivestreamEvent(event)
    setLivestreamUrlValue(event.livestream_url ?? '')
    setLivestreamError(null)
  }, [])

  const handleOpenAdditionalContextModal = useCallback((event: AdminEventRow) => {
    setAdditionalContextEvent(event)
    setAdditionalContextValue(event.additional_context ?? '')
    setAdditionalContextError(null)
  }, [])

  const handleCloseAdditionalContextModal = useCallback(() => {
    if (isSavingAdditionalContext) {
      return
    }

    setAdditionalContextEvent(null)
    setAdditionalContextValue('')
    setAdditionalContextError(null)
  }, [isSavingAdditionalContext])

  const handleCloseLivestreamModal = useCallback(() => {
    if (isSavingLivestream) {
      return
    }

    setLivestreamEvent(null)
    setLivestreamUrlValue('')
    setLivestreamError(null)
  }, [isSavingLivestream])

  const handleSaveLivestreamUrl = useCallback(async () => {
    if (!livestreamEvent) {
      return
    }

    setIsSavingLivestream(true)
    setLivestreamError(null)

    const result = await updateEventLivestreamUrlAction(livestreamEvent.id, livestreamUrlValue)
    if (result.success) {
      toast.success(livestreamUrlValue.trim()
        ? t('Livestream URL updated for {name}.', { name: livestreamEvent.title })
        : t('Livestream URL removed for {name}.', { name: livestreamEvent.title }))
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      setLivestreamEvent(null)
      setLivestreamUrlValue('')
      setLivestreamError(null)
      setIsSavingLivestream(false)
      return
    }

    setLivestreamError(result.error ?? t('Failed to update livestream URL'))
    setIsSavingLivestream(false)
  }, [livestreamEvent, livestreamUrlValue, queryClient, t])

  const handleSaveAdditionalContext = useCallback(async () => {
    if (!additionalContextEvent) {
      return
    }

    setIsSavingAdditionalContext(true)
    setAdditionalContextError(null)

    try {
      const result = await updateEventAdditionalContextAction(additionalContextEvent.id, additionalContextValue)
      if (result.success) {
        toast.success(additionalContextValue.trim()
          ? t({
              id: 'adminEventsAdditionalContextUpdatedToast',
              message: 'Additional context updated for {name}.',
              values: { name: additionalContextEvent.title },
            })
          : t({
              id: 'adminEventsAdditionalContextRemovedToast',
              message: 'Additional context removed for {name}.',
              values: { name: additionalContextEvent.title },
            }))
        void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
        setAdditionalContextEvent(null)
        setAdditionalContextValue('')
        setAdditionalContextError(null)
        return
      }

      setAdditionalContextError(result.error ?? t({
        id: 'adminEventsAdditionalContextFailed',
        message: 'Failed to update additional context',
      }))
    }
    catch (error) {
      setAdditionalContextError(error instanceof Error && error.message
        ? error.message
        : t({
            id: 'adminEventsAdditionalContextFailed',
            message: 'Failed to update additional context',
          }))
    }
    finally {
      setIsSavingAdditionalContext(false)
    }
  }, [additionalContextEvent, additionalContextValue, queryClient, t])

  const handleOpenSportsFinalModal = useCallback((event: AdminEventRow) => {
    const parsedScore = parseSportsScoreParts(event.sports_score)
    setSportsFinalEvent(event)
    setSportsEndedValue(event.sports_ended === true)
    setSportsScoreHomeValue(parsedScore.home)
    setSportsScoreAwayValue(parsedScore.away)
    setSportsFinalError(null)
  }, [])

  function handleCloseSportsFinalModal() {
    setSportsFinalEvent(null)
    setSportsEndedValue(false)
    setSportsScoreHomeValue('')
    setSportsScoreAwayValue('')
    setSportsFinalError(null)
  }

  const handleOpenResolutionModal = useCallback(async (event: AdminEventRow) => {
    setResolveEvent(event)
    setResolveSelectedTokenIds([])
    setResolveType('binary')
    setResolveSearch('')
    setIsFetchingOutcomes(true)
    try {
      const response = await fetch(`/api/admin/resolve-event?eventId=${encodeURIComponent(event.id)}`, {
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok || !Array.isArray(result.data)) {
        throw new Error(result.error || 'Failed to fetch outcomes')
      }
      setResolveOutcomes(result.data)
      setResolveType(
        result.resolutionType === 'multiple-winner' || result.resolutionType === 'single-winner'
          ? result.resolutionType
          : 'binary',
      )
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch outcomes')
      setResolveEvent(null)
    }
    finally {
      setIsFetchingOutcomes(false)
    }
  }, [])

  function handleCloseResolutionModal() {
    setResolveEvent(null)
    setResolveOutcomes([])
    setResolveSelectedTokenIds([])
    setResolveType('binary')
    setResolveSearch('')
  }

  function handleToggleResolutionOutcome(tokenId: string) {
    setResolveSelectedTokenIds((current) => {
      if (resolveType !== 'multiple-winner') {
        return [tokenId]
      }
      return current.includes(tokenId)
        ? current.filter(value => value !== tokenId)
        : [...current, tokenId]
    })
  }

  async function handleResolveMarket() {
    if (!resolveEvent || resolveSelectedTokenIds.length === 0) { return }
    setIsResolving(true)
    try {
      const response = await fetch('/api/admin/resolve-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: resolveEvent.id, winningTokenIds: resolveSelectedTokenIds }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resolve market')
      }
      toast.success('Market resolved and payouts calculated successfully!')
      handleCloseResolutionModal()
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
    }
    catch (error: any) {
      toast.error(error.message)
    }
    finally {
      setIsResolving(false)
    }
  }

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false)
  const [bulkOutcomesMap, setBulkOutcomesMap] = useState<Record<string, {
    outcomes: { tokenId: string, outcomeText: string }[]
    resolutionType: AdminResolutionType
    selectedTokenIds: string[]
    isLoading: boolean
  }>>({})
  const [isBulkResolving, setIsBulkResolving] = useState(false)

  const selectedEvents = useMemo(() => {
    return Object.keys(rowSelection)
      .map(Number)
      .filter(index => !isNaN(index) && rowSelection[index])
      .map(index => events[index])
      .filter(Boolean) as AdminEventRow[]
  }, [rowSelection, events])

  const handleOpenBulkResolveModal = useCallback(async () => {
    setBulkResolveOpen(true)
    for (const event of selectedEvents) {
      if (bulkOutcomesMap[event.id]) continue
      setBulkOutcomesMap(prev => ({
        ...prev,
        [event.id]: { outcomes: [], resolutionType: 'binary', selectedTokenIds: [], isLoading: true }
      }))
      try {
        const response = await fetch(`/api/admin/resolve-event?eventId=${encodeURIComponent(event.id)}`, { cache: 'no-store' })
        const result = await response.json()
        if (response.ok && Array.isArray(result.data)) {
          setBulkOutcomesMap(prev => ({
            ...prev,
            [event.id]: {
              outcomes: result.data,
              resolutionType: result.resolutionType || 'binary',
              selectedTokenIds: [],
              isLoading: false,
            }
          }))
        }
        else {
          setBulkOutcomesMap(prev => ({
            ...prev,
            [event.id]: { outcomes: [], resolutionType: 'binary', selectedTokenIds: [], isLoading: false }
          }))
        }
      }
      catch {
        setBulkOutcomesMap(prev => ({
          ...prev,
          [event.id]: { outcomes: [], resolutionType: 'binary', selectedTokenIds: [], isLoading: false }
        }))
      }
    }
  }, [selectedEvents, bulkOutcomesMap])

  const handleToggleBulkOutcome = useCallback((eventId: string, tokenId: string, resolutionType: AdminResolutionType) => {
    setBulkOutcomesMap((prev) => {
      const current = prev[eventId]
      if (!current) return prev
      const isSelected = current.selectedTokenIds.includes(tokenId)
      const nextTokenIds = resolutionType === 'multiple-winner'
        ? (isSelected ? current.selectedTokenIds.filter(id => id !== tokenId) : [...current.selectedTokenIds, tokenId])
        : [tokenId]
      return {
        ...prev,
        [eventId]: { ...current, selectedTokenIds: nextTokenIds }
      }
    })
  }, [])

  const handleExecuteBulkResolve = useCallback(async () => {
    setIsBulkResolving(true)
    let successCount = 0
    let failureCount = 0

    for (const event of selectedEvents) {
      const data = bulkOutcomesMap[event.id]
      if (!data || data.selectedTokenIds.length === 0) continue

      try {
        const response = await fetch('/api/admin/resolve-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id, winningTokenIds: data.selectedTokenIds }),
        })
        if (response.ok) {
          successCount++
        }
        else {
          failureCount++
        }
      }
      catch {
        failureCount++
      }
    }

    setIsBulkResolving(false)
    setBulkResolveOpen(false)
    setRowSelection({})
    void queryClient.invalidateQueries({ queryKey: ['admin-events'] })

    if (successCount > 0) {
      toast.success(t('Successfully resolved {count} markets.', { count: String(successCount) }))
    }
    if (failureCount > 0) {
      toast.error(t('Failed to resolve {count} markets.', { count: String(failureCount) }))
    }
  }, [selectedEvents, bulkOutcomesMap, queryClient, t])

  async function handleCloseMarket() {
    if (!closeEvent) {
      return
    }
    setIsClosing(true)
    try {
      const response = await fetch('/api/admin/market-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: closeEvent.id, status: 'closed' }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to close market')
      }
      toast.success(t('{name} is closed to new trades.', { name: closeEvent.title }))
      setCloseEvent(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : t('Failed to close market'))
    }
    finally {
      setIsClosing(false)
    }
  }

  async function handleDeleteEvent() {
    if (!deleteEvent) {
      return
    }
    setIsDeleting(true)
    try {
      const result = await deleteAdminEventAction(deleteEvent.id)
      if (result.success) {
        toast.success(t('{name} has been deleted.', { name: deleteEvent.title }))
        setDeleteEvent(null)
        void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      }
      else {
        toast.error(result.error || t('Failed to delete event'))
      }
    }
    catch (error) {
      toast.error(t('Failed to delete event'))
    }
    finally {
      setIsDeleting(false)
    }
  }

  const handleSaveSportsFinalState = useCallback(async () => {
    if (!sportsFinalEvent) {
      return
    }

    setIsSavingSportsFinal(true)
    setSportsFinalError(null)

    const normalizedHomeScore = sportsScoreHomeValue.trim()
    const normalizedAwayScore = sportsScoreAwayValue.trim()
    const hasHomeScore = normalizedHomeScore.length > 0
    const hasAwayScore = normalizedAwayScore.length > 0

    if (hasHomeScore !== hasAwayScore) {
      setSportsFinalError(t('Fill both team scores or leave both empty.'))
      setIsSavingSportsFinal(false)
      return
    }

    if ((hasHomeScore && !/^\d+$/.test(normalizedHomeScore)) || (hasAwayScore && !/^\d+$/.test(normalizedAwayScore))) {
      setSportsFinalError(t('Scores must contain numbers only.'))
      setIsSavingSportsFinal(false)
      return
    }




    const sportsScore = hasHomeScore && hasAwayScore
      ? `${Number.parseInt(normalizedHomeScore, 10)} - ${Number.parseInt(normalizedAwayScore, 10)}`
      : ''

    const result = await updateEventSportsFinalStateAction(sportsFinalEvent.id, {
      sportsEnded: sportsEndedValue,
      sportsScore,
    })
    if (result.success) {
      toast.success(sportsEndedValue
        ? t('{name} marked as final.', { name: sportsFinalEvent.title })
        : t('{name} updated.', { name: sportsFinalEvent.title }))
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] })
      setSportsFinalEvent(null)
      setSportsEndedValue(false)
      setSportsScoreHomeValue('')
      setSportsScoreAwayValue('')
      setSportsFinalError(null)
      setIsSavingSportsFinal(false)
      return
    }

    setSportsFinalError(result.error ?? t('Failed to update sports final state'))
    setIsSavingSportsFinal(false)
  }, [sportsFinalEvent, sportsEndedValue, sportsScoreHomeValue, sportsScoreAwayValue, queryClient, t])

  const handleOpenTradersModal = useCallback(async (event: AdminEventRow) => {
    setTradersEvent(event)
    setEventTraders([])
    setTradersError(null)
    setIsLoadingTraders(true)
    try {
      const response = await fetch(`/admin/api/events/${encodeURIComponent(event.id)}/traders`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || t('Failed to fetch event users'))
      }
      setEventTraders(Array.isArray(payload?.data) ? payload.data : [])
    }
    catch (error) {
      setTradersError(error instanceof Error ? error.message : t('Failed to fetch event users'))
    }
    finally {
      setIsLoadingTraders(false)
    }
  }, [t])

  const columns = useAdminEventsColumns({
    onToggleHidden: handleToggleHidden,
    onOpenAdditionalContextModal: handleOpenAdditionalContextModal,
    onOpenLivestreamModal: handleOpenLivestreamModal,
    onOpenSportsFinalModal: handleOpenSportsFinalModal,
    onOpenResolutionModal: handleOpenResolutionModal,
    onOpenCloseModal: setCloseEvent,
    onOpenDeleteModal: setDeleteEvent,
    onOpenTradersModal: handleOpenTradersModal,
    isUpdatingHidden: id => id === pendingHiddenId,
    canResolve: ['SUPER_ADMIN', 'ADMIN', 'RESOLVER', 'MODERATOR'].includes(role),
    canEdit: ['SUPER_ADMIN', 'ADMIN', 'EDITOR'].includes(role),
    canModerate: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(role),
    canClose: ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(role),
  })

  return {
    events,
    totalCount,
    isLoading,
    error,
    retry,
    pageIndex,
    pageSize,
    search,
    sortBy,
    sortOrder,
    mainCategorySlug,
    creator,
    creatorOptions,
    seriesSlug,
    seriesOptions,
    activeOnly,
    view,
    handleSearchChange,
    handleSortChange,
    handleActiveOnlyChange,
    handleViewChange,
    handlePageChange,
    handlePageSizeChange,
    settingsOpen,
    setSettingsOpen,
    draftAutoDeployEnabled,
    setDraftAutoDeployEnabled,
    isSavingSettings,
    handleOpenSettings,
    handleCloseSettings,
    handleSaveSettings,
    filtersOpen,
    setFiltersOpen,
    draftMainCategorySlug,
    setDraftMainCategorySlug,
    draftCreator,
    setDraftCreator,
    draftSeriesSlug,
    setDraftSeriesSlug,
    handleOpenFilters,
    handleApplyFilters,
    handleClearFilters,
    additionalContextEvent,
    additionalContextValue,
    setAdditionalContextValue,
    additionalContextError,
    isSavingAdditionalContext,
    handleCloseAdditionalContextModal,
    handleSaveAdditionalContext,
    livestreamEvent,
    livestreamUrlValue,
    setLivestreamUrlValue,
    livestreamError,
    isSavingLivestream,
    handleCloseLivestreamModal,
    handleSaveLivestreamUrl,
    sportsFinalEvent,
    sportsEndedValue,
    setSportsEndedValue,
    sportsScoreHomeValue,
    setSportsScoreHomeValue,
    sportsScoreAwayValue,
    setSportsScoreAwayValue,
    sportsFinalError,
    isSavingSportsFinal,
    handleCloseSportsFinalModal,
    handleSaveSportsFinalState,
    resolveEvent,
    resolveSearch,
    setResolveSearch,
    filteredResolveOutcomes,
    resolveType,
    resolveSelectedTokenIds,
    handleToggleResolutionOutcome,
    isResolving,
    isFetchingOutcomes,
    handleCloseResolutionModal,
    handleResolveMarket,
    closeEvent,
    setCloseEvent,
    isClosing,
    handleCloseMarket,
    deleteEvent,
    setDeleteEvent,
    isDeleting,
    handleDeleteEvent,
    tradersEvent,
    setTradersEvent,
    eventTraders,
    isLoadingTraders,
    tradersError,
    columns,
    rowSelection,
    setRowSelection,
    selectedEvents,
    bulkResolveOpen,
    setBulkResolveOpen,
    bulkOutcomesMap,
    isBulkResolving,
    handleOpenBulkResolveModal,
    handleToggleBulkOutcome,
    handleExecuteBulkResolve,
  }
}

export default function AdminEventsTable({
  initialAutoDeployNewEventsEnabled,
  mainCategoryOptions,
  role,
}: AdminEventsTableProps) {
  const t = useExtracted()
  const isMobile = useIsMobile()
  const {
    events,
    totalCount,
    isLoading,
    error,
    retry,
    pageIndex,
    pageSize,
    search,
    sortBy,
    sortOrder,
    mainCategorySlug,
    creator,
    creatorOptions,
    seriesSlug,
    seriesOptions,
    view,
    handleSearchChange,
    handleSortChange,
    handleViewChange,
    handlePageChange,
    handlePageSizeChange,
    settingsOpen,
    setSettingsOpen,
    draftAutoDeployEnabled,
    setDraftAutoDeployEnabled,
    isSavingSettings,
    handleOpenSettings,
    handleCloseSettings,
    handleSaveSettings,
    filtersOpen,
    setFiltersOpen,
    draftMainCategorySlug,
    setDraftMainCategorySlug,
    draftCreator,
    setDraftCreator,
    draftSeriesSlug,
    setDraftSeriesSlug,
    handleOpenFilters,
    handleApplyFilters,
    handleClearFilters,
    additionalContextEvent,
    additionalContextValue,
    setAdditionalContextValue,
    additionalContextError,
    isSavingAdditionalContext,
    handleCloseAdditionalContextModal,
    handleSaveAdditionalContext,
    livestreamEvent,
    livestreamUrlValue,
    setLivestreamUrlValue,
    livestreamError,
    isSavingLivestream,
    handleCloseLivestreamModal,
    handleSaveLivestreamUrl,
    sportsFinalEvent,
    sportsEndedValue,
    setSportsEndedValue,
    sportsScoreHomeValue,
    setSportsScoreHomeValue,
    sportsScoreAwayValue,
    setSportsScoreAwayValue,
    sportsFinalError,
    isSavingSportsFinal,
    handleCloseSportsFinalModal,
    handleSaveSportsFinalState,
    resolveEvent,
    resolveSearch,
    setResolveSearch,
    filteredResolveOutcomes,
    resolveType,
    resolveSelectedTokenIds,
    handleToggleResolutionOutcome,
    isResolving,
    isFetchingOutcomes,
    handleCloseResolutionModal,
    handleResolveMarket,
    closeEvent,
    setCloseEvent,
    isClosing,
    handleCloseMarket,
    deleteEvent,
    setDeleteEvent,
    isDeleting,
    handleDeleteEvent,
    tradersEvent,
    setTradersEvent,
    eventTraders,
    isLoadingTraders,
    tradersError,
    rowSelection,
    setRowSelection,
    selectedEvents,
    bulkResolveOpen,
    setBulkResolveOpen,
    bulkOutcomesMap,
    isBulkResolving,
    handleOpenBulkResolveModal,
    handleToggleBulkOutcome,
    handleExecuteBulkResolve,
    columns,
  } = useAdminEventsTableState(initialAutoDeployNewEventsEnabled, role)
  const canCreate = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'EDITOR'
  const canManageSettings = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const settingsButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" onClick={handleOpenSettings} aria-label={t('Settings')}>
          <SettingsIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('Settings')}</TooltipContent>
    </Tooltip>
  )

  const createEventButton = (
    <Button asChild type="button" className="h-9">
      <AppLink href="/admin/events/calendar">{t('Create Event')}</AppLink>
    </Button>
  )

  const hasAppliedFilters = mainCategorySlug !== 'all'
    || creator !== 'all'
    || seriesSlug !== 'all'

  const filtersButton = (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon" onClick={handleOpenFilters} aria-label={t('Filters')}>
            <FilterIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('Filters')}</TooltipContent>
      </Tooltip>
      {hasAppliedFilters && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            handleClearFilters()
          }}
          className={cn(`
            absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border border-background
            bg-foreground text-background
          `)}
          aria-label={t('Clear filters')}
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </div>
  )

  const marketViews: Array<{ value: AdminEventsView, label: string }> = [
    { value: 'all', label: t('All') },
    { value: 'upcoming', label: t('Upcoming') },
    { value: 'active', label: t('Active') },
    { value: 'ending-today', label: t('Ending today') },
    { value: 'ending-soon', label: t('Ending soon') },
    { value: 'closed', label: t('Closed') },
    { value: 'resolved', label: t('Resolved') },
  ]

  const sportsFinalGameDateLabel = formatDayMonthLabel(resolveGameDateFromAdminEvent(sportsFinalEvent))
  const sportsFinalTeams = sportsFinalEvent ? parseMatchTeamsFromTitle(sportsFinalEvent.title) : null

  const filtersFormFields = (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label>{t('Main category')}</Label>
        <Select value={draftMainCategorySlug} onValueChange={setDraftMainCategorySlug}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder={t('Main category')} />
          </SelectTrigger>
          <SelectContent align="start" className="py-1">
            <SelectItem value="all" className="mx-1 my-0.5 cursor-pointer rounded-md">{t('All categories')}</SelectItem>
            {mainCategoryOptions.map(category => (
              <SelectItem
                key={category.slug}
                value={category.slug}
                className="mx-1 my-0.5 cursor-pointer rounded-md"
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {creatorOptions.length > 1 && (
        <div className="grid gap-2">
          <Label>{t('Creator')}</Label>
          <Select value={draftCreator} onValueChange={setDraftCreator}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder={t('Creator')} />
            </SelectTrigger>
            <SelectContent align="start" className="py-1">
              <SelectItem value="all" className="mx-1 my-0.5 cursor-pointer rounded-md">{t('All creators')}</SelectItem>
              {creatorOptions.map(creatorWallet => (
                <SelectItem
                  key={creatorWallet}
                  value={creatorWallet}
                  className="mx-1 my-0.5 cursor-pointer rounded-md font-mono text-xs"
                >
                  {creatorWallet}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {seriesOptions.length > 0 && (
        <div className="grid gap-2">
          <Label>{t('Series')}</Label>
          <Select value={draftSeriesSlug} onValueChange={setDraftSeriesSlug}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder={t('Series')} />
            </SelectTrigger>
            <SelectContent align="start" className="py-1">
              <SelectItem value="all" className="mx-1 my-0.5 cursor-pointer rounded-md">{t('All series')}</SelectItem>
              {seriesOptions.map(seriesOption => (
                <SelectItem
                  key={seriesOption}
                  value={seriesOption}
                  className="mx-1 my-0.5 cursor-pointer rounded-md"
                >
                  {seriesOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )

  const settingsFormFields = (
    <div className="grid gap-4 py-2">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-deploy-events"
            checked={draftAutoDeployEnabled}
            onCheckedChange={setDraftAutoDeployEnabled}
            disabled={isSavingSettings}
          />
          <Label htmlFor="auto-deploy-events" className="text-sm font-medium">
            {t('Auto-deploy new events')}
          </Label>
        </div>
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            {t('When disabled, new synced events stay hidden until manually enabled in this list.')}
          </p>
        </div>
      </div>
    </div>
  )

  const livestreamFormFields = (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="event-livestream-url">
          {t('Livestream URL')}
        </Label>
        <Input
          id="event-livestream-url"
          type="url"
          placeholder="https://example.com/live"
          value={livestreamUrlValue}
          onChange={event => setLivestreamUrlValue(event.target.value)}
          disabled={isSavingLivestream}
        />
        {livestreamEvent && (
          <p className="text-xs text-muted-foreground">
            {livestreamEvent.title}
          </p>
        )}
      </div>
      {livestreamError && <InputError message={livestreamError} />}
    </div>
  )

  const additionalContextFormFields = (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="event-additional-context">
          {t({ id: 'adminEventsAdditionalContextLabel', message: 'Additional Context' })}
        </Label>
        <Textarea
          id="event-additional-context"
          placeholder={t({
            id: 'adminEventsAdditionalContextPlaceholder',
            message: 'Write the additional context shown in Rules for this event.',
          })}
          value={additionalContextValue}
          onChange={event => setAdditionalContextValue(event.target.value)}
          disabled={isSavingAdditionalContext}
          className="min-h-28"
        />
        {additionalContextEvent && (
          <p className="text-sm text-muted-foreground">
            {additionalContextEvent.title}
          </p>
        )}
      </div>
      {additionalContextError && <InputError message={additionalContextError} />}
    </div>
  )

  const sportsFinalFormFields = (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label>{t('Score')}</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <Input
            id="event-sports-score-home"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="0"
            value={sportsScoreHomeValue}
            onChange={event => setSportsScoreHomeValue(event.target.value)}
            disabled={isSavingSportsFinal}
          />
          <span className="text-sm font-semibold text-muted-foreground">-</span>
          <Input
            id="event-sports-score-away"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="0"
            value={sportsScoreAwayValue}
            onChange={event => setSportsScoreAwayValue(event.target.value)}
            disabled={isSavingSportsFinal}
          />
        </div>
        {sportsFinalTeams && (
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span className="truncate">{sportsFinalTeams.home}</span>
            <span className="truncate text-right">{sportsFinalTeams.away}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="event-sports-ended"
          checked={sportsEndedValue}
          onCheckedChange={setSportsEndedValue}
          disabled={isSavingSportsFinal}
        />
        <Label htmlFor="event-sports-ended">{t('Ended')}</Label>
      </div>

      {sportsFinalError && <InputError message={sportsFinalError} />}
    </div>
  )

  return (
    <>
      <div className="flex max-w-full gap-1 overflow-x-auto border-b pb-2">
        {marketViews.map(item => (
          <Button
            key={item.value}
            type="button"
            variant={view === item.value ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0"
            onClick={() => handleViewChange(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={events}
        totalCount={totalCount}
        searchPlaceholder={t('Search')}
        enablePagination
        enableColumnVisibility={false}
        isLoading={isLoading}
        error={error}
        onRetry={retry}
        emptyMessage={t('No events found')}
        emptyDescription={t('Events created from sync will show up here.')}
        search={search}
        onSearchChange={handleSearchChange}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        enableSelection={true}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        toolbarLeftContent={(
          <div className="flex items-center gap-3">
            {filtersButton}
            {selectedEvents.length > 0 && (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm"
                onClick={() => void handleOpenBulkResolveModal()}
              >
                {t('Resolve selected ({count})', { count: String(selectedEvents.length) })}
              </Button>
            )}
          </div>
        )}
        toolbarRightContent={(
          <div className="flex items-center gap-2">
            {canCreate && createEventButton}
            {canManageSettings && settingsButton}
          </div>
        )}
        searchInputClassName="h-9 sm:w-37.5 lg:w-62.5"
        searchLeadingIcon={<SearchIcon className="size-4" />}
      />

      <Dialog
        open={Boolean(closeEvent)}
        onOpenChange={(open) => {
          if (!open && !isClosing) {
            setCloseEvent(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Close market')}</DialogTitle>
            <DialogDescription>
              {t('Closing {name} immediately prevents every new trade. The market remains unresolved until an authorized reviewer selects the outcome.', { name: closeEvent?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isClosing} onClick={() => setCloseEvent(null)}>
              {t('Cancel')}
            </Button>
            <Button type="button" variant="destructive" disabled={isClosing} onClick={() => void handleCloseMarket()}>
              {isClosing ? t('Closing...') : t('Close market')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isMobile
        ? (
            <Drawer
              open={filtersOpen}
              onOpenChange={(open) => {
                if (open) {
                  setFiltersOpen(true)
                  return
                }
                setFiltersOpen(false)
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>{t('Filters')}</DrawerTitle>
                  </DrawerHeader>
                  {filtersFormFields}
                  <DrawerFooter className="mt-2 p-0">
                    <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                      {t('Cancel')}
                    </Button>
                    <Button type="button" onClick={handleApplyFilters}>
                      {t('Apply')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={filtersOpen}
              onOpenChange={(open) => {
                if (open) {
                  setFiltersOpen(true)
                  return
                }
                setFiltersOpen(false)
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t('Filters')}</DialogTitle>
                </DialogHeader>
                {filtersFormFields}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                    {t('Cancel')}
                  </Button>
                  <Button type="button" onClick={handleApplyFilters}>
                    {t('Apply')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      {isMobile
        ? (
            <Drawer
              open={settingsOpen}
              onOpenChange={(open) => {
                if (open) {
                  setSettingsOpen(true)
                  return
                }
                handleCloseSettings()
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>{t('Events settings')}</DrawerTitle>
                  </DrawerHeader>
                  {settingsFormFields}
                  <DrawerFooter className="mt-2 p-0">
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSaveSettings()
                      }}
                      disabled={isSavingSettings}
                    >
                      {isSavingSettings ? t('Saving...') : t('Save')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={settingsOpen}
              onOpenChange={(open) => {
                if (open) {
                  setSettingsOpen(true)
                  return
                }
                handleCloseSettings()
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t('Events settings')}</DialogTitle>
                </DialogHeader>
                {settingsFormFields}
                <DialogFooter>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSaveSettings()
                    }}
                    disabled={isSavingSettings}
                  >
                    {isSavingSettings ? t('Saving...') : t('Save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      {isMobile
        ? (
            <Drawer
              open={Boolean(additionalContextEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseAdditionalContextModal()
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>
                      {t({ id: 'adminEventsAddAdditionalContext', message: 'Add Additional Context' })}
                    </DrawerTitle>
                    <DrawerDescription>
                      {t({
                        id: 'adminEventsAdditionalContextDescription',
                        message: 'Configure the additional context shown in Rules for this event. Leave empty to remove it.',
                      })}
                    </DrawerDescription>
                  </DrawerHeader>
                  {additionalContextFormFields}
                  <DrawerFooter className="mt-2 p-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseAdditionalContextModal}
                      disabled={isSavingAdditionalContext}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSaveAdditionalContext()
                      }}
                      disabled={isSavingAdditionalContext}
                    >
                      {isSavingAdditionalContext ? t('Saving...') : t('Save')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={Boolean(additionalContextEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseAdditionalContextModal()
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {t({ id: 'adminEventsAddAdditionalContext', message: 'Add Additional Context' })}
                  </DialogTitle>
                  <DialogDescription>
                    {t({
                      id: 'adminEventsAdditionalContextDescription',
                      message: 'Configure the additional context shown in Rules for this event. Leave empty to remove it.',
                    })}
                  </DialogDescription>
                </DialogHeader>
                {additionalContextFormFields}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseAdditionalContextModal}
                    disabled={isSavingAdditionalContext}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSaveAdditionalContext()
                    }}
                    disabled={isSavingAdditionalContext}
                  >
                    {isSavingAdditionalContext ? t('Saving...') : t('Save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      {isMobile
        ? (
            <Drawer
              open={Boolean(livestreamEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseLivestreamModal()
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>
                      {livestreamEvent?.livestream_url ? t('Edit livestream URL') : t('Add livestream URL')}
                    </DrawerTitle>
                    <DrawerDescription>
                      {t('Configure the livestream URL for this event. Leave empty to remove it.')}
                    </DrawerDescription>
                  </DrawerHeader>
                  {livestreamFormFields}
                  <DrawerFooter className="mt-2 p-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseLivestreamModal}
                      disabled={isSavingLivestream}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSaveLivestreamUrl()
                      }}
                      disabled={isSavingLivestream}
                    >
                      {isSavingLivestream ? t('Saving...') : t('Save')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={Boolean(livestreamEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseLivestreamModal()
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {livestreamEvent?.livestream_url ? t('Edit livestream URL') : t('Add livestream URL')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('Configure the livestream URL for this event. Leave empty to remove it.')}
                  </DialogDescription>
                </DialogHeader>
                {livestreamFormFields}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseLivestreamModal}
                    disabled={isSavingLivestream}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSaveLivestreamUrl()
                    }}
                    disabled={isSavingLivestream}
                  >
                    {isSavingLivestream ? t('Saving...') : t('Save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      {isMobile
        ? (
            <Drawer
              open={Boolean(resolveEvent)}
              onOpenChange={(open) => {
                if (!open) { handleCloseResolutionModal() }
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>{t('Resolve Market')}</DrawerTitle>
                    <DrawerDescription className="space-y-1">
                      <span className="block text-base font-semibold text-foreground">{resolveEvent?.title}</span>
                      <span className="block">
                        {resolveType === 'multiple-winner'
                          ? t('Select every winning outcome. Multiple selections are allowed.')
                          : t('Select the winning outcome. Only one selection is allowed.')}
                      </span>
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="space-y-4">
                    {isFetchingOutcomes
                      ? (
                          <div className="text-sm text-muted-foreground">{t('Loading outcomes...')}</div>
                        )
                      : (
                          <div className="grid gap-3">
                            {resolveType !== 'binary' && (
                              <div className="relative">
                                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  value={resolveSearch}
                                  onChange={event => setResolveSearch(event.target.value)}
                                  placeholder={t('Search outcomes')}
                                  className="pl-9"
                                />
                              </div>
                            )}
                            <div className={cn('grid max-h-64 gap-2 overflow-y-auto', resolveType === 'binary' && 'grid-cols-2')}>
                              {filteredResolveOutcomes.map(outcome => (
                                <Button
                                  key={outcome.tokenId}
                                  type="button"
                                  variant={resolveSelectedTokenIds.includes(outcome.tokenId) ? 'secondary' : 'outline'}
                                  className="justify-between"
                                  onClick={() => handleToggleResolutionOutcome(outcome.tokenId)}
                                >
                                  <span>{outcome.outcomeText}</span>
                                  {resolveSelectedTokenIds.includes(outcome.tokenId) && <CheckIcon className="size-4" />}
                                </Button>
                              ))}
                              {filteredResolveOutcomes.length === 0 && (
                                <p className="py-3 text-center text-sm text-muted-foreground">{t('No outcomes found')}</p>
                              )}
                            </div>
                          </div>
                        )}
                  </div>
                  <DrawerFooter className="mt-2 p-0">
                    <Button type="button" variant="outline" onClick={handleCloseResolutionModal} disabled={isResolving}>
                      {t('Cancel')}
                    </Button>
                    <Button type="button" onClick={handleResolveMarket} disabled={isResolving || resolveSelectedTokenIds.length === 0}>
                      {isResolving ? t('Resolving...') : t('Confirm Resolution')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={Boolean(resolveEvent)}
              onOpenChange={(open) => {
                if (!open) { handleCloseResolutionModal() }
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t('Resolve Market')}</DialogTitle>
                  <DialogDescription className="space-y-1">
                    <span className="block text-lg font-semibold text-foreground">{resolveEvent?.title}</span>
                    <span className="block">
                      {resolveType === 'multiple-winner'
                        ? t('Select every winning outcome. Multiple selections are allowed.')
                        : t('Select the winning outcome. Only one selection is allowed.')}
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {isFetchingOutcomes
                    ? (
                        <div className="text-sm text-muted-foreground">{t('Loading outcomes...')}</div>
                      )
                    : (
                        <div className="grid gap-3">
                          {resolveType !== 'binary' && (
                            <div className="relative">
                              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={resolveSearch}
                                onChange={event => setResolveSearch(event.target.value)}
                                placeholder={t('Search outcomes')}
                                className="pl-9"
                              />
                            </div>
                          )}
                            <div className={cn('grid max-h-64 gap-2 overflow-y-auto', resolveType === 'binary' && 'grid-cols-2')}>
                              {filteredResolveOutcomes.map((outcome) => {
                                const isSelected = resolveSelectedTokenIds.includes(outcome.tokenId)
                                const lowerText = outcome.outcomeText.toLowerCase()
                                const isYes = lowerText === 'yes' || lowerText.includes('yes')
                                const isNo = lowerText === 'no' || lowerText.includes('no')

                                let buttonClass = ''
                                if (isYes) {
                                  buttonClass = isSelected
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600 font-semibold shadow-sm'
                                    : 'border-emerald-600/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-700'
                                }
                                else if (isNo) {
                                  buttonClass = isSelected
                                    ? 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600 font-semibold shadow-sm'
                                    : 'border-rose-600/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-700'
                                }

                                return (
                                  <Button
                                    key={outcome.tokenId}
                                    type="button"
                                    variant={isSelected ? 'secondary' : 'outline'}
                                    className={cn('justify-between transition-colors', buttonClass)}
                                    onClick={() => handleToggleResolutionOutcome(outcome.tokenId)}
                                  >
                                    <span>{outcome.outcomeText}</span>
                                    {isSelected && <CheckIcon className="size-4" />}
                                  </Button>
                                )
                              })}
                              {filteredResolveOutcomes.length === 0 && (
                                <p className="py-3 text-center text-sm text-muted-foreground">{t('No outcomes found')}</p>
                              )}
                            </div>
                        </div>
                      )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseResolutionModal} disabled={isResolving}>
                    {t('Cancel')}
                  </Button>
                  <Button type="button" onClick={handleResolveMarket} disabled={isResolving || resolveSelectedTokenIds.length === 0}>
                    {isResolving ? t('Resolving...') : t('Confirm Resolution')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      {isMobile
        ? (
            <Drawer
              open={Boolean(sportsFinalEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseSportsFinalModal()
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>{t('Sports final status')}</DrawerTitle>
                    {sportsFinalEvent && (
                      <p className="text-sm text-muted-foreground">
                        {sportsFinalEvent.title}
                        {sportsFinalGameDateLabel ? ` (${sportsFinalGameDateLabel})` : ''}
                      </p>
                    )}
                  </DrawerHeader>
                  {sportsFinalFormFields}
                  <DrawerFooter className="mt-2 p-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseSportsFinalModal}
                      disabled={isSavingSportsFinal}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSaveSportsFinalState()
                      }}
                      disabled={isSavingSportsFinal}
                    >
                      {isSavingSportsFinal ? t('Saving...') : t('Save')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={Boolean(sportsFinalEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseSportsFinalModal()
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t('Sports final status')}</DialogTitle>
                  {sportsFinalEvent && (
                    <p className="text-sm text-muted-foreground">
                      {sportsFinalEvent.title}
                      {sportsFinalGameDateLabel ? ` (${sportsFinalGameDateLabel})` : ''}
                    </p>
                  )}
                </DialogHeader>
                {sportsFinalFormFields}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseSportsFinalModal}
                    disabled={isSavingSportsFinal}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSaveSportsFinalState()
                    }}
                    disabled={isSavingSportsFinal}
                  >
                    {isSavingSportsFinal ? t('Saving...') : t('Save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      {isMobile
        ? (
            <Drawer
              open={Boolean(sportsFinalEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseSportsFinalModal()
              }}
            >
              <DrawerContent className="max-h-[90vh] w-full bg-background px-4 pt-4 pb-6">
                <div className="grid gap-4">
                  <DrawerHeader className="space-y-2 p-0 text-left">
                    <DrawerTitle>{t('Sports final status')}</DrawerTitle>
                    {sportsFinalEvent && (
                      <p className="text-sm text-muted-foreground">
                        {sportsFinalEvent.title}
                        {sportsFinalGameDateLabel ? ` (${sportsFinalGameDateLabel})` : ''}
                      </p>
                    )}
                  </DrawerHeader>
                  {sportsFinalFormFields}
                  <DrawerFooter className="mt-2 p-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseSportsFinalModal}
                      disabled={isSavingSportsFinal}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        void handleSaveSportsFinalState()
                      }}
                      disabled={isSavingSportsFinal}
                    >
                      {isSavingSportsFinal ? t('Saving...') : t('Save')}
                    </Button>
                  </DrawerFooter>
                </div>
              </DrawerContent>
            </Drawer>
          )
        : (
            <Dialog
              open={Boolean(sportsFinalEvent)}
              onOpenChange={(open) => {
                if (open) {
                  return
                }
                handleCloseSportsFinalModal()
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t('Sports final status')}</DialogTitle>
                  {sportsFinalEvent && (
                    <p className="text-sm text-muted-foreground">
                      {sportsFinalEvent.title}
                      {sportsFinalGameDateLabel ? ` (${sportsFinalGameDateLabel})` : ''}
                    </p>
                  )}
                </DialogHeader>
                {sportsFinalFormFields}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseSportsFinalModal}
                    disabled={isSavingSportsFinal}
                  >
                    {t('Cancel')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleSaveSportsFinalState()
                    }}
                    disabled={isSavingSportsFinal}
                  >
                    {isSavingSportsFinal ? t('Saving...') : t('Save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}


      <Dialog
        open={bulkResolveOpen}
        onOpenChange={(open) => {
          if (!open && !isBulkResolving) {
            setBulkResolveOpen(false)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Bulk Resolve Events')}</DialogTitle>
            <DialogDescription>
              {t('Select winning outcomes for the {count} selected events below and confirm resolution.', { count: String(selectedEvents.length) })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedEvents.map((event: any) => {
              const data = bulkOutcomesMap[event.id]
              const isLoading = !data || data.isLoading
              const outcomes = data?.outcomes || []
              const resolutionType = data?.resolutionType || 'binary'
              const selectedTokenIds = data?.selectedTokenIds || []

              return (
                <div key={event.id} className="rounded-lg border bg-card p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2 border-b pb-2">
                    <h4 className="font-semibold text-sm line-clamp-1">{event.title}</h4>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-muted">
                      {resolutionType}
                    </span>
                  </div>

                  {isLoading ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                      <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      {t('Loading outcomes...')}
                    </div>
                  ) : outcomes.length === 0 ? (
                    <p className="text-xs text-destructive">{t('Failed to load outcomes for this market.')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {outcomes.map((outcome: any) => {
                        const isSelected = selectedTokenIds.includes(outcome.tokenId)
                        const isYes = outcome.outcomeText.toLowerCase() === 'yes'
                        const isNo = outcome.outcomeText.toLowerCase() === 'no'

                        let selectedStyle = 'bg-primary text-primary-foreground border-primary'
                        let unselectedStyle = 'border-input hover:bg-accent hover:text-accent-foreground'

                        if (isYes) {
                          selectedStyle = 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500'
                          unselectedStyle = 'border-emerald-600/40 text-emerald-600 hover:bg-emerald-500/10'
                        } else if (isNo) {
                          selectedStyle = 'bg-rose-600 text-white border-rose-600 hover:bg-rose-500'
                          unselectedStyle = 'border-rose-600/40 text-rose-600 hover:bg-rose-500/10'
                        }

                        return (
                          <Button
                            key={outcome.tokenId}
                            type="button"
                            size="sm"
                            variant={isSelected ? 'default' : 'outline'}
                            className={isSelected ? selectedStyle : unselectedStyle}
                            onClick={() => handleToggleBulkOutcome(event.id, outcome.tokenId, resolutionType)}
                          >
                            {outcome.outcomeText}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isBulkResolving}
              onClick={() => setBulkResolveOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              disabled={isBulkResolving || selectedEvents.some((e: any) => !(bulkOutcomesMap[e.id]?.selectedTokenIds?.length > 0))}
              onClick={() => void handleExecuteBulkResolve()}
            >
              {isBulkResolving ? t('Resolving...') : t('Confirm Bulk Resolution')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteEvent)} onOpenChange={(open) => { if (!open) setDeleteEvent(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Delete Event')}</DialogTitle>
            <DialogDescription>
              {t('Are you sure you want to delete "{title}"? This action cannot be undone.', { title: deleteEvent?.title ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteEvent(null)} disabled={isDeleting}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteEvent()} disabled={isDeleting}>
              {isDeleting ? t('Deleting...') : t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tradersEvent)} onOpenChange={(open) => { if (!open) setTradersEvent(null) }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('View users')}</DialogTitle>
            <DialogDescription>{tradersEvent?.title}</DialogDescription>
          </DialogHeader>
          {isLoadingTraders && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t('Loading...')}
            </div>
          )}
          {!isLoadingTraders && tradersError && (
            <p className="py-4 text-sm text-destructive">{tradersError}</p>
          )}
          {!isLoadingTraders && !tradersError && eventTraders.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">{t('No users are trading on this event yet.')}</p>
          )}
          {!isLoadingTraders && !tradersError && eventTraders.length > 0 && (
            <div className="divide-y rounded-md border">
              {eventTraders.map(trader => (
                <div key={trader.user.id} className="grid gap-1 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{trader.user.displayName || trader.user.username || trader.user.email || trader.user.id}</p>
                    {trader.user.email && (
                      <a href={`mailto:${trader.user.email}`} className="truncate text-xs text-muted-foreground underline-offset-4 hover:underline">
                        {trader.user.email}
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground sm:text-right">
                    <div>{trader.tradeCount} {t('trades')}</div>
                    {trader.lastTradeAt && <div>{t('Last')}: {formatDate(new Date(trader.lastTradeAt))}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTradersEvent(null)}>{t('Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
