'use client'

import { cn } from '@/lib/utils'

interface ResponsiveAdminLayoutProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  topOffsetClass?: string
  heightClass?: string
}

export default function ResponsiveAdminLayout({
  sidebar,
  children,
  topOffsetClass = 'top-[4.25rem] lg:top-[4.25rem]',
  heightClass = 'min-h-[calc(100vh-4.25rem)]',
}: ResponsiveAdminLayoutProps) {
  // We're moving away from replacing strings and using standard conditional logic
  return (
    <div className={cn('relative max-w-full overflow-x-clip lg:min-h-[calc(100vh-4.25rem)]', heightClass)}>
      {/* Sidebar container */}
      <aside
        className={cn(`
          sticky z-20 w-full border-b bg-background
          lg:fixed lg:inset-y-0 lg:left-0 lg:z-10 lg:flex lg:w-[240px] lg:flex-col lg:border-r lg:border-b-0
          lg:bg-background lg:p-5
        `, topOffsetClass)}
      >
        <div className="min-h-0 flex-1 px-2 py-3 lg:min-h-[calc(100vh-4.25rem)] lg:overflow-y-auto lg:p-0">
          {sidebar}
        </div>
      </aside>

      {/* Main content panel */}
      <div className={cn('flex min-w-0 max-w-full flex-col bg-muted/10 lg:ml-[240px] lg:w-[calc(100%-240px)] lg:min-h-[calc(100vh-4.25rem)]', heightClass)}>
        <div className="flex w-full min-w-0 max-w-full flex-1 flex-col space-y-8 overflow-x-clip px-4 py-6 md:px-8 lg:px-12">
          {children}
        </div>
      </div>
    </div>
  )
}
