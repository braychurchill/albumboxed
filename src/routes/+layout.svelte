<script>
  import '../app.css';
  import BottomNav from '$lib/components/BottomNav.svelte';

  // Svelte 5 snippet for page content
  const { children } = $props();
</script>

<div class="topbar">
  <div class="topbar-inner container">
    <!-- Brand now navigates home -->
    <a class="brand" href="/" style="text-decoration:none; color:inherit;">AlbumBoxd</a>

    <div style="display:flex; gap:10px; align-items:center">
      <a class="tag" href="/account">Account</a>
      <a class="iconbtn" href="/search" aria-label="Search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </a>
    </div>
  </div>
</div>

<div class="container">
  {@render children()}
</div>

<!-- Sticky bottom tab bar -->
<BottomNav />