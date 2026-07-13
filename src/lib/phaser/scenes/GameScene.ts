import Phaser from 'phaser';
import type { RoomState, Card, TrickCard } from '$lib/parlor/types';
import { getLegalCards } from '$lib/parlor/legalMoves';

const SEAT_POS = [
  { x: 0.5, y: 0.85 },  // seat 1: bottom
  { x: 0.88, y: 0.5 },  // seat 2: right
  { x: 0.5, y: 0.15 },  // seat 3: top
  { x: 0.12, y: 0.5 },  // seat 4: left
];
const TRICK_SLOTS = [
  { x: 0.5, y: 0.62 },
  { x: 0.62, y: 0.5 },
  { x: 0.5, y: 0.38 },
  { x: 0.38, y: 0.5 },
];
const SUIT_SYMBOLS: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const SUIT_COLORS: Record<string, string> = { clubs: '#111', diamonds: '#cc0000', hearts: '#cc0000', spades: '#111' };

const CARD_W = 52, CARD_H = 76;

export class GameScene extends Phaser.Scene {
  private state: RoomState | null = null;
  private myHand: Card[] = [];
  private mySeat: number | null = null;
  private handCards: Phaser.GameObjects.Container[] = [];
  private trickCards: (Phaser.GameObjects.Container | null)[] = [null, null, null, null];
  private trumpBadge: Phaser.GameObjects.Text | null = null;
  private bidPanel: Phaser.GameObjects.Container | null = null;
  private infoText: Phaser.GameObjects.Text | null = null;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    const W = this.scale.width, H = this.scale.height;

    const g = this.add.graphics();
    g.fillStyle(0x1a4a1a, 0.75);
    g.fillEllipse(W / 2, H / 2, W * 0.55, H * 0.55);

    this.infoText = this.add.text(W / 2, H * 0.05, '', {
      color: '#f5deb3', fontSize: '18px',
    }).setOrigin(0.5);

    this.trumpBadge = this.add.text(W - 20, 20, '', {
      color: '#ffd700', fontSize: '20px', backgroundColor: '#000000aa', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0);

    this.game.events.on('stateUpdate', this.onState, this);
    this.game.events.on('trickComplete', this.onTrickComplete, this);
  }

