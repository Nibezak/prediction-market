import { getExtracted, setRequestLocale } from 'next-intl/server'
import { connection } from 'next/server'
import { getAdminDashboardData } from '@/lib/db/queries/admin-stats'
import AdminTabs from './_components/AdminTabs'

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getExtracted()

  await connection()

  const data = await getAdminDashboardData()

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  function formatNumber(num: number) {
    return new Intl.NumberFormat('en-US').format(num)
  }

  return (
    <section className="mx-auto max-w-7xl space-y-8 p-6 lg:p-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('Admin Dashboard')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Overview of global system statistics and active portfolio management.')}
          </p>
        </div>
        <div className="flex gap-8">
          <div className="grid gap-1">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{t('Total Users')}</p>
            <p className="text-2xl font-bold">{formatNumber(data.stats.totalUsers)}</p>
          </div>
          <div className="grid gap-1">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{t('All-Time Volume')}</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(data.stats.volumeAllTime)}</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <AdminTabs data={data} />
      </div>
    </section>
  )
}
