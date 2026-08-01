'use client'

import type { User } from '@/types'
import { useExtracted } from 'next-intl'
import { startTransition, useEffect, useOptimistic, useState } from 'react'
import { toast } from 'sonner'
import { updateTradingSettingsAction } from '@/app/[locale]/(platform)/settings/_actions/update-trading-settings'
import { InputError } from '@/components/ui/input-error'
import { Switch } from '@/components/ui/switch'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

export default function SettingsTradingContent({ user }: { user: User }) {
  const t = useExtracted()
  const [error, setError] = useState<string | null>(null)
  const initialShowSlippageWarning = user.settings?.trading?.show_slippage_warning !== false
  const [optimisticShowSlippageWarning, setOptimisticShowSlippageWarning] = useOptimistic<boolean, boolean>(
    initialShowSlippageWarning,
    (_, nextValue) => nextValue,
  )

  useEffect(function syncFreshSettingsUserState() {
    useUser.setState(previous => mergeSessionUserState(previous, user))
  }, [user])

  function handleSlippageWarningChange(value: boolean) {
    if (value === optimisticShowSlippageWarning) {
      return
    }

    const previousValue = optimisticShowSlippageWarning
    startTransition(() => setOptimisticShowSlippageWarning(value))

    queueMicrotask(async () => {
      const formData = new FormData()
      formData.set('show_slippage_warning', String(value))
      const result = await updateTradingSettingsAction(formData)

      if (result.error) {
        startTransition(() => setOptimisticShowSlippageWarning(previousValue))
        setError(result.error)
        return
      }

      setError(null)
      toast.success(t('Trading settings updated.'))
      useUser.setState((previous) => {
        if (!previous) {
          return previous
        }
        return {
          ...previous,
          settings: {
            ...previous.settings,
            trading: {
              ...previous.settings?.trading,
              show_slippage_warning: value,
            },
          },
        }
      })
    })
  }

  return (
    <div className="grid gap-8">
      {error && <InputError message={error} />}

      <section className="grid gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('Price protection')}</h2>

        <div
          className="
            flex flex-col gap-4 rounded-md border border-border p-4
            sm:flex-row sm:items-center sm:justify-between
          "
        >
          <div className="grid gap-1.5">
            <label htmlFor="show-slippage-warning" className="text-sm font-medium">
              {t('Show Slippage Warning')}
            </label>
            <p className="text-sm text-muted-foreground">
              {t('Warn before an AMM trade when its average price moves more than 10% from the displayed market price.')}
            </p>
          </div>

          <Switch
            id="show-slippage-warning"
            checked={optimisticShowSlippageWarning}
            onCheckedChange={handleSlippageWarningChange}
            className="self-start sm:self-center"
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {t('All AMM trades are atomic and protected by a server-enforced quote tolerance. A trade is rejected if the market moves beyond that tolerance before settlement.')}
        </p>
      </section>
    </div>
  )
}
