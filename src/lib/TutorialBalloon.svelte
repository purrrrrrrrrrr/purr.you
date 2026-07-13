<script lang="ts">
  let { message }: { message: string } = $props();
</script>

<div class="balloon">
  <p>{message}</p>
  <span class="tail"></span>
</div>

<style>
  .balloon {
    position: fixed;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%) scale(1);
    max-width: 380px;
    background: rgba(10, 10, 10, 0.88);
    border: 1.5px solid #c9a84c;
    border-radius: 12px;
    padding: 12px 18px;
    color: #f5deb3;
    font-size: 15px;
    line-height: 1.5;
    pointer-events: none;
    animation: popin 0.2s ease-out;
    z-index: 100;
  }
  p { margin: 0; }
  .tail {
    display: block;
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 10px solid #c9a84c;
  }
  @keyframes popin {
    from { transform: translateX(-50%) scale(0.8); opacity: 0; }
    to   { transform: translateX(-50%) scale(1);   opacity: 1; }
  }
</style>
