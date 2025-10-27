<script>
// @ts-check
import { createEventDispatcher } from 'svelte';

const {
  variant = 'primary',
  size = 'md',
  href = '',
  loading = false,
  disabled = false,
  class: className = '',
  children
} = $props();

const dispatch = createEventDispatcher();
</script>

{#if href}
  <a
    class={`btn v-${variant} s-${size} ${className}`}
    aria-disabled={disabled || loading}
    href={disabled || loading ? undefined : href}
    onclick={(e) => {
      if (disabled || loading) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      dispatch('click', e); // forward to parent usage (on:click=…)
    }}
    data-loading={loading}
  >
    {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
    {@render children?.()}
  </a>
{:else}
  <button
    class={`btn v-${variant} s-${size} ${className}`}
    disabled={disabled || loading}
    onclick={(e) => {
      if (disabled || loading) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      dispatch('click', e); // forward to parent usage (on:click=…)
    }}
    data-loading={loading}
  >
    {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
    {@render children?.()}
  </button>
{/if}