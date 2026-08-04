'use client'

import { useMemo } from 'react'
import PredictionChart from '@/components/PredictionChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Point = { date: string, success: number, pending: number, failed: number }

export default function AdminWorkspaceTrend({ title, description, points, emptyMessage }: {
  title: string
  description: string
  points: Point[]
  emptyMessage: string
}) {
  const data = useMemo(() => points.map(point => ({ ...point, date: new Date(point.date) })), [points])
  const series = useMemo(() => [
    { key: 'success', name: 'Successful', color: 'var(--yes)' },
    { key: 'pending', name: 'Pending', color: 'var(--chart-4)' },
    { key: 'failed', name: 'Failed', color: 'var(--no)' },
  ], [])

  return (
    <Card className="rounded-md">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {data.length > 0
          ? <PredictionChart data={data} series={series} height={280} showAreaFill showHorizontalGrid showXAxis showYAxis />
          : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{emptyMessage}</div>}
      </CardContent>
    </Card>
  )
}
