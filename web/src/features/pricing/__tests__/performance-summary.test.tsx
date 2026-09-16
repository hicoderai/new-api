import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ModelCardGrid } from '../components/model-card-grid'
import { ModelDetailsPerformance } from '../components/model-details-performance'

// Canvas rendering is verified in the real browser; expose the chart library's
// input here to protect the weighted trend data at the rendering boundary.
vi.mock('@visactor/react-vchart', () => ({
  VChart: ({ spec }: { spec: { data: unknown } }) => (
    <output aria-label='Chart data'>{JSON.stringify(spec.data)}</output>
  ),
}))

afterEach(() => vi.restoreAllMocks())

it('uses the backend weighted headline and trend while retaining individual group rows', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const point = {
    ts: 1789221600,
    avg_ttft_ms: 300,
    avg_latency_ms: 3000,
    success_rate: 60,
    avg_tps: 100,
  }
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        model_name: 'fixture-model',
        groups: [
          {
            ...point,
            group: 'stable',
            avg_latency_ms: 1000,
            success_rate: 100,
            avg_tps: 10,
            series: [],
          },
          {
            ...point,
            group: 'premium',
            avg_latency_ms: 3500,
            success_rate: 50,
            avg_tps: 110,
            series: [],
          },
          {
            ...point,
            group: 'internal',
            series: [],
          },
        ],
        overall: { ...point, group: '', series: [point] },
      },
    },
  })
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <ModelDetailsPerformance
        selectedGroup='stable'
        model={{
          id: 1,
          model_name: 'fixture-model',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['stable', 'premium'],
        }}
      />
    </QueryClientProvider>
  )
  expect(await screen.findByText('3.00s')).toBeVisible()
  expect(api.get).toHaveBeenCalledWith('/api/perf-metrics', {
    params: { model: 'fixture-model', hours: 24, group: 'stable' },
  })
  expect(screen.getByText('100.0 t/s')).toBeVisible()
  expect(screen.getByText('60.00%')).toBeVisible()
  const table = screen.getByRole('table')
  expect(within(table).getByText('stable')).toBeVisible()
  expect(within(table).getByText('premium')).toBeVisible()
  expect(within(table).queryByText('internal')).not.toBeInTheDocument()
  const charts = await screen.findAllByLabelText('Chart data')
  expect(
    charts.some((chart) => chart.textContent?.includes('"ttft":300'))
  ).toBe(true)
  expect(
    charts.some((chart) => chart.textContent?.includes('"uptime":60'))
  ).toBe(true)
  unmount()
  queryClient.clear()
})

it('accepts all enabled groups and retains overall metrics when visible group rows are filtered out', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const response = {
    data: {
      success: true,
      data: {
        model_name: 'fixture-model',
        groups: [
          {
            group: 'internal',
            avg_ttft_ms: 300,
            avg_latency_ms: 3000,
            success_rate: 90,
            avg_tps: 30,
            series: [],
          },
        ],
        overall: {
          group: '',
          avg_ttft_ms: 300,
          avg_latency_ms: 3000,
          success_rate: 90,
          avg_tps: 30,
          series: [],
        },
      },
    },
  }
  vi.spyOn(api, 'get').mockResolvedValue(response)
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ModelDetailsPerformance
        model={{
          id: 1,
          model_name: 'fixture-model',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['all'],
        }}
      />
    </QueryClientProvider>
  )
  expect(await screen.findByText('internal')).toBeVisible()

  view.rerender(
    <QueryClientProvider client={queryClient}>
      <ModelDetailsPerformance
        model={{
          id: 1,
          model_name: 'fixture-model',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['stable'],
        }}
      />
    </QueryClientProvider>
  )
  expect(screen.queryByText('internal')).not.toBeInTheDocument()
  expect(screen.getByText('3.00s')).toBeVisible()
  expect(
    screen.queryByText('Performance data is not yet available for this model.')
  ).not.toBeInTheDocument()
  view.unmount()
  queryClient.clear()
})

it('shows empty headline metrics when overall is null instead of averaging group rows', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        model_name: 'fixture-model',
        groups: [
          {
            group: 'stable',
            avg_ttft_ms: 200,
            avg_latency_ms: 2000,
            success_rate: 75,
            avg_tps: 40,
            series: [],
          },
        ],
        overall: null,
      },
    },
  })
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <ModelDetailsPerformance
        model={{
          id: 1,
          model_name: 'fixture-model',
          quota_type: 0,
          model_ratio: 1,
          completion_ratio: 1,
          enable_groups: ['stable'],
        }}
      />
    </QueryClientProvider>
  )

  expect(await screen.findByText('stable')).toBeVisible()
  expect(api.get).toHaveBeenCalledWith('/api/perf-metrics', {
    params: { model: 'fixture-model', hours: 24 },
  })
  const summaryGrid = screen.getByText('Sustained tokens per second')
    .parentElement?.parentElement
  expect(summaryGrid).not.toBeNull()
  if (!summaryGrid) throw new Error('Missing performance summary grid')
  expect(within(summaryGrid).getAllByText('—')).toHaveLength(3)
  unmount()
  queryClient.clear()
})

it('isolates summary cache entries by selected group and clears the previous scope while loading', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  let resolvePremium: ((value: unknown) => void) | undefined
  const request = vi.spyOn(api, 'get').mockImplementation((_url, config) => {
    const params = (config as { params?: { group?: string } } | undefined)
      ?.params
    if (params?.group === 'premium') {
      return new Promise((resolve) => {
        resolvePremium = resolve
      })
    }
    return Promise.resolve({
      data: {
        success: true,
        data: {
          models: [
            {
              model_name: 'fixture-model',
              avg_latency_ms: 1000,
              success_rate: 100,
              avg_tps: 10,
            },
          ],
        },
      },
    })
  })
  const model = {
    id: 1,
    model_name: 'fixture-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['stable', 'premium'],
  }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ModelCardGrid
        models={[model]}
        selectedGroup='stable'
        onModelClick={vi.fn()}
      />
    </QueryClientProvider>
  )
  expect(await screen.findByText('1.00s')).toBeVisible()
  expect(request).toHaveBeenCalledWith('/api/perf-metrics/summary', {
    params: { hours: 24, group: 'stable' },
  })

  view.rerender(
    <QueryClientProvider client={queryClient}>
      <ModelCardGrid
        models={[model]}
        selectedGroup='premium'
        onModelClick={vi.fn()}
      />
    </QueryClientProvider>
  )
  expect(screen.queryByText('1.00s')).not.toBeInTheDocument()
  expect(
    queryClient.getQueryData(['perf-metrics-summary', 24, 'stable'])
  ).toBeDefined()
  expect(
    queryClient.getQueryData(['perf-metrics-summary', 24, 'premium'])
  ).toBeUndefined()

  resolvePremium?.({
    data: {
      success: true,
      data: {
        models: [
          {
            model_name: 'fixture-model',
            avg_latency_ms: 3000,
            success_rate: 90,
            avg_tps: 30,
          },
        ],
      },
    },
  })
  expect(await screen.findByText('3.00s')).toBeVisible()
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/api/perf-metrics/summary', {
      params: { hours: 24, group: 'premium' },
    })
  )
  view.unmount()
  queryClient.clear()
})
