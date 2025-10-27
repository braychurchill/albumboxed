<script>
// @ts-check
import { onMount } from 'svelte';
import { auth, ensureAuth, refreshAuth, setLoggedOut } from '$lib/stores/auth.js';
import NowSpinning from '$lib/components/NowSpinning.svelte';
import spotifyLogo from '$lib/images/spotify.png';
import Button from '$lib/components/ui/Button.svelte';

let loggedIn = $state(false);
/** @type {any} */
let profile  = $state(null);
let loading  = $state(true);
let error    = $state('');

// subscribe to the shared auth store
$effect(() => {
  const unsub = auth.subscribe((a) => {
    loggedIn = a.loggedIn;
    profile  = a.profile;
    loading  = a.loading;
    error    = a.error ?? '';
  });
  return () => unsub?.();
});

onMount(async () => {
  await ensureAuth(); // uses cache if fresh
});

// --- actions ---
function connectSpotify() { window.location.href = '/api/spotify/login'; }
async function disconnectSpotify() {
  try {
    const r = await fetch('/api/spotify/disconnect', { method: 'POST' });
    // Optional: console.log(await r.json()); // see before/after in devtools
  } finally {
    // ensure UI store is reset *and* no stale caches remain
    // (If you have setLoggedOut(), you can call it, then reload.)
    location.href = '/account';
  }
}
async function handleRefresh() { await refreshAuth(); }
</script>

<!-- HERO / PROFILE STRIP -->
<section class="account-hero">
  <h1 class="title">Profile</h1>
  <NowSpinning />
</section>

<!-- MAIN BODY -->
<section class="account-body">
  <!-- Spotify connection card -->
  {#if loading}
    <div class="card">
      <p class="placeholder" style="opacity:.85">Checking your Spotify connection…</p>
    </div>
  {:else}
    <div class="card">
      <div class="card-head" style="justify-content:flex-start; gap:10px;">
        <img class="spotify-logo" src={spotifyLogo} alt="Spotify" />
        {#if profile?.images?.[0]?.url}
          <img class="avatar" src={profile.images[0].url} alt="avatar" />
        {/if}
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      {#if loggedIn}
        <p class="muted">
          Connected {#if profile?.display_name} as <strong>{profile.display_name}</strong>{/if}.
        </p>

        <div class="buttons">
          <Button variant="secondary" size="md" on:click={handleRefresh}>Refresh</Button>
          <Button variant="ghost" size="md" on:click={disconnectSpotify}>Disconnect</Button>
        </div>
      {:else}
        <p class="muted">Not connected.</p>
        <Button variant="primary" size="md" on:click={connectSpotify}>Connect Spotify</Button>
      {/if}
    </div>
  {/if}
</section>

<style>
  :root{
    --panel: rgba(255,255,255,0.04);
    --line: rgba(255,255,255,0.10);
    --radius: 14px;
    --text: #eaeaea;
    --muted: #a9acb2;
  }

  .title { margin: 0; font-size: 1.25rem; }

  .account-hero{ padding: 8px 12px 0; display: grid; gap: 8px; }

  .account-body{
    padding: 12px; display:grid; gap:12px;
    padding-bottom: 90px; /* space for bottom nav */
  }

  .card{
    border:1px solid var(--line); border-radius: var(--radius); background: var(--panel);
    padding:12px;
  }
  .card-head{
    display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;
  }
  .spotify-logo { height: 22px; width: auto; opacity: 0.9; }
  .avatar{ width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--line); }

  .muted{ color: var(--muted); margin: 0 0 10px; }
  .error{ color: #ff6b6b; margin: 0 0 8px; }

  .buttons{ display:flex; gap:8px; flex-wrap: wrap; }
</style>