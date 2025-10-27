<script>
  import { goto } from '$app/navigation';
  function openSearch() { goto('/search'); }
</script>

<header class="app-header">
  <div class="title">AlbumBoxed</div>
  <button class="icon-btn" aria-label="Search" onclick={openSearch}>🔍</button>
</header>

<style>
  .app-header {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; justify-content: space-between;
    padding: .75rem 1rem;
    background: #0d0d0d; border-bottom: 1px solid #222; color: #fff;
  }
  .title { font-weight: 600; letter-spacing: .3px; }
  .icon-btn { background: none; border: 0; color: #fff; font-size: 1.25rem; cursor: pointer; }
</style>