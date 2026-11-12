<script lang="ts">
  import { page } from "$app/state"
  import { resolve } from "$app/paths"

  const nav = [
    { href: "/", label: "Today", icon: "\u25c9" },
    { href: "/plan", label: "Plan", icon: "✦" },
    { href: "/trends", label: "Trends", icon: "↗" },
    { href: "/settings", label: "Settings", icon: "\u2699" },
  ] as const

  let { children } = $props()
</script>

<main class="flex min-h-0 flex-1 flex-col overflow-y-auto">
  {@render children()}
</main>

<nav class="shrink-0 border-t" style="font-family: 'DM Mono', monospace;">
  <div class="flex">
    {#each nav as item}
      <a
        href={resolve(item.href)}
        class="flex flex-1 flex-col items-center gap-1 py-3 text-xs tracking-[0.15em] uppercase transition-colors {page
          .url.pathname === item.href
          ? 'text-black'
          : 'text-zinc-600 hover:text-zinc-400'}"
      >
        <span class="text-base leading-none">{item.icon}</span>
        <span>{item.label}</span>
      </a>
    {/each}
  </div>
</nav>
