import type {
  AllowedCreatorCheckState,
  ContentCheckState,
  EventCreationMode,
  FormState,
  FundingCheckState,
  NativeGasCheckState,
  OpenRouterCheckState,
  ProposerWhitelistCheckState,
  SlugValidationState,
} from './admin-create-event-form-types'
import type { AdminSportsFormState, AdminSportsTeamHostStatus } from '@/lib/admin-sports-create'
import { buildAdminSportsStepErrors, isSportsMainCategory } from '@/lib/admin-sports-create'
import { MIN_SUB_CATEGORIES } from './admin-create-event-form-constants'

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol)
  }
  catch {
    return false
  }
}

export function buildStepErrors(
  step: number,
  args: {
    form: FormState
    creationMode: EventCreationMode
    sportsForm: AdminSportsFormState
    hasEventImage: boolean
    hasTeamLogoByHostStatus: Record<AdminSportsTeamHostStatus, boolean>
    slugValidationState: SlugValidationState
    fundingCheckState: FundingCheckState
    nativeGasCheckState: NativeGasCheckState
    allowedCreatorCheckState: AllowedCreatorCheckState
    proposerWhitelistCheckState: ProposerWhitelistCheckState
    openRouterCheckState: OpenRouterCheckState
    contentCheckState: ContentCheckState
    hasPendingAiErrors: boolean
    hasContentCheckFatalError: boolean
    allowPastResolutionDate: boolean
    hasCreatorSelection: boolean
    hasRecurringCadence: boolean
    recurringPreviewErrors: string[]
  },
): string[] {
  const errors: string[] = []
  const sportsEventSelected = isSportsMainCategory(args.form.mainCategorySlug)

  if (step === 1) {
    if (!args.form.title.trim()) {
      errors.push('Event title is required.')
    }

    if (!args.form.slug.trim()) {
      errors.push('Event slug is required.')
    }

    if (!args.form.endDateIso) {
      errors.push('Event end date and time is required.')
    }
    else {
      const parsedEndDate = new Date(args.form.endDateIso)
      if (Number.isNaN(parsedEndDate.getTime())) {
        errors.push('Event end date is invalid.')
      }
      else if (!args.allowPastResolutionDate && parsedEndDate.getTime() <= Date.now()) {
        errors.push('Event end date must be in the future.')
      }

      if (sportsEventSelected && args.sportsForm.startTime) {
        const parsedStartTime = new Date(args.sportsForm.startTime)
        if (!Number.isNaN(parsedStartTime.getTime()) && parsedStartTime.getTime() > parsedEndDate.getTime()) {
          errors.push('Game start date cannot be after the resolution date.')
        }
      }
    }

    if (!args.hasEventImage) {
      errors.push('Event image is required.')
    }

    if (!args.form.mainCategorySlug) {
      errors.push('Main category is required.')
    }

    if (!sportsEventSelected && args.form.categories.length < MIN_SUB_CATEGORIES) {
      errors.push(`Select at least ${MIN_SUB_CATEGORIES} sub categories.`)
    }

    if (args.creationMode === 'recurring') {
      if (!args.hasCreatorSelection) {
        errors.push('Select a creator for recurring deployments.')
      }
      if (!args.hasRecurringCadence) {
        errors.push('Select a valid recurrence cadence.')
      }
    }

    if (sportsEventSelected) {
      errors.push(...buildAdminSportsStepErrors({
        step,
        sports: args.sportsForm,
        hasTeamLogoByHostStatus: args.hasTeamLogoByHostStatus,
      }))

      if (args.form.categories.length < MIN_SUB_CATEGORIES + 1) {
        errors.push(`Add custom sports categories until the total is at least ${MIN_SUB_CATEGORIES + 1}.`)
      }
    }
  }

  if (step === 2) {
    if (sportsEventSelected) {
      errors.push(...buildAdminSportsStepErrors({
        step,
        sports: args.sportsForm,
        hasTeamLogoByHostStatus: args.hasTeamLogoByHostStatus,
      }))
      return errors
    }

    if (!args.form.marketMode) {
      errors.push('Select a market type.')
      return errors
    }

    if (args.form.marketMode === 'binary') {
      if (!args.form.binaryQuestion.trim()) {
        errors.push('Binary question is required.')
      }
      if (!args.form.binaryOutcomeYes.trim() || !args.form.binaryOutcomeNo.trim()) {
        errors.push('Both binary outcomes are required.')
      }
      return errors
    }

    if (args.form.options.length < 2) {
      errors.push('Add at least 2 options for multi-market events.')
    }

    args.form.options.forEach((option, index) => {
      if (!option.question.trim()) {
        errors.push(`Option ${index + 1}: question is required.`)
      }
      if (!option.title.trim()) {
        errors.push(`Option ${index + 1}: title is required.`)
      }
      if (!option.shortName.trim()) {
        errors.push(`Option ${index + 1}: short name is required.`)
      }
      if (!option.slug.trim()) {
        errors.push(`Option ${index + 1}: slug cannot be empty.`)
      }
      if (!option.outcomeYes.trim() || !option.outcomeNo.trim()) {
        errors.push(`Option ${index + 1}: both outcomes are required.`)
      }
    })
  }

  if (step === 3) {
    if (args.form.resolutionSource.trim() && !isValidUrl(args.form.resolutionSource.trim())) {
      errors.push('Resolution source URL is invalid.')
    }

    if (!args.form.resolutionRules.trim()) {
      errors.push('Resolution rules are required.')
    }
    else if (args.form.resolutionRules.trim().length < 60) {
      errors.push('Resolution rules are too short.')
    }

    if (args.creationMode === 'recurring') {
      errors.push(...args.recurringPreviewErrors)
    }
  }

  if (step === 4) {
    // Web3 EOA wallet checks bypassed for SlimefishBackend AMM mode

    if (args.slugValidationState === 'idle' || args.slugValidationState === 'checking') {
      errors.push('Run slug availability check first.')
    }
    else if (args.slugValidationState === 'duplicate') {
      errors.push('Slug already exists in your database.')
    }
    else if (args.slugValidationState === 'error') {
      errors.push('Could not validate slug right now.')
    }

    if (args.openRouterCheckState === 'idle' || args.openRouterCheckState === 'checking') {
      errors.push('Run OpenRouter check first.')
      return errors
    }
    else if (args.openRouterCheckState !== 'ok') {
      errors.push('OpenRouter must be active before content AI checker.')
      return errors
    }

    // Content AI checker is advisory/optional; network or execution errors do not block event creation
    if (args.hasPendingAiErrors) {
      errors.push('Content AI checker found issues.')
    }
  }

  return errors
}
