'use client'

import { InfoIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import Form from 'next/form'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { updateForkSettingsAction } from '@/app/[locale]/admin/affiliate/_actions/update-affiliate-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputError } from '@/components/ui/input-error'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const initialState = {
  error: null,
}

interface AdminAffiliateSettingsFormProps {
  builderTakerFeeBps: number
  affiliateShareBps: number
  updatedAtLabel?: string
}

interface AdminInfoTooltipProps {
  content: string
}

function AdminInfoTooltip({ content }: AdminInfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(`
            inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors
            hover:text-foreground
            focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none
          `)}
          aria-label={content}
        >
          <InfoIcon className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-left">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

function useAffiliateSettingsForm() {
  const t = useExtracted()
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(updateForkSettingsAction, initialState)
  const wasPendingRef = useRef(isPending)

  useEffect(function toastOnSettingsTransition() {
    const transitionedToIdle = wasPendingRef.current && !isPending

    if (transitionedToIdle && state.error === null) {
      toast.success(t('Settings updated successfully!'))
      router.refresh()
    }
    else if (transitionedToIdle && state.error) {
      toast.error(state.error)
    }

    wasPendingRef.current = isPending
  }, [isPending, router, state.error, t])

  return { state, formAction, isPending }
}

export default function AdminAffiliateSettingsForm({
  builderTakerFeeBps,
  affiliateShareBps,
  updatedAtLabel,
}: AdminAffiliateSettingsFormProps) {
  const t = useExtracted()
  const { state, formAction, isPending } = useAffiliateSettingsForm()
  const updatedAtTooltip = updatedAtLabel
    ? t('Last fees updated {timestamp}', { timestamp: updatedAtLabel })
    : null
  const affiliateShareTooltip = t('Commission paid to your affiliates, deducted from your operator fee.')
  return (
    <Form action={formAction} className="grid gap-6 rounded-lg border p-6">
      <div>
        <h2 className="text-xl font-semibold">{t('Trading Fees')}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <p>{t('Configure the fee charged on every AMM trade and the affiliate split.')}</p>
          {updatedAtTooltip && <AdminInfoTooltip content={updatedAtTooltip} />}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start grid-rows-[auto_auto_1fr] gap-2">
            <Label htmlFor="amm_trade_fee_percent">{t('AMM trade fee (%)')}</Label>
            <Input
              id="amm_trade_fee_percent"
              name="amm_trade_fee_percent"
              type="number"
              step="0.01"
              min="0"
              max="9"
              defaultValue={(builderTakerFeeBps / 100).toFixed(2)}
              disabled={isPending}
            />
            <p className="text-sm text-muted-foreground">
              {t('Deducted from the submitted amount and recorded as platform revenue on every trade.')}
            </p>
          </div>
          <div className="grid content-start grid-rows-[auto_auto_1fr] gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="affiliate_share_percent">{t('Affiliate share (%)')}</Label>
              <AdminInfoTooltip content={affiliateShareTooltip} />
            </div>
            <Input
              id="affiliate_share_percent"
              name="affiliate_share_percent"
              type="number"
              step="0.5"
              min="0"
              max="100"
              defaultValue={(affiliateShareBps / 100).toFixed(2)}
              disabled={isPending}
            />
            <p className="text-sm text-muted-foreground">
              {t('The portion of the platform trade fee credited to the referring affiliate.')}
            </p>
          </div>
        </div>
        <Button type="submit" className="w-full sm:w-40" disabled={isPending}>
          {isPending ? t('Saving...') : t('Save changes')}
        </Button>
      </div>

      {state.error && <InputError message={state.error} />}
    </Form>
  )
}
