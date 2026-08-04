import type { Route } from 'next'
import { AlertTriangleIcon, ArrowRightIcon, BanknoteIcon, CircleDollarSignIcon, ListChecksIcon, ShieldAlertIcon, UsersIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import { connection } from 'next/server'
import AppLink from '@/components/AppLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAdminDashboardData } from '@/lib/db/queries/admin-stats'

const number = new Intl.NumberFormat('en-US')
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function AdminDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  await connection()
  const data = await getAdminDashboardData()

  const metrics = [
    { label: 'Users', value: number.format(data.stats.totalUsers), detail: `${number.format(data.stats.activeUsers)} active`, icon: UsersIcon },
    { label: 'Active markets', value: number.format(data.stats.activeMarkets), detail: `${number.format(data.stats.resolvedMarkets)} resolved`, icon: CircleDollarSignIcon },
    { label: 'All-time volume', value: money.format(data.stats.volumeAllTime), detail: `${money.format(data.stats.volume1D)} today`, icon: BanknoteIcon },
    { label: 'Trades', value: number.format(data.stats.totalTrades), detail: `${money.format(data.stats.openExposure)} open exposure`, icon: ListChecksIcon },
  ]
  const attention = [
    { label: 'Pending approvals', value: data.stats.pendingApprovals, href: '/admin/approvals', icon: ListChecksIcon },
    { label: 'Failed jobs', value: data.stats.failedJobs, href: '/admin/operations/jobs', icon: AlertTriangleIcon },
    { label: 'Risk cases', value: data.riskSignals.length, href: '/admin/risk/cases', icon: ShieldAlertIcon },
  ]

  return (
    <section className="mx-auto w-full max-w-7xl space-y-8 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform health and work that needs attention.</p>
      </div>

      <div className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <div key={metric.label} className="bg-background p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{metric.label}</span>
              <metric.icon className="size-4" />
            </div>
            <p className="mt-5 text-2xl font-semibold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <Card className="rounded-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {attention.map(item => (
              <AppLink key={item.label} href={item.href as Route} className="flex min-h-16 items-center gap-3 border-b px-5 last:border-b-0 hover:bg-muted/40">
                <item.icon className="size-4 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                <Badge variant={item.value > 0 ? 'secondary' : 'outline'}>{number.format(item.value)}</Badge>
                <ArrowRightIcon className="size-4 text-muted-foreground" />
              </AppLink>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">System status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between text-sm">
              <span>Application database</span>
              <Badge variant="outline">{data.services.tellwiseDatabase}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Ledger database</span>
              <Badge variant={data.services.slimefishBackendDatabase === 'operational' ? 'outline' : 'destructive'}>{data.services.slimefishBackendDatabase}</Badge>
            </div>
            <Button variant="outline" className="w-full justify-between" asChild>
              <AppLink href={'/admin/operations/services' as Route}>Open system health <ArrowRightIcon className="size-4" /></AppLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
