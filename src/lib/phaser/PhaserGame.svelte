<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Parlor } from '$lib/parlor/partykit.svelte';

  let { parlor }: { parlor: Parlor } = $props();

  let container: HTMLDivElement;
  let game: import('phaser').Game | null = null;

  onMount(async () => {
    const Phaser = await import('phaser');
    const { LobbyScene } = await import('./scenes/LobbyScene');
    const { GameScene } = await import('./scenes/GameScene');
    const { GameOverScene } = await import('./scenes/GameOverScene');

    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 'transparent',
      transparent: true,
      parent: container,
      scene: [LobbyScene, GameScene, GameOverScene],
    });

    $effect(() => {
      if (parlor.state && game) {
        game.events.emit('stateUpdate', parlor.state, parlor.mySeat, parlor.myHand);
      }
    });

    game.registry.set('send', (msg: any) => parlor.send(msg));
    game.registry.set('getSeat', () => parlor.mySeat);

    parlor.onTrickComplete = (winner, cards) => {
      game?.events.emit('trickComplete', winner, cards);
    };

    const onResize = () => {
      game?.scale.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  onDestroy(() => { game?.destroy(true); game = null; });
</script>

<div bind:this={container} style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>
