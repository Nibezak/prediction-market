import AdminHeaderActions from '@/app/[locale]/admin/_components/AdminHeaderActions'
import AdminGlobalSearch from '@/app/[locale]/admin/_components/AdminGlobalSearch'
import HeaderLogo from '@/components/HeaderLogo'
import { cn } from '@/lib/utils'

export default async function AdminHeader() {
  return (
    <header className="sticky top-0 z-30 bg-background">
      <div
        className={cn(`
          relative z-50 flex min-h-15 w-full items-center gap-4 px-4 py-3 pb-1
          md:min-h-17 md:px-8 md:pb-2
          lg:px-12
        `)}
      >
        <HeaderLogo labelSuffix="Admin" />
        <AdminGlobalSearch />
        <AdminHeaderActions />
      </div>
    </header>
  )
}
