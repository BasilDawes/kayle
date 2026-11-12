<script lang="ts">
  import { onMount } from "svelte"
  import { resolve } from "$app/paths"
  import { DayOverviewQuery, type DayOverview } from "$lib/queries/DayOverviewQuery"
  import { MealRepository } from "$lib/repositories/MealRepository"
  import MealCard from "$lib/UI/MealCard.svelte"
  import Spinner from "$lib/UI/components/Spinner.svelte"
  import NutritionLabel from "$lib/UI/NutritionLabel.svelte"
  import { LLMService } from "$lib/services/LLMService"
  import { settings } from "$lib/stores/settings.svelte"
  import { localISODate } from "$lib/integrations/hfsGraphQL"
  import Markdown from "svelte-markdown"
  import type { NumericNutrientKey } from "$lib/services/DiningCourtService"
  import { formatNutrientValue } from "$lib/utils/nutrientUnits"
  import { getNutrientBreakdown } from "$lib/utils/nutrientBreakdown"
  import { fly } from "svelte/transition"

  let overview = $state<DayOverview | null>(null)
  let loading = $state(true)
  let suggestedMeal = $state("")
  let loadingSuggestions = $state(false)
  let selectedDate = $state(DayOverviewQuery.today())
  let fabOpen = $state(false)

  function addDays(date: string, amount: number) {
    const nextDate = new Date(`${date}T00:00:00`)
    nextDate.setDate(nextDate.getDate() + amount)
    return localISODate(nextDate)
  }

  function formatDateLabel(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  }

  function titleForDate(date: string) {
    if (date === DayOverviewQuery.today()) return "Today"
    if (date === addDays(DayOverviewQuery.today(), -1)) return "Yesterday"
    return formatDateLabel(date)
  }

  const canGoForward = $derived(selectedDate < DayOverviewQuery.today())

  async function load() {
    loading = true
    overview = await DayOverviewQuery.forDate(selectedDate)
    loading = false
  }

  async function deleteMeal(id: number) {
    await MealRepository.delete(id)
    await load()
  }

  async function reassignMealDate(id: number, date: string) {
    await MealRepository.reassignDate(id, date)
    await load()
  }

  async function goToPreviousDay() {
    selectedDate = addDays(selectedDate, -1)
    await load()
  }

  async function goToNextDay() {
    if (!canGoForward) return
    selectedDate = addDays(selectedDate, 1)
    await load()
  }

  async function loadSuggestedMeals() {
    loadingSuggestions = true
    try {
      suggestedMeal = await LLMService.suggestMeals(settings.openrouterKey)
    } catch (err) {
      alert(err)
    }
    loadingSuggestions = false
  }

  function showNutrientBreakdown(nutrient: NumericNutrientKey, label: string) {
    if (!overview) return

    const foods = getNutrientBreakdown(overview.meals, nutrient)
    if (!foods.length) {
      alert(`No foods logged for ${label.toLowerCase()} on ${titleForDate(selectedDate)}.`)
      return
    }

    alert(
      `${label} contributors for ${titleForDate(selectedDate)}:\n\n${foods
        .map((food) => `${food.name}: ${formatNutrientValue(nutrient, food.value)}`)
        .join("\n")}`,
    )
  }

  onMount(load)
</script>

<svelte:head>
  <title>Kayle Home</title>
</svelte:head>

<div
  class="relative flex h-full min-h-0 w-full flex-col"
  style="font-family: 'DM Mono', monospace;"
>
  <div class="min-h-0 flex-1 overflow-y-auto pb-20">
    <div class="pt-2">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs tracking-[0.2em] text-zinc-500 uppercase">
            {titleForDate(selectedDate)}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-lg text-white transition hover:border-zinc-700 hover:bg-zinc-800"
            onclick={goToPreviousDay}
            aria-label="Show previous day"
          >
            <span aria-hidden="true">&larr;</span>
          </button>
          <button
            class="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-lg text-white transition hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            onclick={goToNextDay}
            disabled={!canGoForward}
            aria-label="Show next day"
          >
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="flex items-center justify-center py-16">
        <Spinner />
      </div>
    {:else if overview}
      <!-- Day summary page -->
      {#if DayOverviewQuery.today() == selectedDate}
        <button class="mb-2 w-full cursor-pointer border" onclick={loadSuggestedMeals}>
          Suggest meals
          {#if loadingSuggestions}
            <Spinner style="width: 10px; height: 10px" />
          {/if}
        </button>
      {/if}
      <div class="md">
        <Markdown source={suggestedMeal} />
      </div>

      {#if overview.meals.length > 0}
        <NutritionLabel
          {...overview.nutrients}
          class="mx-auto"
          onNutrientClick={showNutrientBreakdown}
          colorCode={false}
        />
      {:else}
        <div class="flex flex-col items-center gap-2 py-16 text-center">
          <span class="text-5xl">&#127869;</span>
          <p class="text-sm text-zinc-500">Nothing logged yet.</p>
          <p class="text-xs text-zinc-600">Tap Scan to get started.</p>
        </div>
      {/if}
      {#each overview.meals.toReversed() as meal (meal.id)}
        <MealCard {meal} onDelete={deleteMeal} onDateChange={reassignMealDate} />
      {/each}
    {/if}
  </div>

  <!-- Floating Action Button (FAB) -->
  {#if fabOpen}
    <!-- Backdrop to close when clicking outside -->
    <button
      tabindex="-1"
      class="absolute inset-0 z-40 cursor-default bg-transparent outline-none"
      onclick={() => (fabOpen = false)}
      type="button"
      aria-label="Close menu"
    ></button>
  {/if}

  <div class="absolute right-6 bottom-6 z-40 flex flex-col items-end gap-3">
    {#if fabOpen}
      <!-- Speed dial options (stacked bottom to top: camera, barcode, describe) -->
      <div class="z-50 flex flex-col items-end gap-2.5" transition:fly={{ y: 15, duration: 180 }}>
        <!-- Describe (top) -->
        <a
          href={resolve("/log?date=" + selectedDate)}
          class="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase shadow-xl transition hover:border-zinc-700 hover:text-white"
          onclick={() => (fabOpen = false)}
        >
          <span>✏️</span>
          <span>Describe</span>
        </a>

        <!-- Barcode (middle) -->
        <a
          href={resolve("/scan?mode=barcode&date=" + selectedDate)}
          class="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase shadow-xl transition hover:border-zinc-700 hover:text-white"
          onclick={() => (fabOpen = false)}
        >
          <span>📦</span>
          <span>Barcode</span>
        </a>

        <!-- Camera (bottom) -->
        <a
          href={resolve("/scan?mode=food&date=" + selectedDate)}
          class="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase shadow-xl transition hover:border-zinc-700 hover:text-white"
          onclick={() => (fabOpen = false)}
        >
          <span>📷</span>
          <span>Camera</span>
        </a>
      </div>
    {/if}

    <!-- Main FAB Button -->
    <button
      onclick={() => (fabOpen = !fabOpen)}
      class="z-50 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-white text-zinc-950 shadow-2xl transition hover:scale-105 focus:outline-none active:scale-95"
      aria-label="Add meal"
      type="button"
    >
      <span class="text-2xl transition-transform duration-200" class:rotate-45={fabOpen}> ➕ </span>
    </button>
  </div>
</div>

<style>
  :global(.md ul) {
    list-style-type: circle;
    list-style-position: inside;
    font-size: small;
  }

  :global(.md li) {
    margin-bottom: 0.5rem;
  }
</style>
