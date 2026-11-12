<script lang="ts">
  import NutrientChart from "./NutrientChart.svelte"
  import { NUMERIC_NUTRIENT_KEYS } from "$lib/services/DiningCourtService"
  import { MealRepository } from "$lib/repositories/MealRepository"
  import { dateToExcel } from "$lib"
  import { NUMERIC_NUTRIENT_LABELS } from "$lib/services/DiningCourtService"

  function getInitialEndDate(): Date {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 1) // Yesterday b/c today is still WIP, will mess up stats
    return d
  }

  function mondayOf(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const offset = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + offset)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
  }

  let mode = $state<"days" | "weeks">("days")
  let endDate = $state<Date>(getInitialEndDate())
  const startDate = $derived.by(() => {
    if (mode === "days") {
      const start = new Date(endDate)
      start.setDate(start.getDate() - 6)
      return start
    } else {
      return addDays(endDate, -35)
    }
  })
  const rangeEndDate = $derived.by(() => (mode === "days" ? endDate : addDays(endDate, 6)))

  function selectMode(newMode: "days" | "weeks") {
    mode = newMode
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (newMode === "days") {
      endDate = today
    } else {
      endDate = mondayOf(today)
    }
  }

  function goBack() {
    if (mode === "days") {
      const d = new Date(endDate)
      d.setDate(d.getDate() - 1)
      endDate = d
    } else {
      const d = new Date(endDate)
      d.setDate(d.getDate() - 7)
      endDate = d
    }
  }

  function goForward() {
    if (!canGoForward) return
    if (mode === "days") {
      const d = new Date(endDate)
      d.setDate(d.getDate() + 1)
      endDate = d
    } else {
      const d = new Date(endDate)
      d.setDate(d.getDate() + 7)
      endDate = d
    }
  }

  const canGoForward = $derived.by(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (mode === "days") {
      return endDate.getTime() < today.getTime()
    } else {
      return endDate.getTime() < mondayOf(today).getTime()
    }
  })

  const rangeLabel = $derived.by(() => {
    if (mode === "days") {
      const startStr = startDate.toLocaleDateString("en-US", { weekday: "short" })
      const endStr = endDate.toLocaleDateString("en-US", { weekday: "short" })
      if (startDate.getFullYear() !== endDate.getFullYear()) {
        return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}`
      }
      return `${startStr} – ${endStr}`
    } else {
      const startStr = startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
      const endStr = rangeEndDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
      return `${startStr} – ${endStr}`
    }
  })

  const headerSubtitle = $derived(mode === "days" ? "Past 7 Days" : "Weekly Aggregated")

  async function exportMealLog() {
    const useExcel = confirm(
      "Export to Excel format? (Date/durations are in days, otherwise ISO/minutes)",
    )

    // Get all time entries from the database
    const allEntries = await MealRepository.getExport()

    // Create CSV header
    const csvHeader =
      "Name,Date,Servings,Serving Size," + Object.values(NUMERIC_NUTRIENT_LABELS).join(",") + "\n"

    // Convert entries to CSV rows
    const csvRows = allEntries
      .map((entry) => {
        const startTime = entry.date

        return (
          `"${entry.name}","${useExcel ? dateToExcel(startTime) : startTime.toISOString()}","${entry.servings}","${entry.servingSize}",` +
          NUMERIC_NUTRIENT_KEYS.map((key) => entry.baseNutrients[key]).join(",")
        )
      })
      .join("\n")

    // Combine header and rows
    const csvContent = csvHeader + csvRows

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `kayle-export-${new Date().toISOString().split("T")[0]}.csv`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  async function getRangeItems() {
    return (
      await MealRepository.getBetweenDates(
        startDate.toISOString().split("T")[0],
        rangeEndDate.toISOString().split("T")[0],
      )
    )
      .flatMap<{ name: string }>((meal) => meal.components ?? meal)
      .map((meal) => meal.name)
  }
</script>

<svelte:head>
  <title>Kayle Trends</title>
</svelte:head>

<div
  class="bg-linear-to-b from-amber-50 via-orange-50 to-stone-100 px-4 py-5 pb-21 text-stone-900"
  style="font-family: 'DM Mono', monospace;"
>
  <header class="mb-4 space-y-2">
    <p class="text-xs tracking-[0.2em] text-amber-700 uppercase">{headerSubtitle}</p>
    <h1 class="text-2xl font-bold text-stone-950">Nutrient Trends</h1>
    <p class="text-sm text-stone-600">All nutrients across your logged meals.</p>
  </header>

  <div class="flex gap-3">
    <button onclick={exportMealLog} class="outline-btn flex-1 py-3 text-sm" type="button">
      Export Spreadsheet
    </button>
    <button
      onclick={async () => navigator.clipboard.writeText((await getRangeItems()).join(","))}
      class="outline-btn flex-1 py-3 text-sm"
      type="button"
    >
      Copy Meals in Range
    </button>
  </div>

  {#each NUMERIC_NUTRIENT_KEYS as nutrient}
    <NutrientChart {nutrient} {mode} {endDate} />
  {/each}

  <!-- Floating controller -->
  <div
    class="fixed bottom-20 left-1/2 z-40 flex w-auto max-w-[calc(100%-2rem)] shrink-0 -translate-x-1/2 items-center justify-between gap-3 rounded-full border border-amber-200/60 bg-white/90 px-3 py-1.5 shadow-lg backdrop-blur-md select-none md:gap-4 md:px-4 md:py-2"
  >
    <!-- Navigation section -->
    <div class="flex items-center gap-2">
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white"
        onclick={goBack}
        aria-label="Previous period"
      >
        <span>&larr;</span>
      </button>
      <span class="text-center text-xs font-semibold whitespace-nowrap text-stone-700">
        {rangeLabel}
      </span>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white"
        onclick={goForward}
        disabled={!canGoForward}
        aria-label="Next period"
      >
        <span>&rarr;</span>
      </button>
    </div>

    <!-- Divider -->
    <div class="h-6 w-px bg-stone-200"></div>

    <!-- Mode Selector -->
    <div class="relative flex rounded-full bg-stone-100 p-0.5">
      <button
        class="rounded-full px-3 py-1 text-xs font-semibold transition-all {mode === 'days'
          ? 'bg-white text-stone-900 shadow-xs'
          : 'text-stone-500 hover:text-stone-900'}"
        onclick={() => selectMode("days")}
      >
        Days
      </button>
      <button
        class="rounded-full px-3 py-1 text-xs font-semibold transition-all {mode === 'weeks'
          ? 'bg-white text-stone-900 shadow-xs'
          : 'text-stone-500 hover:text-stone-900'}"
        onclick={() => selectMode("weeks")}
      >
        Weeks
      </button>
    </div>
  </div>
</div>
