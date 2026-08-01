import type { MouseEvent } from 'react'
import type { EventOrderPanelOutcomeSelectedAccent }
  from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelOutcomeButton'
import { useExtracted } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EventOrderPanelSubmitButtonProps {
  isLoading: boolean
  isDisabled: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  label?: string
  type?: 'button' | 'submit'
  selectedAccent?: EventOrderPanelOutcomeSelectedAccent | null
  styleVariant?: 'default' | 'sports3d'
}

export default function EventOrderPanelSubmitButton({
  isLoading,
  isDisabled,
  onClick,
  label,
  type = 'submit',
  selectedAccent = null,
  styleVariant = 'default',
}: EventOrderPanelSubmitButtonProps) {
  const t = useExtracted()
  const useSportsDepth = styleVariant === 'sports3d'

  return (
    <div className="relative w-full pb-1.25">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-md',
          useSportsDepth ? 'bg-primary/90' : 'bg-primary/80',
          Boolean(selectedAccent) && 'bg-transparent',
        )}
        style={useSportsDepth ? selectedAccent?.depthStyle : undefined}
      />
      <Button
        type={type}
        size="outcomeLg"
        disabled={isDisabled || isLoading}
        aria-disabled={isDisabled || isLoading}
        onClick={onClick}
        className={cn(
          `
            relative mt-2 w-full translate-y-0 overflow-hidden rounded-md text-base font-bold transition-transform
            duration-150 ease-out
            hover:translate-y-px
            active:translate-y-0.5
            disabled:opacity-100
          `,
          useSportsDepth ? 'hover:brightness-95' : 'hover:bg-primary',
          selectedAccent?.buttonClassName,
        )}
        style={selectedAccent?.buttonStyle}
      >
        {selectedAccent?.overlayStyle && (
          <span
            className="pointer-events-none absolute inset-0 rounded-md"
            style={selectedAccent.overlayStyle}
          />
        )}
        {isLoading
          ? (
              <div className="relative z-10 flex items-center justify-center gap-2">
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                <span>{t('Processing...')}</span>
              </div>
            )
          : (
              <span className="relative z-10">{label ?? t('Trade')}</span>
            )}
      </Button>
    </div>
  )
}
