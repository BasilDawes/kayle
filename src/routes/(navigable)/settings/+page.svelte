<script lang="ts">
  import { DAILY_VALUES } from "$lib"
  import { settings, MODELS, type Model } from "$lib/stores/settings.svelte"
  import {
    NUMERIC_NUTRIENT_KEYS,
    NUMERIC_NUTRIENT_LABELS,
    type NumericNutrientKey,
  } from "$lib/services/DiningCourtService"
  import {
    getNutrientUnit,
    scaleNutrientValue,
    unscaleNutrientValue,
  } from "$lib/utils/nutrientUnits"
  import { MealRepository } from "$lib/repositories/MealRepository"

  let openrouterKey = $state(settings.openrouterKey)
  let offKey = $state(settings.openfoodfactsKey)
  let selectedModel = $state<Model>(settings.model)
  let showOpenrouter = $state(false)
  let showOff = $state(false)
  let showDailyValues = $state(false)
  let importFileInput = $state<HTMLInputElement | null>(null)

  function displayValue(key: NumericNutrientKey): number {
    const stored = settings.dailyValues[key]
    if (stored === -1) return scaleNutrientValue(key, DAILY_VALUES[key])
    return scaleNutrientValue(key, stored)
  }

  function isHidden(key: NumericNutrientKey): boolean {
    return settings.dailyValues[key] === -1
  }

  function setDisplayValue(key: NumericNutrientKey, display: number) {
    settings.setDailyValue(key, unscaleNutrientValue(key, display))
  }

  function setHidden(key: NumericNutrientKey, hidden: boolean) {
    if (hidden) {
      settings.setDailyValue(key, -1)
    } else {
      settings.setDailyValue(key, DAILY_VALUES[key])
    }
  }

  function resetDailyValues() {
    settings.resetDailyValues()
  }

  async function exportData() {
    const blob = await MealRepository.exportDump()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `kayle-db-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function triggerImport() {
    importFileInput?.click()
  }

  async function importData(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
      await MealRepository.importDump(file)
      window.location.reload()
    } finally {
      input.value = ""
    }
  }
</script>

<svelte:head>
  <title>Kayle Settings</title>
</svelte:head>

<div class="flex flex-col gap-6 p-5" style="font-family: 'DM Mono', monospace;">
  <div class="pt-2">
    <p class="text-xs tracking-[0.2em] text-zinc-500 uppercase">Configuration</p>
    <h1 class="text-2xl font-bold text-white">Settings</h1>
  </div>

  <div class="flex flex-col gap-5 rounded-2xl border border-zinc-900 p-5">
    <!-- OpenRouter key -->
    <div class="flex flex-col gap-2">
      <label class="text-xs tracking-[0.2em] text-zinc-400 uppercase" for="openrouter-key">
        OpenRouter API Key
      </label>
      <p class="text-xs text-zinc-600">Required for food photo analysis.</p>
      <div class="relative">
        <input
          id="openrouter-key"
          type={showOpenrouter ? "text" : "password"}
          bind:value={openrouterKey}
          oninput={() => settings.setOpenrouterKey(openrouterKey)}
          placeholder="sk-or-..."
          class="w-full rounded-xl px-4 py-3 pr-12 text-sm placeholder-zinc-600 ring-1 ring-zinc-700 outline-none focus:ring-white/30"
        />
        <button
          onclick={() => (showOpenrouter = !showOpenrouter)}
          class="absolute top-1/2 right-3 -translate-y-1/2 text-lg text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Toggle OpenRouter key visibility"
          type="button"
        >
          {showOpenrouter ? "🙈" : "👁️"}
        </button>
      </div>
    </div>

    <!-- Model picker -->
    <div class="flex flex-col gap-2">
      <label class="text-xs tracking-[0.2em] text-zinc-400 uppercase" for="model-select">
        AI Model
      </label>
      <p class="text-xs text-zinc-600">Which OpenRouter model analyzes your food.</p>
      <select
        id="model-select"
        bind:value={selectedModel}
        onchange={() => settings.setModel(selectedModel)}
        class="w-full rounded-xl px-4 py-3 text-sm ring-1 ring-zinc-700 outline-none focus:ring-white/30"
      >
        {#each MODELS as model (model)}
          <option value={model}>{model}</option>
        {/each}
      </select>
    </div>

    <!-- OpenFoodFacts key -->
    <div class="flex flex-col gap-2">
      <label class="text-xs tracking-[0.2em] text-zinc-400 uppercase" for="off-key">
        Open Food Facts API Key
      </label>
      <p class="text-xs text-zinc-600">
        Optional — enables higher rate limits for barcode scanning.
      </p>
      <div class="relative">
        <input
          id="off-key"
          type={showOff ? "text" : "password"}
          bind:value={offKey}
          oninput={() => settings.setOpenfoodfactsKey(offKey)}
          placeholder="optional"
          class="w-full rounded-xl px-4 py-3 pr-12 text-sm placeholder-zinc-600 ring-1 ring-zinc-700 outline-none focus:ring-white/30"
        />
        <button
          onclick={() => (showOff = !showOff)}
          class="absolute top-1/2 right-3 -translate-y-1/2 text-lg text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Toggle OpenFoodFacts key visibility"
          type="button"
        >
          {showOff ? "🙈" : "👁️"}
        </button>
      </div>
    </div>
  </div>

  <!-- Info box -->
  <div class="rounded-xl border border-zinc-800 p-4">
    <p class="text-xs leading-relaxed text-zinc-600">
      Keys are stored only in your browser's localStorage. They are sent directly to OpenRouter and
      Open Food Facts and never routed through any other server.
    </p>
  </div>

  <!-- Daily values -->
  <div class="overflow-hidden rounded-2xl border border-zinc-900">
    <button
      type="button"
      onclick={() => (showDailyValues = !showDailyValues)}
      class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-zinc-900/20"
      aria-expanded={showDailyValues}
    >
      <div>
        <p class="text-xs tracking-[0.2em] text-zinc-400 uppercase">Nutrition Label</p>
        <p class="text-sm font-semibold text-zinc-400">Daily Values</p>
      </div>
      <span class="text-zinc-500 transition-transform" class:rotate-180={showDailyValues}>▼</span>
    </button>

    {#if showDailyValues}
      <div class="flex flex-col gap-4 border-t border-zinc-900 px-5 pt-4 pb-5">
        <p class="text-xs leading-relaxed text-zinc-600">
          Customize daily value targets shown on nutrition labels. Uncheck "Show" to hide a nutrient
          entirely. Values save automatically.
        </p>
        <p class="text-xs">
          <a
            href="https://www.nal.usda.gov/human-nutrition-and-food-safety/dri-calculator"
            target="_blank"
            class="text-blue-500 underline hover:text-blue-300"
          >
            USDA Daily Value Calculator
          </a>
        </p>

        <div class="flex flex-col gap-3">
          {#each NUMERIC_NUTRIENT_KEYS as key (key)}
            {@const unit = getNutrientUnit(key)}
            {@const hidden = isHidden(key)}
            <div class="flex items-center gap-3">
              <label class="min-w-0 flex-1 text-sm text-zinc-600" for="dv-{key}">
                {NUMERIC_NUTRIENT_LABELS[key]}
              </label>
              <div class="flex items-center gap-2">
                <input
                  id="dv-{key}"
                  type="number"
                  min="0"
                  step="any"
                  value={displayValue(key)}
                  disabled={hidden}
                  oninput={(e) =>
                    setDisplayValue(key, Number((e.currentTarget as HTMLInputElement).value))}
                  class="w-24 rounded-lg px-3 py-2 text-right text-sm ring-1 ring-zinc-700 outline-none focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <span class="w-8 text-xs text-zinc-500">{unit}</span>
                <label class="flex items-center gap-1.5 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onchange={(e) => setHidden(key, !(e.currentTarget as HTMLInputElement).checked)}
                    class="rounded border-zinc-600"
                  />
                  Show
                </label>
              </div>
            </div>
          {/each}
        </div>

        <button
          type="button"
          onclick={resetDailyValues}
          class="outline-btn self-start px-4 py-2 text-xs"
        >
          Reset to defaults
        </button>
      </div>
    {/if}
  </div>

  <div class="flex gap-3">
    <button type="button" onclick={triggerImport} class="outline-btn flex-1 py-3 text-sm">
      Import JSON
    </button>
    <button type="button" onclick={exportData} class="outline-btn flex-1 py-3 text-sm">
      Export JSON
    </button>
    <input
      bind:this={importFileInput}
      type="file"
      accept="application/json,.json"
      class="hidden"
      onchange={importData}
    />
  </div>
</div>
