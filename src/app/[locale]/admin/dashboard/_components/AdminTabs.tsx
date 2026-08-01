'use client'

import type { Route } from 'next'
import type { AdminDashboardData } from '@/lib/db/queries/admin-stats'
import { Activity, Banknote, BarChart3, CircleDollarSign, Database, Gauge, Landmark, ShieldAlert, Users } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { startTransition, useMemo, useOptimistic, useState } from 'react'
import AdminUsersTable from '@/app/[locale]/admin/users/_components/AdminUsersTable'
import AppLink from '@/components/AppLink'
import PredictionChart from '@/components/PredictionChart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useTabIndicatorPosition } from '@/hooks/useTabIndicatorPosition'
import { cn } from '@/lib/utils'

type TabType = 'overview' | 'volume' | 'trades' | 'users' | 'activeMarkets' | 'resolvedMarkets'
  | 'topTraders' | 'balances' | 'positions' | 'liquidity' | 'resolutions' | 'risk' | 'activity'

const tabs: Array<{ id: TabType, label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'volume', label: 'Volume' },
  { id: 'trades', label: 'Trades' },
  { id: 'users', label: 'Users' },
  { id: 'activeMarkets', label: 'Active markets' },
  { id: 'resolvedMarkets', label: 'Resolved markets' },
  { id: 'topTraders', label: 'Top traders' },
  { id: 'balances', label: 'Balances' },
  { id: 'positions', label: 'Positions' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'resolutions', label: 'Resolutions' },
  { id: 'risk', label: 'Risk signals' },
  { id: 'activity', label: 'Activity' },
]

function TabLabel({ id }: { id: TabType }) {
  const t = useExtracted()
  if (id === 'overview') return t('Overview')
  if (id === 'volume') return t('Volume')
  if (id === 'trades') return t('Trades')
  if (id === 'users') return t('Users')
  if (id === 'activeMarkets') return t('Active markets')
  if (id === 'resolvedMarkets') return t('Resolved markets')
  if (id === 'topTraders') return t('Top traders')
  if (id === 'balances') return t('Balances')
  if (id === 'positions') return t('Positions')
  if (id === 'liquidity') return t('Liquidity')
  if (id === 'resolutions') return t('Resolutions')
  if (id === 'risk') return t('Risk signals')
  return t('Activity')
}

function normalizeTab(value: string | null): TabType {
  const normalized = value?.trim().toLowerCase().replace(/[\s_+-]+/g, '')
  return tabs.find(tab => tab.id.toLowerCase() === normalized)?.id
    ?? tabs.find(tab => tab.label.toLowerCase().replace(/\s+/g, '') === normalized)?.id
    ?? 'overview'
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value ?? 0))
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value ?? 0))
}

