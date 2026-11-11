<script lang="ts">
  import { goto } from "$app/navigation"
  import { page } from "$app/state"
  import Camera, { downloadFullRes } from "$lib/UI/Camera.svelte"
  import LoadingOverlay from "$lib/UI/LoadingOverlay.svelte"
  import ResultCard from "$lib/UI/ResultCard.svelte"
  import { processScan } from "$lib/workflows/processScan"
  import { MealRepository } from "$lib/repositories/MealRepository"
  import { DayOverviewQuery } from "$lib/queries/DayOverviewQuery"
  import type { NutritionInfo } from "$lib/models/meal"
  import { resolve } from "$app/paths"
  import MealSelector from "$lib/UI/components/MealSelector.svelte"
  import type { MealDescriptor } from "$lib/services/DiningCourtService"

  type ScanState = "idle" | "processing" | "result" | "error"
  type ScanMode = "food" | "barcode"

  let activeMode = $state<ScanMode>("barcode")

  $effect(() => {
    activeMode =
      ((page.url.searchParams.get("mode") || page.url.searchParams.get("type")) as ScanMode) ??
      activeMode
    diningCourt.date = page.url.searchParams.get("date") ?? diningCourt.date
  })

  let cameraState = $state<ScanState>("idle")
  let capturedImage = $state<string | null>(null)
  let capturedMode = $state<ScanMode | null>(null)
  let diningCourt = $state<MealDescriptor>({
    date: DayOverviewQuery.today(),
    time: DayOverviewQuery.nowTime(),
    name: "",
  })
  let result = $state<NutritionInfo | null>(null)
  let error = $state("")
  let statusMessage = $state("Analyzing...")

  let capturedThumbnail = $state<string | null>(null)

  async function handleCapture(photo: string, thumbnail: string, mode: ScanMode) {
    capturedImage = photo
    capturedThumbnail = thumbnail
    capturedMode = mode
    cameraState = "processing"
    statusMessage = mode === "barcode" ? "Detecting barcode..." : "Analyzing food..."

    try {
      result = await processScan(photo, mode, diningCourt || undefined)
      cameraState = "result"
    } catch (err) {
      error = err instanceof Error ? err.message : "Analysis failed. Please try again."
      cameraState = "error"
    }
  }

  async function handleConfirm(scaledResult: NutritionInfo) {
    if (capturedMode === "food" && capturedImage) {
      downloadFullRes(capturedImage)
    }

    await MealRepository.add(
      $state.snapshot({
        date: DayOverviewQuery.today(),
        timestamp: Date.now(),
        name: scaledResult.name,
        nutrients: scaledResult.nutrients,
        imageDataUrl: result?.imageDataUrl ?? capturedThumbnail ?? undefined,
        source: scaledResult.source,
        components: scaledResult.components,
      }),
    )
    goto(resolve("/"))
  }

  function reset() {
    result = null
    capturedImage = null
    capturedThumbnail = null
    capturedMode = null
    error = ""
    cameraState = "idle"
  }
</script>

<svelte:head>
  <title>Kayle Scan</title>
</svelte:head>

<div class="relative h-full">
  {#snippet mealSelector()}
    <div class="pointer-events-none w-full p-4">
      <MealSelector bind:diningCourt />
    </div>
  {/snippet}

  <Camera
    onPhotoCaptured={handleCapture}
    bind:mode={activeMode}
    bottomSlot={(activeMode === "food" || undefined) && mealSelector}
    paused={cameraState !== "idle"}
  />

  {#if cameraState === "processing"}
    <LoadingOverlay message={statusMessage} />
  {/if}

  {#if cameraState === "result" && result}
    <ResultCard
      {result}
      imageDataUrl={result.imageDataUrl ?? capturedImage ?? undefined}
      onConfirm={handleConfirm}
      onDiscard={reset}
    />
  {/if}

  {#if cameraState === "error"}
    <div
      class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-zinc-950/95 p-8 backdrop-blur-sm"
      style="font-family: 'DM Mono', monospace;"
    >
      <svg
        class="h-10 w-10 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
        />
      </svg>
      <p class="text-center text-sm leading-relaxed text-zinc-300">{error}</p>
      <button
        onclick={reset}
        class="rounded-full border border-zinc-700 px-6 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
      >
        Try Again
      </button>
    </div>
  {/if}
</div>
