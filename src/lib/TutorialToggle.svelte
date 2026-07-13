<script lang="ts">
  let { enabled = $bindable(true) }: { enabled?: boolean } = $props();

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem('parlor:tutorial', String(enabled)); } catch {}
  }
</script>

<button class="toggle" onclick={toggle} title={enabled ? 'Hide hints' : 'Show hints'}>
  {enabled ? '?' : '?'}
</button>

<style>
  .toggle {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 200;
    background: rgba(0,0,0,0.6);
    border: 1.5px solid #c9a84c;
    border-radius: 8px;
    color: #f5deb3;
    font-size: 20px;
    padding: 6px 10px;
    cursor: pointer;
  }
</style>
