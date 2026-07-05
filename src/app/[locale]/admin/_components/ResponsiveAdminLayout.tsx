'use client'

import { useState, useEffect } from 'react'
import { MenuIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePathname } from '@/i18n/navigation'

interface ResponsiveAdminLayoutProps {
  sidebar: React.ReactNode
  children: React.ReactNode
}

export default function ResponsiveAdminLayout({ sidebar, children }: ResponsiveAdminLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Automatically close sidebar when navigation path changes (user clicked a menu item on mobile)
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [pathname])

  return (
    <div className="relative min-h-[calc(100vh-4.25rem)]">
      {/* Mobile top bar with menu trigger */}
      <div className="flex h-12 items-center gap-3 border-b bg-background px-4 lg:hidden sticky top-[4.25rem] z-20 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(true)}
          className="size-9"
        >
          <MenuIcon className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>
        <span className="text-sm font-semibold text-foreground">Admin Navigation</span>
      </div>

      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden top-[4.25rem]"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          `
            fixed inset-y-0 left-0 z-40 w-[240px] bg-background border-r p-5 shadow-lg
            transform transition-transform duration-200 ease-in-out top-[4.25rem] lg:top-[4.25rem]
            lg:translate-x-0 lg:fixed lg:z-10 lg:shadow-none lg:h-[calc(100vh-4.25rem)]
            flex flex-col
          `,
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile close button inside sidebar header */}
        <div className="flex justify-end lg:hidden mb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(false)}
            className="size-8"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>

        {/* Sidebar content (scrollable menu links) */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {sidebar}
        </div>
      </aside>

      {/* Main content panel */}
      <div className="flex min-w-0 flex-col bg-muted/10 min-h-[calc(100vh-4.25rem)] lg:pl-[240px]">
        <div className="w-full px-4 py-6 md:px-8 lg:px-12 space-y-8 flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}
