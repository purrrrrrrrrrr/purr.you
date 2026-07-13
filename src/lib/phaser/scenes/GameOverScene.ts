import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data: { scores: [number, number] }) {
    this.registry.set('finalScores', data.scores ?? [0, 0]);
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const scores: [number, number] = this.registry.get('finalScores') ?? [0, 0];
    const winner = scores[0] >= 501 ? 'Team A' : 'Team B';

    this.add.text(W / 2, H * 0.35, `${winner} Wins!`, {
      color: '#ffd700', fontSize: '42px', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.48, `Team A: ${scores[0]} | Team B: ${scores[1]}`, {
      color: '#f5deb3', fontSize: '24px',
    }).setOrigin(0.5);

    const bg = this.add.rectangle(W / 2, H * 0.62, 220, 50, 0x2d5a2d, 0.9)
      .setStrokeStyle(2, 0xf5deb3).setInteractive({ cursor: 'pointer' });
    this.add.text(W / 2, H * 0.62, 'Play Again', { color: '#fff', fontSize: '20px' }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      this.game.registry.get('send')?.({ type: 'START_GAME' });
      this.scene.start('LobbyScene');
    });
  }
}
