'use client'

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { cn } from '@/lib/utils'

export function PasscodeInput({
  value,
  onChange,
  autoFocus = false,
  disabled = false,
  ariaLabel = '4-digit passcode',
  className,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <InputOTP
      maxLength={4}
      value={value}
      onChange={next => onChange(next.replace(/\D/g, '').slice(0, 4))}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      containerClassName={cn('justify-center', className)}
    >
      <InputOTPGroup className="gap-2">
        <InputOTPSlot className="size-12 rounded-md border-l text-lg first:rounded-md last:rounded-md" index={0} mask />
        <InputOTPSlot className="size-12 rounded-md border-l text-lg first:rounded-md last:rounded-md" index={1} mask />
        <InputOTPSlot className="size-12 rounded-md border-l text-lg first:rounded-md last:rounded-md" index={2} mask />
        <InputOTPSlot className="size-12 rounded-md border-l text-lg first:rounded-md last:rounded-md" index={3} mask />
      </InputOTPGroup>
    </InputOTP>
  )
}
