<script lang="ts">
  import { onMount } from "svelte"
  import { LocationService } from "$lib/services/LocationService"
  import {
    DiningCourtService,
    MAX_AUTO_SELECT_DISTANCE_METERS,
    type MealDescriptor,
  } from "$lib/services/DiningCourtService"
  import { getLocations, type DiningCourtLocation } from "$lib/integrations/hfsGraphQL"
  import pDebounce from "p-debounce"

  let { diningCourt = $bindable<MealDescriptor>() } = $props<{ diningCourt: MealDescriptor }>()

  let diningCourts = $state<DiningCourtLocation[]>([])
  let diningCourtsLoading = $state(true)
  let abortController = new AbortController()

  onMount(() => {
    void loadDiningCourts()
  })

  async function loadDiningCourts() {
    diningCourtsLoading = true
    abortController.abort()
    abortController = new AbortController()

    try {
      diningCourts = (await getLocations(
        diningCourt,
        abortController.signal,
      )) as DiningCourtLocation[]

      const courtsWithCoordinates = diningCourts.flatMap((court) =>
        court.latitude != null && court.longitude != null
          ? [
              {
                name: court.name,
                latitude: court.latitude,
                longitude: court.longitude,
                category: court.category,
              },
            ]
          : [],
      )

      if (!courtsWithCoordinates.length) return

      try {
        const coordinates = await LocationService.get()
        diningCourt.name = await DiningCourtService.getNearestCourt(
          courtsWithCoordinates,
          coordinates,
          MAX_AUTO_SELECT_DISTANCE_METERS,
        )
      } catch {
        diningCourt.name = ""
      }
    } catch {
      diningCourts = []
      diningCourt.name = ""
    } finally {
      diningCourtsLoading = false
    }
  }

  const debouncedLoadDiningCourts = pDebounce(loadDiningCourts, 200)
</script>

<div
  class="pointer-events-auto flex items-center rounded-3xl border border-white/10 bg-black/45 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
  style="font-family: 'DM Mono', monospace;"
>
  <input
    type="date"
    bind:value={diningCourt.date}
    onchange={debouncedLoadDiningCourts}
    class="min-w-0 flex-1 rounded-l-full border border-white/10 bg-white/8 px-4 py-2.5 text-sm text-white transition-colors outline-none disabled:cursor-wait disabled:text-white/45"
  />

  <input
    type="time"
    bind:value={diningCourt.time}
    onchange={debouncedLoadDiningCourts}
    class="min-w-0 flex-1 border border-white/10 bg-white/8 py-2.5 text-sm text-white transition-colors outline-none disabled:cursor-wait disabled:text-white/45"
  />

  <select
    bind:value={diningCourt.name}
    disabled={diningCourtsLoading || diningCourts.length === 0}
    class="min-w-0 flex-1 rounded-r-full border border-white/10 bg-white/8 py-2.5 text-sm text-white transition-colors outline-none disabled:cursor-wait disabled:text-white/45"
  >
    <option class="bg-black/45" value="">No dining court</option>
    {#each diningCourts as court}
      <option class="bg-black/45" value={court.name}>{court.name}</option>
    {/each}
  </select>

  {#if diningCourt.name !== ""}
    <button
      onclick={() => (diningCourt.name = "")}
      disabled={!diningCourt.name}
      class="mr-2 shrink-0 rounded-full p-2.5 text-sm text-white transition-colors hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/35"
    >
      ❌
    </button>
  {/if}
</div>
