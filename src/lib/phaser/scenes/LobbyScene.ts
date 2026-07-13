import Phaser from 'phaser';
import type { RoomState } from '$lib/parlor/types';

const SEAT_POSITIONS = [
  { x: 0.5, y: 0.82 },  // seat 1: bottom (you)
  { x: 0.82, y: 0.5 },  // seat 2: right
  { x: 0.5, y: 0.18 },  // seat 3: top
  { x: 0.18, y: 0.5 },  // seat 4: left
];
const TEAMS = ['A', 'B', 'A', 'B'];

export class LobbyScene extends Phaser.Scene {
  private seatTexts: Phaser.GameObjects.Text[] = [];
  private seatBtns: Phaser.GameObjects.Rectangle[] = [];
  private startBtn: Phaser.GameObjects.Container | null = null;
  private state: RoomState | null = null;
  private mySeat: number | null = null;

  constructor() { super({ key: 'LobbyScene' }); }

  create() {
    const W = this.scale.width, H = this.scale.height;

    const g = this.add.graphics();
    g.fillStyle(0x1a4a1a, 0.7);
    g.fillEllipse(W / 2, H / 2, W * 0.55, H * 0.55);

    this.add.text(W / 2, H * 0.05, 'PARLOR — Deberts', {
      color: '#f5deb3', fontSize: '28px', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.11, `Share: ${window.location.href}`, {
      color: '#ccc', fontSize: '14px',
    }).setOrigin(0.5);

    for (let i = 0; i < 4; i++) {
      const sx = SEAT_POSITIONS[i].x * W;
      const sy = SEAT_POSITIONS[i].y * H;
      const rect = this.add.rectangle(sx, sy, 160, 60, 0x000000, 0.5)
        .setStrokeStyle(2, 0xf5deb3).setInteractive({ cursor: 'pointer' });
      rect.on('pointerdown', () => {
        if (!this.mySeat) {
          const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('parlor:name') : null;
          const name = saved ?? prompt('Your name?') ?? 'Player';
          try { localStorage.setItem('parlor:name', name); } catch {}
          this.game.registry.get('send')({ type: 'TAKE_SEAT', seat: i + 1, name });
        }
      });
      this.seatBtns.push(rect);
      const t = this.add.text(sx, sy, `Seat ${i + 1}\nTeam ${TEAMS[i]}\n(empty)`, {
        color: '#fff', fontSize: '13px', align: 'center',
      }).setOrigin(0.5);
      this.seatTexts.push(t);
    }

    this.game.events.on('stateUpdate', this.onState, this);
  }

  private autoSeated = false;

  private onState(state: RoomState, mySeat: number | null) {
    this.state = state;
    this.mySeat = mySeat;

    // Auto-seat first arrival in an empty room
    if (!this.autoSeated && !mySeat && state.players.length === 0) {
      this.autoSeated = true;
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('parlor:name') : null;
      const name = saved ?? prompt('Your name?') ?? 'Host';
      try { localStorage.setItem('parlor:name', name); } catch {}
      this.game.registry.get('send')({ type: 'TAKE_SEAT', seat: 1, name });
      return;
    }

    for (let i = 0; i < 4; i++) {
      const player = state.players.find(p => p.seat === i + 1);
      this.seatTexts[i].setText(
        player
          ? `${player.name}\nTeam ${TEAMS[i]}${player.id === state.hostId ? '\n👑 host' : ''}`
          : `Seat ${i + 1}\nTeam ${TEAMS[i]}\n(empty)`
      );
      this.seatBtns[i].setFillStyle(player ? 0x1a4a3a : 0x000000, 0.5);
    }

    const myPlayer = mySeat ? state.players.find(p => p.seat === mySeat) : null;
    const isHost = myPlayer?.id === state.hostId;
    this.updateStartButton(state, isHost);

    if (state.phase !== 'lobby') {
      this.game.events.off('stateUpdate', this.onState, this);
      this.scene.start('GameScene');
    }
  }

  private updateStartButton(state: RoomState, isHost: boolean) {
    this.startBtn?.destroy();
    this.startBtn = null;
    if (!isHost) return;
    const W = this.scale.width, H = this.scale.height;
    const canStart = state.players.length >= 2;
    const bg = this.add.rectangle(0, 0, 200, 50, canStart ? 0x2d6a2d : 0x555555, 0.9)
      .setStrokeStyle(2, 0xf5deb3);
    const label = this.add.text(0, 0, canStart ? 'START GAME' : `Waiting (${state.players.length}/4)`, {
      color: '#fff', fontSize: '16px',
    }).setOrigin(0.5);
    this.startBtn = this.add.container(W / 2, H * 0.92, [bg, label]);
    if (canStart) {
      bg.setInteractive({ cursor: 'pointer' });
      bg.on('pointerdown', () => this.game.registry.get('send')({ type: 'START_GAME' }));
    }
  }

  shutdown() { this.game.events.off('stateUpdate', this.onState, this); }
}
