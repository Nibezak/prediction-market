'use client'

import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from '@/i18n/navigation'

type SearchResult = {
  id: string
  type: 'Route' | 'User' | 'Market' | 'Audit'
  title: string
  subtitle: string
  href: string
}

export default function AdminGlobalSearch() {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const trimmedQuery = query.trim()
    if (!dialogOpen || trimmedQuery.length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmedQuery)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => null)
        setResults(response.ok && Array.isArray(payload?.data) ? payload.data : [])
      }
      catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setResults([])
      }
      finally {
        setIsLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [dialogOpen, query])

  function openResult(result: SearchResult) {
    setDialogOpen(false)
    setQuery('')
    router.push(result.href as any)
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0"
        aria-label="Search admin"
        title="Search admin"
        onClick={() => setDialogOpen(true)}
      >
        <SearchIcon className="size-5" />
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 text-left">
            <DialogTitle>Search admin</DialogTitle>
            <DialogDescription>Find routes, users, markets, IPs, and audit records.</DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && results[0]) openResult(results[0])
                }}
                placeholder="Search admin"
                aria-label="Search admin records"
                className="h-11 pl-9"
              />
            </div>
            <div className="mt-3 max-h-[min(28rem,60vh)] overflow-y-auto">
              {isLoading
                ? (
                    <div className="space-y-2 py-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  )
                : query.trim().length < 2
                  ? <p className="py-8 text-center text-sm text-muted-foreground">Enter at least two characters.</p>
                  : results.length > 0
                    ? results.map(result => (
                        <button
                          key={result.id}
                          type="button"
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted"
                          onClick={() => openResult(result)}
                        >
                          <Badge variant="outline" className="w-16 shrink-0 justify-center">{result.type}</Badge>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{result.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                          </span>
                        </button>
                      ))
                    : <p className="py-8 text-center text-sm text-muted-foreground">No close matches found.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
