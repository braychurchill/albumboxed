<script>
  import { onMount } from 'svelte';

  onMount(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    const state = q.get('state') ?? '';

    const verifier = sessionStorage.getItem('sp_pkce_verifier') || '';
    // Clear the temporary PKCE items
    sessionStorage.removeItem('sp_pkce_verifier');
    sessionStorage.removeItem('sp_state');

    if (!code || !verifier) {
      // bounce back with a simple flag; adjust if you want a nicer message
      window.location.replace('/account?auth=error');
      return;
    }

    const url = `/api/spotify/exchange?code=${encodeURIComponent(code)}&v=${encodeURIComponent(verifier)}&state=${encodeURIComponent(state)}`;
    window.location.replace(url);
  });
</script>

<p>Finishing Spotify sign-in…</p>