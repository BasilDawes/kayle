<script lang="ts">
  import { onMount } from "svelte"
  import type { Chart, ChartConfiguration, TooltipItem } from "chart.js"
  import { DAILY_VALUES } from "$lib"
  import Spinner from "$lib/UI/components/Spinner.svelte"
  import { NutrientTrendsQuery, type NutrientTrendPoint } from "$lib/queries/NutrientTrendsQuery"
  import type { NumericNutrientKey } from "$lib/services/DiningCourtService"
  import {
    formatNutrientValue,
    getNutrientUnit,
    scaleNutrientValue,
  } from "$lib/utils/nutrientUnits"
  import { DayOverviewQuery } from "$lib/queries/DayOverviewQuery"

  let {
    nutrient,
    mode,
    endDate,
  }: {
    nutrient: NumericNutrientKey
    mode: "days" | "weeks"
    endDate: Date
  } = $props()

  let trendPoints = $state<NutrientTrendPoint[]>([])
  let loading = $state(true)
  let error = $state("")
  let canvas = $state<HTMLCanvasElement | null>(null)

  let chartInstance: Chart | null = null
  let chartFactory: typeof Chart | null = null
  let mounted = false
  let currentLoadId = 0

  const label = $derived(NutrientTrendsQuery.labelFor(nutrient))
  const unit = $derived(getNutrientUnit(nutrient))
  const dailyValue = $derived(DAILY_VALUES[nutrient])
  const labels = $derived(trendPoints.map((p) => p.label))
  const values = $derived(trendPoints.map((p) => p.value))
  const dailyValueLine = $derived(labels.map(() => dailyValue))
  const average = $derived.by(() => {
    if (mode === "days") {
      const today = DayOverviewQuery.today()
      const loggedDays = trendPoints.filter((point) => point.hasMeals && point.date !== today)
      if (!loggedDays.length) return 0
      return loggedDays.reduce((sum, point) => sum + point.value, 0) / loggedDays.length
    } else {
      const loggedWeeks = trendPoints.filter((point) => point.hasMeals)
      if (!loggedWeeks.length) return 0
      return loggedWeeks.reduce((sum, point) => sum + point.value, 0) / loggedWeeks.length
    }
  })
  const peak = $derived(Math.max(...values, 0))

  function tooltipLines(items: TooltipItem<"line">[]): string[] {
    const point = trendPoints[items[0]?.dataIndex ?? -1]
    if (!point?.entries.length) return ["No meals logged"]
    return [
      "Foods:",
      ...point.entries.map(
        (entry) => `${entry.name}: ${formatNutrientValue(nutrient, entry.value)}`,
      ),
    ]
  }

  async function load(currentMode: "days" | "weeks", currentEndDate: Date) {
    const loadId = ++currentLoadId
    loading = true
    error = ""
    try {
      let points: NutrientTrendPoint[]
      if (currentMode === "days") {
        points = await NutrientTrendsQuery.forDays(nutrient, currentEndDate)
      } else {
        points = await NutrientTrendsQuery.forWeeks(nutrient, currentEndDate)
      }
      if (loadId === currentLoadId) {
        trendPoints = points
      }
    } catch (err) {
      if (loadId === currentLoadId) {
        error = err instanceof Error ? err.message : "Failed to load trends."
      }
    } finally {
      if (loadId === currentLoadId) {
        loading = false
      }
    }
  }

  async function ensureChartFactory() {
    if (chartFactory) return chartFactory
    const mod = await import("chart.js/auto")
    chartFactory = mod.Chart
    return chartFactory
  }

  async function syncChart() {
    if (!mounted || !canvas || loading || error) return

    const ChartClass = await ensureChartFactory()

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: "#ea580c",
            backgroundColor: "rgba(251,146,60,0.18)",
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.35,
            fill: true,
          },
          {
            label: `${label} DV`,
            data: dailyValueLine,
            borderColor: "#94a3b8",
            borderDash: [6, 6],
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          y: {
            ticks: {
              callback: (tickValue: string | number) => {
                const numericValue =
                  typeof tickValue === "number" ? tickValue : Number.parseFloat(String(tickValue))
                return Math.round(scaleNutrientValue(nutrient, numericValue))
              },
            },
            title: {
              display: true,
              text: unit,
            },
          },
        },
        plugins: {
          tooltip: {
            filter: (item: TooltipItem<"line">) => item.datasetIndex === 0,
            callbacks: {
              label: (context: TooltipItem<"line">) =>
                `${label}: ${formatNutrientValue(nutrient, context.parsed.y ?? 0)}`,
              afterBody: tooltipLines,
            },
          },
        },
      },
    }

    if (chartInstance && chartInstance.canvas !== canvas) {
      chartInstance.destroy()
      chartInstance = null
    }

    if (chartInstance) {
      chartInstance.data = config.data
      chartInstance.options = config.options ?? {}
      chartInstance.update()
      return
    }

    chartInstance = new ChartClass(canvas, config)
  }

  function resetChart() {
    chartInstance?.destroy()
    chartInstance = null
  }

  onMount(() => {
    mounted = true

    return () => {
      mounted = false
      resetChart()
    }
  })

  $effect(() => {
    void load(mode, endDate)
  })

  $effect(() => {
    labels
    values
    dailyValueLine
    canvas
    loading
    void syncChart()
  })
</script>

<section class="mt-6 rounded-[28px] border border-amber-200 bg-white/90 p-4 shadow">
  <h2 class="mb-2 text-xl font-semibold text-stone-950">{label}</h2>

  {#if error}
    <div class="py-16 text-center text-sm text-red-700">{error}</div>
  {:else}
    <div class="relative h-64">
      {#if loading}
        <div
          class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[1px]"
        >
          <Spinner />
        </div>
      {/if}
      <canvas bind:this={canvas}></canvas>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-3 text-xs text-stone-600">
      <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
        <p class="text-stone-500 uppercase">Day Average</p>
        <p class="text-lg text-stone-950">{formatNutrientValue(nutrient, average)}</p>
      </div>
      <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
        <p class="text-stone-500 uppercase">Peak Day</p>
        <p class="text-lg text-stone-950">{formatNutrientValue(nutrient, peak)}</p>
      </div>
      <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
        <p class="text-stone-500 uppercase">DV</p>
        <p class="text-lg text-stone-950">{formatNutrientValue(nutrient, dailyValue)}</p>
      </div>
    </div>
  {/if}
</section>
