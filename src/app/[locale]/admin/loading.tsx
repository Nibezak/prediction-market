import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLoading() {
  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-10" aria-label="Loading admin data">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-5 bg-background p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden border bg-background">
        <div className="border-b p-5"><Skeleton className="h-5 w-40" /></div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b p-5 last:border-b-0">
            <Skeleton className="size-5" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    </section>
  )
}
