<script>
  // Runes mode: read props via $props()
  const { count = 8 } = $props();
</script>

<div class="rail">
  {#each Array(count) as _, i}
    <div class="tile" aria-hidden="true">
      <div class="skeleton"></div>
      <div class="name" style="height:12px; background:#1a1a1e; border-radius:6px; margin-top:8px;"></div>
      <div class="artist" style="height:10px; background:#151519; border-radius:6px; margin-top:6px;"></div>
      <div class="actions" style="visibility:hidden;">
        <button class="btn primary">Diary</button>
        <button class="btn">Queue</button>
      </div>
    </div>
  {/each}
</div>