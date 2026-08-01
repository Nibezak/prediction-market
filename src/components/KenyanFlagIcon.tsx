import { cn } from '@/lib/utils'

export default function KenyanFlagIcon({ className }: { className?: string }) {
  return (
    <img
      src="/images/flags/kenya.svg"
      alt=""
      aria-hidden="true"
      className={cn('h-4 w-6 rounded-[2px] object-cover', className)}
    />
  )
}
