'use client'

import { SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
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
        const payload = await response.json()
        setResults(response.ok && Array.isArray(payload.data) ? payload.data : [])
        setIsOpen(true)
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
  }, [query])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  function openResult(result: SearchResult) {
    setIsOpen(false)
    setQuery('')
    router.push(result.href as any)
  }

  return (
    <div ref={containerRef} className="relative hidden min-w-0 max-w-2xl flex-1 md:block">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={event => setQuery(event.target.value)}
        onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false)
          if (event.key === 'Enter' && results[0]) openResult(results[0])
        }}
        placeholder="Search routes, users, markets, IPs, and audit logs"
        aria-label="Search admin"
        className="h-10 bg-muted/40 pr-4 pl-9"
      />
      {isOpen && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[min(28rem,70vh)] overflow-y-auto border bg-popover p-1 text-popover-foreground shadow-lg">
          {isLoading
            ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )
            : results.length > 0
              ? results.map(result => (
                  <button
                    key={result.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => openResult(result)}
                  >
                    <Badge variant="outline" className="w-16 shrink-0 justify-center">{result.type}</Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{result.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>
                    </span>
                  </button>
                ))
              : <p className="p-4 text-sm text-muted-foreground">No close matches found.</p>}
        </div>
      )}
    </div>
  )
}
