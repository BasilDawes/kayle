<script lang="ts">
  import { onMount } from "svelte"
  import { resolve } from "$app/paths"
  import { fly, fade } from "svelte/transition"
  import { DayOverviewQuery } from "$lib/queries/DayOverviewQuery"
  import { MealRepository } from "$lib/repositories/MealRepository"
  import {
    DiningCourtService,
    type MealDescriptor,
    type FoodNutrients,
  } from "$lib/services/DiningCourtService"
  import { getLocations, type DiningCourtLocation } from "$lib/integrations/hfsGraphQL"
  import {
    LLMService,
    type PlanResponse,
    type MyPlateMealOption,
    type MyPlateFoodGroup,
  } from "$lib/services/LLMService"
  import { settings, DEFAULT_MEAL_SUGGESTION_PROMPT } from "$lib/stores/settings.svelte"
  import type { NutritionInfo, MealComponent, Nutrients } from "$lib/models/meal"
  import ResultCard from "$lib/UI/ResultCard.svelte"
  import Spinner from "$lib/UI/components/Spinner.svelte"

  const today = DayOverviewQuery.today()
  let plannedTime = $state(DayOverviewQuery.nowTime())
  let promptText = $state(settings.mealSuggestionPrompt)

  let openLocations = $state<DiningCourtLocation[]>([])
  let selectedCourts = $state<string[]>([])
  let loadingLocations = $state(false)

  let loadingPlan = $state(false)
  let planResult = $state<PlanResponse | null>(null)
  let planError = $state("")

  let promptOpen = $state(false)
  let addingToLogOption = $state<string | null>(null)
  let activeConfirmationResult = $state<NutritionInfo | null>(null)
  let toastMessage = $state("")

  const ALL_MYPLATE_GROUPS: {
    key: MyPlateFoodGroup
    label: string
    icon: string
    badgeBg: string
    badgeBorder: string
  }[] = [
    {
      key: "fruits",
      label: "Fruits",
      icon: "🍎",
      badgeBg: "bg-rose-50 text-rose-800",
      badgeBorder: "border-rose-200",
    },
    {
      key: "vegetables",
      label: "Vegetables",
      icon: "🥦",
      badgeBg: "bg-emerald-50 text-emerald-800",
      badgeBorder: "border-emerald-200",
    },
    {
      key: "grains",
      label: "Grains",
      icon: "🌾",
      badgeBg: "bg-amber-50 text-amber-800",
      badgeBorder: "border-amber-200",
    },
    {
      key: "protein",
      label: "Protein",
      icon: "🥩",
      badgeBg: "bg-indigo-50 text-indigo-800",
      badgeBorder: "border-indigo-200",
    },
    {
      key: "dairy",
      label: "Dairy",
      icon: "🥛",
      badgeBg: "bg-sky-50 text-sky-800",
      badgeBorder: "border-sky-200",
    },
  ]

  function formatDateLabel(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    })
  }

  async function loadOpenLocations() {
    loadingLocations = true
    try {
      const courts = await getLocations({
        date: today,
        time: plannedTime,
        name: "all",
      })
      openLocations = courts as DiningCourtLocation[]

      // Filter out On-the-GO by default if category is explicitly On-the-GO or contains "on-the-go"
      const defaultIncluded = openLocations
        .filter((c) => !c.name?.toLowerCase().includes("on-the-go") && c.category !== "On-the-GO!")
        .map((c) => c.name)

      // Default to all open dining courts (or all open locations if none match)
      selectedCourts = defaultIncluded.length > 0 ? defaultIncluded : openLocations.map((c) => c.name)
    } catch {
      openLocations = []
      selectedCourts = []
    } finally {
      loadingLocations = false
    }
  }

  function toggleCourt(courtName: string) {
    if (selectedCourts.includes(courtName)) {
      selectedCourts = selectedCourts.filter((c) => c !== courtName)
    } else {
      selectedCourts = [...selectedCourts, courtName]
    }
  }

  function selectAllCourts() {
    selectedCourts = openLocations.map((c) => c.name)
  }

  function deselectAllCourts() {
    selectedCourts = []
  }

  function onTimeChange() {
    void loadOpenLocations()
  }

  function updatePrompt() {
    settings.setMealSuggestionPrompt(promptText)
  }

  function resetPromptToDefault() {
    promptText = DEFAULT_MEAL_SUGGESTION_PROMPT
    settings.setMealSuggestionPrompt(promptText)
  }

  async function generatePlan() {
    if (!settings.hasOpenrouter) {
      alert("Please add your OpenRouter API key in Settings first.")
      return
    }
    if (selectedCourts.length === 0) {
      alert("Please select at least one dining court.")
      return
    }

    loadingPlan = true
    planError = ""
    try {
      const descriptor: MealDescriptor = {
        date: today,
        time: plannedTime,
        name: "all",
      }
      planResult = await LLMService.generateMealPlan(
        settings.openrouterKey,
        descriptor,
        selectedCourts,
        promptText,
      )
    } catch (err) {
      planError = err instanceof Error ? err.message : "Failed to generate meal plan. Please try again."
    } finally {
      loadingPlan = false
    }
  }

  function findItemNutrition(
    name: string,
    menuNutrition: FoodNutrients,
  ): { servingSize: string; baseNutrients: Nutrients } {
    if (menuNutrition[name]) {
      return {
        servingSize: menuNutrition[name].servingSize || "1 serving",
        baseNutrients: { ...menuNutrition[name] },
      }
    }

    const normalized = name.toLowerCase().trim()
    for (const [key, value] of Object.entries(menuNutrition)) {
      if (key.toLowerCase().trim() === normalized) {
        return {
          servingSize: value.servingSize || "1 serving",
          baseNutrients: { ...value },
        }
      }
    }

    for (const [key, value] of Object.entries(menuNutrition)) {
      const keyNorm = key.toLowerCase()
      if (keyNorm.includes(normalized) || normalized.includes(keyNorm)) {
        return {
          servingSize: value.servingSize || "1 serving",
          baseNutrients: { ...value },
        }
      }
    }

    return {
      servingSize: "1 serving",
      baseNutrients: {} as Nutrients,
    }
  }

  async function handleAddToLog(locationName: string, option: MyPlateMealOption) {
    addingToLogOption = `${locationName}-${option.title}`
    try {
      const descriptor: MealDescriptor = {
        date: today,
        time: plannedTime,
        name: locationName,
      }
      const menuNutrition = await DiningCourtService.getMenuNutrition(descriptor)

      const components: MealComponent[] = option.items.map((item) => {
        const details = findItemNutrition(item.name, menuNutrition)
        return {
          name: item.name,
          servings: 1,
          servingSize: item.portion || details.servingSize,
          baseNutrients: details.baseNutrients,
        }
      })

      const nutrients = components.reduce((acc, comp) => {
        return DiningCourtService.addNutrients(
          acc,
          DiningCourtService.multiplyNutrients({ ...comp.baseNutrients }, comp.servings),
        )
      }, {} as Nutrients)

      activeConfirmationResult = {
        name: `${locationName} - ${option.title}`,
        nutrients,
        source: "openai",
        components,
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to prepare meal confirmation.")
    } finally {
      addingToLogOption = null
    }
  }

  async function handleConfirmMeal(scaledResult: NutritionInfo) {
    const timestamp = new Date(`${today}T${plannedTime}:00`).getTime()

    await MealRepository.add(
      $state.snapshot({
        date: today,
        timestamp,
        name: scaledResult.name,
        nutrients: scaledResult.nutrients,
        imageDataUrl: undefined,
        source: scaledResult.source,
        components: scaledResult.components,
      }),
    )

    activeConfirmationResult = null
    toastMessage = `Logged "${scaledResult.name}" to today's meals!`
    setTimeout(() => {
      toastMessage = ""
    }, 4500)
  }

  function getGroupMeta(group: MyPlateFoodGroup) {
    return ALL_MYPLATE_GROUPS.find((g) => g.key === group)
  }

  onMount(() => {
    void loadOpenLocations()
  })
</script>

<svelte:head>
  <title>Kayle Plan</title>
</svelte:head>

<div
  class="relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-stone-50 p-5 text-stone-900"
  style="font-family: 'DM Mono', monospace;"
>
  <!-- Toast Notification -->
  {#if toastMessage}
    <div
      transition:fly={{ y: -20, duration: 200 }}
      class="fixed top-4 right-4 left-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 shadow-xl flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2">
        <span class="text-base text-emerald-600 font-bold">✓</span>
        <span class="font-medium">{toastMessage}</span>
      </div>
      <a
        href={resolve("/")}
        class="shrink-0 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition"
      >
        View Today →
      </a>
    </div>
  {/if}

  <!-- Header -->
  <div class="pt-2">
    <p class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">
      {formatDateLabel(today)}
    </p>
    <div class="mt-1 flex items-center justify-between gap-2">
      <h1 class="text-2xl font-bold text-stone-950">Meal Plan</h1>
      <span class="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-semibold tracking-wider text-stone-600 uppercase shadow-xs">
        USDA MyPlate
      </span>
    </div>
  </div>

  <!-- API Key Warning if not set -->
  {#if !settings.hasOpenrouter}
    <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <div class="flex items-center justify-between gap-2">
        <span>OpenRouter API Key required to generate meal plans.</span>
        <a
          href={resolve("/settings")}
          class="rounded-lg bg-amber-200 px-3 py-1 font-semibold text-amber-900 hover:bg-amber-300 transition"
        >
          Settings →
        </a>
      </div>
    </div>
  {/if}

  <!-- Planning Parameters Card -->
  <div class="mt-4 flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
    <!-- Time selector (affects open dining courts) -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase" for="planned-time">
          Planned Time
        </label>
        <span class="text-[11px] text-stone-400">Affects open dining courts</span>
      </div>
      <div class="flex items-center gap-2">
        <input
          id="planned-time"
          type="time"
          bind:value={plannedTime}
          onchange={onTimeChange}
          class="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 shadow-2xs"
        />
        <button
          type="button"
          onclick={() => {
            plannedTime = DayOverviewQuery.nowTime()
            void loadOpenLocations()
          }}
          class="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition"
        >
          Now
        </button>
      </div>
    </div>

    <!-- Dining Courts Selection -->
    <div class="flex flex-col gap-2.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">
          Dining Courts ({selectedCourts.length}/{openLocations.length})
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={selectAllCourts}
            disabled={openLocations.length === 0}
            class="text-[11px] font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-40 transition"
          >
            All
          </button>
          <span class="text-stone-300">|</span>
          <button
            type="button"
            onclick={deselectAllCourts}
            disabled={openLocations.length === 0}
            class="text-[11px] font-semibold text-stone-500 hover:text-stone-800 disabled:opacity-40 transition"
          >
            None
          </button>
        </div>
      </div>

      {#if loadingLocations}
        <div class="flex items-center gap-2 py-2 text-xs text-stone-500">
          <Spinner style="width: 12px; height: 12px" />
          <span>Checking open locations...</span>
        </div>
      {:else if openLocations.length === 0}
        <div class="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center text-xs text-stone-500">
          No dining courts are open at {plannedTime}. Try changing the planned time above.
        </div>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each openLocations as court (court.name)}
            {@const isSelected = selectedCourts.includes(court.name)}
            <button
              type="button"
              onclick={() => toggleCourt(court.name)}
              class="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-all {isSelected
                ? 'border-stone-900 bg-stone-900 text-white font-semibold shadow-xs'
                : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-white'}"
            >
              <span class="text-[11px]">{isSelected ? "✓" : "+"}</span>
              <span>{court.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Custom Prompt Accordion -->
    <div class="border-t border-stone-200 pt-3">
      <button
        type="button"
        onclick={() => (promptOpen = !promptOpen)}
        class="flex w-full items-center justify-between text-xs font-semibold tracking-[0.15em] text-stone-600 uppercase hover:text-stone-900 transition"
      >
        <span class="flex items-center gap-1.5">
          <span>⚙ Custom Prompt</span>
        </span>
        <span class="text-xs text-stone-400 transition-transform duration-200" class:rotate-180={promptOpen}>
          ▼
        </span>
      </button>

      {#if promptOpen}
        <div transition:fade={{ duration: 150 }} class="mt-3 flex flex-col gap-2">
          <p class="text-[11px] text-stone-500">
            Customize nutritional rules, dietary preferences, or items to exclude.
          </p>
          <textarea
            bind:value={promptText}
            oninput={updatePrompt}
            rows="4"
            placeholder="Suggest balanced meals..."
            class="w-full resize-y rounded-xl border border-stone-300 bg-stone-50/50 p-3 text-xs leading-relaxed text-stone-900 placeholder-stone-400 outline-none focus:border-stone-500 focus:bg-white focus:ring-1 focus:ring-stone-500 shadow-2xs"
          ></textarea>
          <div class="flex justify-end">
            <button
              type="button"
              onclick={resetPromptToDefault}
              class="text-[11px] font-semibold text-stone-500 hover:text-stone-800 transition underline decoration-stone-300"
            >
              Reset to default
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Generate Button -->
    <button
      type="button"
      onclick={generatePlan}
      disabled={loadingPlan || selectedCourts.length === 0 || !settings.hasOpenrouter}
      class="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3.5 text-xs font-semibold tracking-wider text-white uppercase shadow-sm hover:bg-stone-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 transition"
    >
      {#if loadingPlan}
        <Spinner style="width: 14px; height: 14px" />
        <span>Generating Plan...</span>
      {:else}
        <span>Generate Meal Plan ✦</span>
      {/if}
    </button>
  </div>

  <!-- Plan Error Alert -->
  {#if planError}
    <div class="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
      <p class="font-bold text-red-950 mb-1">Failed to generate plan</p>
      <p class="leading-relaxed">{planError}</p>
      <button
        type="button"
        onclick={generatePlan}
        class="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-900 hover:bg-red-50 transition"
      >
        Try Again
      </button>
    </div>
  {/if}

  <!-- Loading State Card -->
  {#if loadingPlan}
    <div class="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white py-12 text-center shadow-xs">
      <Spinner style="width: 28px; height: 28px" />
      <p class="text-sm font-bold text-stone-800">Finding the best USDA MyPlate combinations...</p>
      <p class="text-xs text-stone-500">Analyzing menus for {selectedCourts.length} dining courts</p>
    </div>
  {/if}

  <!-- Plan Results (Rich Cards) -->
  {#if !loadingPlan && planResult}
    <div class="mt-6 flex flex-col gap-6">
      <div class="flex items-center justify-between border-b border-stone-200 pb-2">
        <span class="text-xs font-bold tracking-[0.2em] text-stone-500 uppercase">
          Recommendations ({planResult.locations.length} Locations)
        </span>
        <span class="text-xs font-semibold text-stone-600">{plannedTime}</span>
      </div>

      {#each planResult.locations as location (location.location)}
        <!-- Rich Card for Each Location -->
        <div class="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
          <!-- Location Header -->
          <div class="flex items-center justify-between border-b border-stone-200 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-lg">🏛️</span>
              <h2 class="text-base font-bold text-stone-950 tracking-wide">{location.location}</h2>
            </div>
            <span class="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600">
              {location.options.length} {location.options.length === 1 ? "Option" : "Options"}
            </span>
          </div>

          {#if location.notes}
            <div class="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              ℹ {location.notes}
            </div>
          {/if}

          <!-- Multiple Options for this Location -->
          {#if location.options.length === 0}
            <p class="py-4 text-center text-xs text-stone-500">
              No options meeting guidelines found for this location.
            </p>
          {:else}
            <div class="flex flex-col gap-4">
              {#each location.options as option, idx (option.title + idx)}
                {@const fulfilledCount = option.foodGroupsFulfilled?.length ?? 0}
                {@const isAddingThis = addingToLogOption === `${location.location}-${option.title}`}

                <!-- Option Subcard -->
                <div class="flex flex-col gap-3.5 rounded-2xl border border-stone-200 bg-stone-50/40 p-4 transition hover:border-stone-300 hover:bg-stone-50/70 shadow-2xs">
                  <!-- Option Title & Completeness -->
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                          Option {idx + 1}
                        </span>
                        {#if fulfilledCount === 5}
                          <span class="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            ★ 5/5 Food Groups
                          </span>
                        {:else}
                          <span class="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            {fulfilledCount}/5 Food Groups
                          </span>
                        {/if}
                      </div>
                      <h3 class="mt-1 text-sm font-bold text-stone-900 leading-snug">
                        {option.title}
                      </h3>
                    </div>
                  </div>

                  <!-- Description -->
                  <p class="text-xs leading-relaxed text-stone-600">
                    {option.description}
                  </p>

                  <!-- MyPlate 5 Food Groups Indicator Bar -->
                  <div class="flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
                    <span class="text-[10px] font-bold tracking-[0.15em] text-stone-500 uppercase">
                      MyPlate Food Groups Fulfilled
                    </span>
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                      {#each ALL_MYPLATE_GROUPS as group (group.key)}
                        {@const isFulfilled = option.foodGroupsFulfilled?.includes(group.key)}
                        <span
                          class="flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition {isFulfilled
                            ? `${group.badgeBg} ${group.badgeBorder} font-semibold shadow-xs`
                            : 'border-stone-200 bg-stone-100 text-stone-400 line-through opacity-70'}"
                        >
                          <span class="text-xs">{group.icon}</span>
                          <span>{group.label}</span>
                          {#if isFulfilled}
                            <span class="text-[10px] font-bold text-emerald-600">✓</span>
                          {/if}
                        </span>
                      {/each}
                    </div>
                  </div>

                  <!-- Items Included in this Meal -->
                  <div class="flex flex-col gap-1.5">
                    <span class="text-[10px] font-bold tracking-[0.15em] text-stone-500 uppercase">
                      Menu Items
                    </span>
                    <div class="flex flex-col gap-1.5">
                      {#each option.items as item (item.name)}
                        <div class="flex items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-xs shadow-2xs">
                          <div class="flex items-center gap-2 min-w-0 flex-1">
                            <span class="text-stone-400">•</span>
                            <span class="truncate font-semibold text-stone-800">{item.name}</span>
                            {#if item.portion}
                              <span class="shrink-0 text-[11px] text-stone-500">({item.portion})</span>
                            {/if}
                          </div>
                          <div class="flex shrink-0 items-center gap-1">
                            {#each item.foodGroups as fg}
                              {@const meta = getGroupMeta(fg)}
                              {#if meta}
                                <span class="rounded-md border {meta.badgeBorder} {meta.badgeBg} px-1.5 py-0.5 text-[10px] font-medium">
                                  {meta.icon} {meta.label}
                                </span>
                              {/if}
                            {/each}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>

                  <!-- Add to Log Button -->
                  <div class="pt-1">
                    <button
                      type="button"
                      onclick={() => handleAddToLog(location.location, option)}
                      disabled={isAddingThis}
                      class="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-stone-800 active:scale-[0.99] disabled:opacity-60"
                    >
                      {#if isAddingThis}
                        <Spinner style="width: 12px; height: 12px" />
                        <span>Opening meal confirmation...</span>
                      {:else}
                        <span>➕ Add to log</span>
                      {/if}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Empty state before generating -->
  {#if !loadingPlan && !planResult}
    <div class="mt-8 flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span class="text-5xl">🍽️</span>
      <h3 class="text-sm font-bold text-stone-800">Plan Balanced Meals with USDA MyPlate</h3>
      <p class="max-w-xs text-xs leading-relaxed text-stone-500">
        Choose your planned meal time and dining courts, then tap "Generate Meal Plan" to see balanced options tailored to current dining court menus.
      </p>
    </div>
  {/if}
</div>

<!-- Meal Confirmation Modal (ResultCard) -->
{#if activeConfirmationResult}
  <ResultCard
    result={activeConfirmationResult}
    onConfirm={handleConfirmMeal}
    onDiscard={() => (activeConfirmationResult = null)}
  />
{/if}