  // Draw a card as a container. faceDown = blue back rect.
  private makeCard(card: Card | null, scale = 1): Phaser.GameObjects.Container {
    const cw = CARD_W * scale, ch = CARD_H * scale;
    const g = this.add.graphics();
    if (!card) {
      g.fillStyle(0x1a3a8a).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 4 * scale);
      g.lineStyle(1, 0xffffff, 0.4).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 4 * scale);
    } else {
      g.fillStyle(0xffffff).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 4 * scale);
      g.lineStyle(1, 0x999999).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 4 * scale);
    }
    const container = this.add.container(0, 0, [g]);
    if (card) {
      const color = SUIT_COLORS[card.suit];
      const sym = SUIT_SYMBOLS[card.suit];
      const fs = Math.round(11 * scale);
      container.add(this.add.text(-cw / 2 + 3 * scale, -ch / 2 + 2 * scale, card.rank, { color, fontSize: `${fs}px`, fontStyle: 'bold' }));
      container.add(this.add.text(0, 0, sym, { color, fontSize: `${Math.round(16 * scale)}px` }).setOrigin(0.5));
      container.add(this.add.text(cw / 2 - 3 * scale, ch / 2 - 2 * scale, card.rank, { color, fontSize: `${fs}px`, fontStyle: 'bold' }).setOrigin(1, 1));
    }
    return container;
  }

  private onState(state: RoomState, mySeat: number | null, hand: Card[]) {
    const prevPhase = this.state?.phase;
    this.state = state;
    this.mySeat = mySeat;
    this.myHand = hand;

    this.trumpBadge?.setText(state.trumpSuit ? `Trump: ${SUIT_SYMBOLS[state.trumpSuit]} ${state.trumpSuit}` : '');

    const phaseLabel: Record<string, string> = {
      bidding: 'Bidding Phase',
      trump_select: 'Select Trump Suit',
      declaration: 'Declaration Phase',
      playing: 'Trick-Taking',
      round_end: 'Round End',
      game_over: 'Game Over',
    };
    this.infoText?.setText(phaseLabel[state.phase] ?? state.phase);

    if (state.phase === 'bidding' && prevPhase !== 'bidding') this.dealAnimation();
    if (state.phase === 'bidding') this.showBidPanel(state);
    if (state.phase === 'trump_select' && mySeat === state.bidWinner) this.showTrumpSelect();
    if (state.phase === 'declaration') this.showDeclarationUI(state, mySeat, hand);
    if (state.phase === 'playing') {
      this.hideBidPanel();
      this.renderHand(hand, state);
      this.renderTrick(state.currentTrick);
    }
    if (state.phase === 'round_end') this.showRoundEnd(state);
    if (state.phase === 'game_over') {
      this.game.events.off('stateUpdate', this.onState, this);
      this.scene.start('GameOverScene', { scores: state.scores });
    }
  }

  private dealAnimation() {
    const W = this.scale.width, H = this.scale.height;
    for (let seat = 1; seat <= 4; seat++) {
      const pos = SEAT_POS[seat - 1];
      for (let i = 0; i < 8; i++) {
        const card = this.makeCard(null, 0.7).setPosition(W / 2, H / 2);
        this.tweens.add({
          targets: card,
          x: pos.x * W + (Math.random() - 0.5) * 20,
          y: pos.y * H,
          delay: (seat - 1) * 80 + i * 30,
          duration: 300,
          ease: 'Power2',
          onComplete: () => card.destroy(),
        });
      }
    }
  }

  private renderHand(hand: Card[], state: RoomState) {
    this.handCards.forEach(c => c.destroy());
    this.handCards = [];
    if (!this.mySeat || !hand.length) return;
    const W = this.scale.width, H = this.scale.height;
    const n = hand.length;
    const spread = Math.min(60, 700 / n);
    const startX = W / 2 - (spread * (n - 1)) / 2;
    const baseY = H * 0.92;

    const legal = state.trumpSuit
      ? this.getLegalCards(hand, state.currentTrick, state.trumpSuit)
      : hand;
    const isMyTurn = this.isMyTurn(state);

    hand.forEach((card, i) => {
      const isLegal = legal.some(c => c.suit === card.suit && c.rank === card.rank);
      const container = this.makeCard(card).setPosition(startX + i * spread, baseY);
      container.setAlpha(isMyTurn && !isLegal ? 0.4 : 1);

      if (isMyTurn && isLegal) {
        // Make the background rect interactive
        const bg = container.getAt(0) as Phaser.GameObjects.Graphics;
        bg.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
        bg.input!.cursor = 'pointer';
        bg.on('pointerover', () => container.setY(baseY - 20));
        bg.on('pointerout', () => container.setY(baseY));
        bg.on('pointerdown', () => this.playCard(card, state));
        // Green tint indicator on the graphics
        const highlight = this.add.graphics();
        highlight.lineStyle(2, 0x44ff44).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 4);
        container.add(highlight);
      }
      this.handCards.push(container);
    });
  }

  private isMyTurn(state: RoomState): boolean {
    if (state.phase !== 'playing' || !this.mySeat) return false;
    if (state.currentTrick.length === 0) return this.mySeat === state.trickLeader;
    const last = state.currentTrick[state.currentTrick.length - 1];
    const seats = state.players.map(p => p.seat).sort((a, b) => a - b);
    const next = seats[(seats.indexOf(last.seat) + 1) % seats.length];
    return this.mySeat === next;
  }

  private playCard(card: Card, state: RoomState) {
    if (!this.isMyTurn(state)) return;
    this.game.registry.get('send')({ type: 'PLAY_CARD', card });
  }

  private renderTrick(trick: TrickCard[]) {
    const W = this.scale.width, H = this.scale.height;
    this.trickCards.forEach(c => c?.destroy());
    this.trickCards = [null, null, null, null];
    for (const tc of trick) {
      const pos = TRICK_SLOTS[tc.seat - 1];
      const container = this.makeCard(tc.card, 0.9).setPosition(pos.x * W, pos.y * H);
      this.trickCards[tc.seat - 1] = container;
    }
  }

  private onTrickComplete(winner: number, _cards: TrickCard[]) {
    const W = this.scale.width, H = this.scale.height;
    const winPos = SEAT_POS[winner - 1];
    this.trickCards.forEach(c => {
      if (!c) return;
      this.tweens.add({
        targets: c, x: winPos.x * W, y: winPos.y * H, alpha: 0,
        duration: 400, ease: 'Power2', onComplete: () => c.destroy(),
      });
    });
    this.trickCards = [null, null, null, null];
  }

  private showBidPanel(state: RoomState) {
    this.bidPanel?.destroy();
    this.bidPanel = null;
    if (!this.mySeat) return;
    const isMyTurn = this.mySeat === state.currentBidder;
    if (!isMyTurn) {
      const bidder = state.players.find(p => p.seat === state.currentBidder);
      this.infoText?.setText(`Bidding: ${bidder?.name ?? '?'}'s turn. Current: ${state.currentBid}`);
      return;
    }
    const W = this.scale.width, H = this.scale.height;
    const items: Phaser.GameObjects.GameObject[] = [];
    items.push(this.add.text(0, -40, `Your bid (current: ${state.currentBid})`, { color: '#fff', fontSize: '16px' }).setOrigin(0.5));
    items.push(...this.makeBidBtn(`Bid ${state.currentBid + 10}`, -90, 0, () =>
      this.game.registry.get('send')({ type: 'BID', amount: state.currentBid + 10 })));
    items.push(...this.makeBidBtn(`Bid ${state.currentBid + 20}`, 0, 0, () =>
      this.game.registry.get('send')({ type: 'BID', amount: state.currentBid + 20 })));
    items.push(...this.makeBidBtn('Pass', 90, 0, () =>
      this.game.registry.get('send')({ type: 'BID', amount: 'pass' }), 0x8b0000));
    this.bidPanel = this.add.container(W / 2, H * 0.5, items);
  }

  private makeBidBtn(label: string, x: number, y: number, cb: () => void, color = 0x2d5a2d): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, 100, 40, color, 0.9).setInteractive({ cursor: 'pointer' });
    const txt = this.add.text(x, y, label, { color: '#fff', fontSize: '14px' }).setOrigin(0.5);
    bg.on('pointerdown', cb);
    return [bg, txt];
  }

  private hideBidPanel() { this.bidPanel?.destroy(); this.bidPanel = null; }

  private showTrumpSelect() {
    const W = this.scale.width, H = this.scale.height;
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
    const colors: Record<string, number> = { clubs: 0x222222, diamonds: 0xaa0000, hearts: 0xaa0000, spades: 0x222222 };
    suits.forEach((suit, i) => {
      const x = W / 2 - 90 + i * 60;
      const bg = this.add.rectangle(x, H / 2, 50, 50, colors[suit], 0.9)
        .setStrokeStyle(2, 0xf5deb3).setInteractive({ cursor: 'pointer' });
      this.add.text(x, H / 2, SUIT_SYMBOLS[suit], { color: '#fff', fontSize: '24px' }).setOrigin(0.5);
      bg.on('pointerdown', () => {
        this.game.registry.get('send')({ type: 'SELECT_TRUMP', suit });
        bg.destroy();
      });
    });
  }

  private showDeclarationUI(state: RoomState, mySeat: number | null, _hand: Card[]) {
    if (!mySeat) return;
    if (state.declarationsDone.includes(mySeat)) return;
    const W = this.scale.width, H = this.scale.height;
    this.add.text(W / 2, H * 0.45, 'Declare your combinations (or pass)', {
      color: '#f5deb3', fontSize: '16px',
    }).setOrigin(0.5);
    const confirmBg = this.add.rectangle(W / 2, H * 0.52, 180, 40, 0x2d5a2d, 0.9)
      .setInteractive({ cursor: 'pointer' });
    this.add.text(W / 2, H * 0.52, 'Confirm (no declarations)', { color: '#fff', fontSize: '13px' }).setOrigin(0.5);
    confirmBg.on('pointerdown', () => {
      this.game.registry.get('send')({ type: 'DECLARE', declarations: [] });
      confirmBg.destroy();
    });
  }

  private showRoundEnd(state: RoomState) {
    const W = this.scale.width, H = this.scale.height;
    const result = state.lastRoundResult;
    const msg = result
      ? `Round end. Team A: ${result.teamAScore} | Team B: ${result.teamBScore}\n${result.bidMade ? 'Bid made!' : 'Bid failed!'}\nTotal — A: ${state.scores[0]} | B: ${state.scores[1]}`
      : 'Round ended';
    this.add.text(W / 2, H / 2, msg, {
      color: '#f5deb3', fontSize: '20px', align: 'center',
      backgroundColor: '#000000cc', padding: { x: 20, y: 15 },
    }).setOrigin(0.5);
    const btn = this.add.rectangle(W / 2, H * 0.65, 200, 44, 0x2d5a2d, 0.9)
      .setInteractive({ cursor: 'pointer' });
    this.add.text(W / 2, H * 0.65, 'Next Round', { color: '#fff', fontSize: '16px' }).setOrigin(0.5);
    btn.on('pointerdown', () => this.game.registry.get('send')({ type: 'START_NEXT_ROUND' }));
  }

  shutdown() {
    this.game.events.off('stateUpdate', this.onState, this);
    this.game.events.off('trickComplete', this.onTrickComplete, this);
  }
}