function formatDate(value: unknown) {
  if (!value) {
    return 'Not available'
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function EmptyRow({ columns, label = 'No records found.' }: { columns: number, label?: string }) {
  return <TableRow><TableCell colSpan={columns} className="h-24 text-center text-muted-foreground">{label}</TableCell></TableRow>
}

function Overview({ data }: { data: AdminDashboardData }) {
  const metrics = [
    { label: '24H volume', value: formatCurrency(data.stats.volume1D), icon: CircleDollarSign },
    { label: '30D volume', value: formatCurrency(data.stats.volume1M), icon: BarChart3 },
    { label: 'Trades', value: formatNumber(data.stats.totalTrades), icon: Activity },
    { label: 'User cash', value: formatCurrency(data.stats.userCash), icon: Banknote },
    { label: 'Open exposure', value: formatCurrency(data.stats.openExposure), icon: Gauge },
    { label: 'Active markets', value: formatNumber(data.stats.activeMarkets), icon: Landmark },
    { label: 'Active sessions', value: formatNumber(data.stats.activeUsers), icon: Users },
    { label: 'Risk signals', value: formatNumber(data.riskSignals.length), icon: ShieldAlert },
  ]
  const series = useMemo(() => [{ key: 'value', name: 'Trade volume', color: '#22c55e' }], [])
  const chartData = useMemo(() => data.volumeData.map(point => ({ ...point, date: new Date(point.date) })), [data.volumeData])
  return (
    <div className="grid gap-4 pt-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <Card key={metric.label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <metric.icon className="size-4" />
                {metric.label}
              </div>
              <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Actual ledger volume, last 30 days</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0
            ? <PredictionChart data={chartData} series={series} height={320} showAreaFill showHorizontalGrid showVerticalGrid showXAxis showYAxis />
            : <div className="flex h-72 items-center justify-center text-muted-foreground">No executed trade volume yet.</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function Volume({ data }: { data: AdminDashboardData }) {
  const [range, setRange] = useState<7 | 14 | 30>(30)
  const rows = useMemo(() => data.volumeData.slice(-range).map(point => ({ ...point, date: new Date(point.date) })), [data.volumeData, range])
  const series = useMemo(() => [{ key: 'value', name: 'Trade volume', color: '#22c55e' }], [])
  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Executed trade volume</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Currency transferred by completed AMM buys and sells.</p>
        </div>
        <div className="flex gap-1">
          {([7, 14, 30] as const).map(value => (
            <Button key={value} size="sm" variant={range === value ? 'default' : 'outline'} onClick={() => setRange(value)}>
              {value}
              D
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length > 0
          ? <PredictionChart data={rows} series={series} height={420} showAreaFill showHorizontalGrid showVerticalGrid showXAxis showYAxis />
          : (
              <div className="flex h-80 items-center justify-center text-muted-foreground">
                No volume recorded for this period.
              </div>
            )}
      </CardContent>
    </Card>
  )
}

function Trades({ rows }: { rows: AdminDashboardData['recentTrades'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Trader</TableHead>
          <TableHead>Market</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">
            Amount
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={6} label="No AMM trades have been executed." />}
        {rows.map(row => (
          <TableRow key={String(row.id)}>
            <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
            <TableCell>
              <div className="font-medium">{String(row.username || 'Unknown user')}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {String(row.userId || '')}
              </div>
            </TableCell>
            <TableCell className="max-w-sm truncate">{String(row.market || 'Unknown market')}</TableCell>
            <TableCell>{String(row.outcome || 'N/A')}</TableCell>
            <TableCell><Badge variant="outline">{String(row.type).replace('TRADE_', '')}</Badge></TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(row.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MarketRows({ rows, resolved }: { rows: AdminDashboardData['markets']['active'], resolved: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>End date</TableHead>
          <TableHead className="text-right">
            Indexed volume
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={5} label={resolved ? 'No resolved markets.' : 'No active markets.'} />}
        {rows.map(row => (
          <TableRow key={String(row.id)}>
            <TableCell className="font-medium">{String(row.title)}</TableCell>
            <TableCell><Badge variant={resolved ? 'secondary' : 'default'}>{resolved ? 'Resolved' : 'Active'}</Badge></TableCell>
            <TableCell>{formatDate(row.endDate)}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(row.volume)}
            </TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" asChild><AppLink href={`/event/${String(row.slug)}` as Route}>Inspect</AppLink></Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TopTraders({ rows }: { rows: AdminDashboardData['topTraders'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rank</TableHead>
          <TableHead>Trader</TableHead>
          <TableHead>Positions</TableHead>
          <TableHead>Wins</TableHead>
          <TableHead>Win rate</TableHead>
          <TableHead className="text-right">
            Current P&amp;L
          </TableHead>
          <TableHead className="text-right">Cost basis</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={7} label="No trader performance data yet." />}
        {rows.map((row, index) => (
          <TableRow key={String(row.userId)}>
            <TableCell className="font-semibold">
              #
              {index + 1}
            </TableCell>
            <TableCell className="font-medium">
              {String(row.username || row.userId)}
            </TableCell>
            <TableCell>{formatNumber(row.positions)}</TableCell>
            <TableCell>{formatNumber(row.wins)}</TableCell>
            <TableCell>
              {formatNumber(row.winRate)}
              %
            </TableCell>
            <TableCell className={cn(`text-right font-medium`, Number(row.pnl) < 0
              ? `text-destructive`
              : `text-primary`)}
            >
              {formatCurrency(row.pnl)}
            </TableCell>
            <TableCell className="text-right">{formatCurrency(row.volume)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Balances({ rows }: { rows: AdminDashboardData['balances'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="text-right">Cash</TableHead>
          <TableHead className="text-right">
            Positions
          </TableHead>
          <TableHead className="text-right">Portfolio</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={6} label="No ledger balances found." />}
        {rows.map(row => (
          <TableRow key={String(row.userId)}>
            <TableCell>
              <div className="font-medium">{String(row.username || 'Username pending')}</div>
              <div className="text-xs text-muted-foreground">
                {String(row.email || '')}
              </div>
            </TableCell>
            <TableCell><Badge variant="outline">{String(row.role || 'USER')}</Badge></TableCell>
            <TableCell className={cn('text-right', Number(row.cash) < 0 && 'text-destructive')}>{formatCurrency(row.cash)}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(row.positionValue)}
            </TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(row.portfolio)}</TableCell>
            <TableCell>{formatDate(row.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Positions({ rows }: { rows: AdminDashboardData['positions'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Trader</TableHead>
          <TableHead>Market</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="text-right">
            Quantity
          </TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">
            Value
          </TableHead>
          <TableHead className="text-right">P&amp;L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={7} label="No open positions." />}
        {rows.map(row => (
          <TableRow key={String(row.id)}>
            <TableCell>{String(row.username || row.userId || 'Unknown')}</TableCell>
            <TableCell className="max-w-sm truncate">
              {String(row.market)}
            </TableCell>
            <TableCell><Badge>{String(row.outcome)}</Badge></TableCell>
            <TableCell className="text-right">
              {formatNumber(row.quantity)}
            </TableCell>
            <TableCell className="text-right">{formatCurrency(row.cost)}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(row.value)}
            </TableCell>
            <TableCell className={cn('text-right font-medium', Number(row.pnl) < 0 ? 'text-destructive' : 'text-primary')}>{formatCurrency(row.pnl)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Liquidity({ rows }: { rows: AdminDashboardData['liquidity'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Market</TableHead>
          <TableHead>Probabilities</TableHead>
          <TableHead>Traders</TableHead>
          <TableHead>Comments</TableHead>
          <TableHead className="text-right">Liquidity added</TableHead>
          <TableHead className="text-right">
            Pool cash
          </TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={7} label="No AMM pools found." />}
        {rows.map(row => (
          <TableRow key={String(row.marketId)}>
            <TableCell className="max-w-sm font-medium">{String(row.market)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {String(row.probabilities || 'Not priced')}
            </TableCell>
            <TableCell>{formatNumber(row.traders)}</TableCell>
            <TableCell>{formatNumber(row.comments)}</TableCell>
            <TableCell className="text-right">{formatCurrency(row.liquidity)}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(row.poolCash)}
            </TableCell>
            <TableCell><Badge variant={row.resolvedAt ? 'secondary' : 'default'}>{row.resolvedAt ? 'Resolved' : 'Trading'}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Resolutions({ rows }: { rows: AdminDashboardData['resolutions'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Resolved</TableHead>
          <TableHead>Market</TableHead>
          <TableHead>Winner</TableHead>
          <TableHead>Resolver</TableHead>
          <TableHead>Participants</TableHead>
          <TableHead className="text-right">
            Winning shares
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={6} label="No internally settled markets." />}
        {rows.map(row => (
          <TableRow key={String(row.id)}>
            <TableCell>{formatDate(row.resolvedAt)}</TableCell>
            <TableCell className="max-w-md font-medium">
              {String(row.market)}
            </TableCell>
            <TableCell><Badge>{String(row.winner)}</Badge></TableCell>
            <TableCell>{String(row.resolver || 'System')}</TableCell>
            <TableCell>{formatNumber(row.participants)}</TableCell>
            <TableCell className="text-right">
              {formatNumber(row.winningShares)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Risk({ rows }: { rows: AdminDashboardData['riskSignals'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Signal</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="text-right">
            Cash
          </TableHead>
          <TableHead>Last update</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={6} label="No blocked, flagged, suspended, or negative-balance accounts." />}
        {rows.map(row => (
          <TableRow key={String(row.userId)}>
            <TableCell>
              <div className="font-medium">{String(row.username || row.userId)}</div>
              <div className="text-xs text-muted-foreground">
                {String(row.email || '')}
              </div>
            </TableCell>
            <TableCell><Badge variant="destructive">{String(row.signal)}</Badge></TableCell>
            <TableCell>{String(row.role || 'USER')}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(row.cash)}
            </TableCell>
            <TableCell>{formatDate(row.updatedAt)}</TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" asChild>
                <AppLink href={`/admin/risk?userId=${encodeURIComponent(String(row.userId))}` as Route}>
                  Inspect
                </AppLink>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ActivityLog({ rows }: { rows: AdminDashboardData['activity'] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Activity</TableHead>
          <TableHead>Recipient</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && <EmptyRow columns={4} label="No platform activity notifications recorded." />}
        {rows.map(row => (
          <TableRow key={String(row.id)}>
            <TableCell>{formatDate(row.createdAt)}</TableCell>
            <TableCell><Badge variant="outline">{String(row.type)}</Badge></TableCell>
            <TableCell>
              <div className="font-medium">{String(row.title)}</div>
              <div className="text-xs text-muted-foreground">{String(row.detail)}</div>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {String(row.userId)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function AdminTabs({ data }: { data: AdminDashboardData }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = useMemo(() => normalizeTab(searchParams.get('tab')), [searchParams])
  const [activeTab, setActiveTab] = useOptimistic<TabType, TabType>(selected, (_current, next) => next)
  const { tabRef, indicatorStyle, isInitialized } = useTabIndicatorPosition({ tabs, activeTab })

  function changeTab(next: TabType) {
    startTransition(() => setActiveTab(next))
    const query = new URLSearchParams(searchParams.toString())
    query.set('tab', next)
    router.replace(`${pathname}?${query.toString()}` as Route, { scroll: false })
  }

  return (
    <div className="overflow-hidden border bg-background">
      {data.services.slimefishBackendDatabase === 'unavailable' && (
        <Alert variant="destructive" className="m-4">
          <Database />
          <AlertTitle>Ledger data unavailable</AlertTitle>
          <AlertDescription>{data.services.slimefishBackendError}</AlertDescription>
        </Alert>
      )}
      <div className="relative overflow-x-auto">
        <div className="flex min-w-max items-center gap-6 px-4 pt-4 sm:px-6">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => { tabRef.current[index] = element }}
              type="button"
              onClick={() => changeTab(tab.id)}
              className={cn(`relative pb-3 text-sm font-semibold whitespace-nowrap transition-colors`, activeTab === tab.id
                ? `text-foreground`
                : `text-muted-foreground hover:text-foreground`)}
            >
              <TabLabel id={tab.id} />
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/80" />
        <div
          className={cn('pointer-events-none absolute bottom-0 h-0.5 bg-primary', isInitialized && `
            transition-all duration-300 ease-out
          `)}
          style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        />
      </div>
      <div className="overflow-x-auto px-4 pt-2 pb-4 sm:px-6">
        {activeTab === 'overview' && <Overview data={data} />}
        {activeTab === 'volume' && <Volume data={data} />}
        {activeTab === 'trades' && <Trades rows={data.recentTrades} />}
        {activeTab === 'users' && <div className="mt-4"><AdminUsersTable /></div>}
        {activeTab === 'activeMarkets' && <MarketRows rows={data.markets.active} resolved={false} />}
        {activeTab === 'resolvedMarkets' && <MarketRows rows={data.markets.resolved} resolved />}
        {activeTab === 'topTraders' && <TopTraders rows={data.topTraders} />}
        {activeTab === 'balances' && <Balances rows={data.balances} />}
        {activeTab === 'positions' && <Positions rows={data.positions} />}
        {activeTab === 'liquidity' && <Liquidity rows={data.liquidity} />}
        {activeTab === 'resolutions' && <Resolutions rows={data.resolutions} />}
        {activeTab === 'risk' && <Risk rows={data.riskSignals} />}
        {activeTab === 'activity' && <ActivityLog rows={data.activity} />}
      </div>
    </div>
  )
}
