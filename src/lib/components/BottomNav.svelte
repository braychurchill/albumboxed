<script>
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';

  let currentPath = $state('/');

  onMount(() => {
    if (typeof window !== 'undefined') currentPath = window.location.pathname;
    afterNavigate(({ to }) => {
      currentPath = to?.url?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    });
  });

  /** @param {string} path */
  function isActive(path) {
    const p = currentPath || '/';
    if (path === '/') return p === '/';
    return p.startsWith(path);
  }
</script>

<nav class="tabbar">
  <a class="tab {isActive('/') ? 'is-active' : ''}" href="/">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3 3 10h2v10h6v-6h2v6h6V10h2z"/></svg>
    <span>Discover</span>
  </a>

  <a class="tab {isActive('/diary') ? 'is-active' : ''}" href="/diary">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2z"/></svg>
    <span>Collection</span>
  </a>

  <a class="tab {isActive('/listenlist') ? 'is-active' : ''}" href="/listenlist">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 1-6.36 2.64L7.05 7.05A6 6 0 1 0 12 6v3l5-4-5-4v3z"/></svg>
    <span>Backlog</span>
  </a>

</nav>

<style>
  .tabbar{
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: grid; grid-template-columns: repeat(3,1fr);
    gap: 2px;
    padding: 10px 12px calc(env(safe-area-inset-bottom) + 10px);
    background: color-mix(in oklab, var(--bg), transparent 20%);
    backdrop-filter: saturate(140%) blur(10px);
    border-top: 1px solid var(--line);
  }
  .tab{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:6px; padding:8px 6px; border-radius: 10px; color: var(--muted); text-decoration:none;
    border: 1px solid transparent;
  }
  .tab.is-active{
    color: var(--text);
    border-color: var(--line);
    background: var(--panel);
  }
  .tab span{ font-size: .75rem; line-height: 1; }
</style>