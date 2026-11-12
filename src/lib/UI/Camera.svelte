<script module lang="ts">
  export function downloadFullRes(source: HTMLCanvasElement | string): void {
    if (typeof window === "undefined" || typeof document === "undefined") return

    const iso = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `kayle-meal-${iso}.jpg`

    const triggerDownload = (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    if (typeof source === "string") {
      if (source.startsWith("blob:")) {
        const a = document.createElement("a")
        a.href = source
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      }

      try {
        const [header, base64Data] = source.split(",")
        const mime = header?.match(/:(.*?);/)?.[1] || "image/jpeg"
        const binary = atob(base64Data)
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          array[i] = binary.charCodeAt(i)
        }
        triggerDownload(new Blob([array], { type: mime }))
      } catch {
        const a = document.createElement("a")
        a.href = source
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      return
    }

    source.toBlob(
      (blob) => {
        if (blob) triggerDownload(blob)
      },
      "image/jpeg",
      0.92,
    )
  }
</script>

<script lang="ts">
  import { onMount, onDestroy, type Snippet } from "svelte"
  import Spinner from "./components/Spinner.svelte"
  import { resolve } from "$app/paths"
  import { BarcodeService } from "$lib/services/BarcodeService"

  type Mode = "food" | "barcode"

  interface Props {
    onPhotoCaptured: (photo: string, thumbnail: string, mode: Mode) => void
    mode?: Mode
    bottomSlot?: Snippet
    paused?: boolean
  }

  let { onPhotoCaptured, mode = $bindable("food"), bottomSlot, paused = false }: Props = $props()

  let videoEl = $state<HTMLVideoElement | null>(null)
  let canvasEl = $state<HTMLCanvasElement | null>(null)
  let stream = $state<MediaStream | null>(null)
  let error = $state("")
  let cameraReady = $state(false)
  let capturing = $state(false)

  onMount(async () => {
    await startCamera()
  })

  onDestroy(() => {
    stopCamera()
  })

  async function startCamera(): Promise<void> {
    try {
      error = ""
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 900 },
          height: { ideal: 1200 },
          aspectRatio: { ideal: 3 / 4 },
        },
        audio: false,
      })
      if (videoEl) {
        videoEl.srcObject = stream
        videoEl.onloadedmetadata = () => {
          cameraReady = true
        }
      }
    } catch (err) {
      error = "Camera access denied or unavailable."
      console.error(err)
    }
  }

  function stopCamera(): void {
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
  }

  function createThumbnail(canvas: HTMLCanvasElement): string {
    const size = 56
    const src = Math.min(canvas.width, canvas.height)
    const sx = (canvas.width - src) / 2
    const sy = (canvas.height - src) / 2

    const thumb = document.createElement("canvas")
    thumb.width = size
    thumb.height = size
    const ctx = thumb.getContext("2d")!
    ctx.drawImage(canvas, sx, sy, src, src, 0, 0, size, size)
    return thumb.toDataURL("image/jpeg", 0.85)
  }

  async function checkFrameForBarcode(): Promise<void> {
    if (!videoEl || !canvasEl || !cameraReady || paused || capturing) return
    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return

    try {
      canvasEl.width = videoEl.videoWidth
      canvasEl.height = videoEl.videoHeight
      const ctx = canvasEl.getContext("2d")!
      ctx.drawImage(videoEl, 0, 0)

      const barcode = await BarcodeService.detectElement(canvasEl)
      if (barcode && !paused && !capturing) {
        const fullResDataUrl = canvasEl.toDataURL("image/jpeg", 0.92)
        const thumbnailDataUrl = createThumbnail(canvasEl)
        onPhotoCaptured?.(fullResDataUrl, thumbnailDataUrl, "barcode")
      }
    } catch (err) {
      console.error("Barcode detection error:", err)
    }
  }

  $effect(() => {
    if (cameraReady && !paused && !capturing) {
      const interval = setInterval(checkFrameForBarcode, 1000)
      return () => clearInterval(interval)
    }
  })

  async function capture(): Promise<void> {
    if (!cameraReady || capturing) return
    capturing = true

    if (canvasEl && videoEl) {
      canvasEl.width = videoEl.videoWidth
      canvasEl.height = videoEl.videoHeight
      const ctx = canvasEl.getContext("2d")!
      ctx.drawImage(videoEl, 0, 0)

      let activeMode = mode
      try {
        const barcode = await BarcodeService.detectElement(canvasEl)
        if (barcode) {
          activeMode = "barcode"
        }
      } catch (err) {
        console.error("Barcode detection during capture error:", err)
      }

      // Full-res for AI analysis, thumbnail for storage
      const fullResDataUrl = canvasEl.toDataURL("image/jpeg", 0.92)
      const thumbnailDataUrl = createThumbnail(canvasEl)
      onPhotoCaptured?.(fullResDataUrl, thumbnailDataUrl, activeMode)
    }

    await new Promise((r) => setTimeout(r, 300))
    capturing = false
  }
</script>

<!-- Root — no rounded edges -->
<div
  class="relative h-full min-h-125 w-full overflow-hidden bg-black select-none"
  style="font-family: 'DM Mono', 'Courier New', monospace;"
>
  <!-- Live video feed -->
  <video
    bind:this={videoEl}
    autoplay
    playsinline
    muted
    class="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
    class:opacity-0={!cameraReady}
  ></video>

  <!-- Hidden capture canvas -->
  <canvas bind:this={canvasEl} class="hidden"></canvas>

  <!-- Error state -->
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
      <svg class="h-12 w-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
        />
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      <p class="text-sm tracking-widest text-zinc-400 uppercase">{error}</p>
      <button
        onclick={startCamera}
        class="mt-2 rounded-full border border-zinc-600 px-5 py-2 text-xs tracking-widest text-zinc-300 uppercase transition-colors hover:bg-zinc-800"
      >
        Retry
      </button>
    </div>
  {/if}

  <!-- Loading state -->
  {#if !cameraReady && !error}
    <div class="absolute inset-0 z-10 flex items-center justify-center">
      <div class="flex flex-col items-center gap-4">
        <Spinner />
        <span class="text-xs tracking-[0.2em] text-zinc-500 uppercase">Initializing camera</span>
      </div>
    </div>
  {/if}

  {#if cameraReady}
    <!-- ── BOTTOM: Shutter bar ── -->
    <div
      class="absolute right-0 bottom-0 left-0 z-20 flex flex-col items-center justify-center gap-4 bg-gradient-to-t from-black/65 to-transparent pt-6 pb-10"
    >
      {#if mode === "food"}
        <button class="rounded-full bg-amber-50 p-1">+ context</button>
      {/if}
      <div class="flex flex-row items-center gap-4">
        <a href={resolve("/")} class="size-8 text-2xl">🔙</a>
        <!-- Shutter button — centered -->
        <button
          onclick={capture}
          disabled={!cameraReady || capturing}
          aria-label="Take photo"
          class="
          relative flex h-20 w-20 items-center justify-center rounded-full
          transition-transform duration-100
          focus:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-50
        "
        >
          <!-- Outer ring -->
          <span
            class="absolute inset-0 rounded-full border-[3px] border-white/80 shadow-[0_0_18px_rgba(255,255,255,0.18)]"
          ></span>
          <!-- Inner disc -->
          <span
            class="h-15.5 w-15.5 rounded-full bg-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.12)] transition-all duration-100"
            class:scale-90={capturing}
            class:bg-zinc-200={capturing}
          ></span>
        </button>
        <div class="size-8"></div>
      </div>
      {@render bottomSlot?.()}
    </div>
  {/if}
</div>
