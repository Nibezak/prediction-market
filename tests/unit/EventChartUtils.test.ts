import type { Event } from '@/types'
import { buildChartSeries, buildOutcomeSeriesKey } from '@/app/[locale]/(platform)/event/[slug]/_utils/EventChartUtils'

describe('multi-outcome event chart series', () => {
  it('builds one named series for every candidate outcome', () => {
    const names = ['Harry Kane', 'Lamine Yamal', 'Rodri', 'Kylian Mbappe', 'Lionel Messi']
    const conditionId = 'ballon-dor-market'
    const event = {
      markets: [{
        condition_id: conditionId,
        title: 'Ballon d Or winner',
        outcomes: names.map((outcome_text, outcome_index) => ({ outcome_text, outcome_index })),
      }],
    } as unknown as Event

    const series = buildChartSeries(
      event,
      names.map((_, index) => buildOutcomeSeriesKey(conditionId, index)),
    )

    expect(series).toHaveLength(names.length)
    expect(series.map(item => item.name)).toEqual(names)
    expect(new Set(series.map(item => item.color)).size).toBe(names.length)
  })
})
