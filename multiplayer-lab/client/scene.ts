import Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH, OBSTACLES, PLAYER_RADIUS } from '../shared/config.js';
import { GRID_SIZE } from './config.js';
import type { NetworkSnapshot, RenderPlayer } from './network.js';

interface PlayerView {
  body: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  shadow: Phaser.GameObjects.Ellipse;
}

export class LabScene extends Phaser.Scene {
  private readonly playerViews = new Map<string, PlayerView>();
  private placeholder?: Phaser.GameObjects.Text;

  constructor(private readonly onFrame: (now: number, delta: number) => NetworkSnapshot | null) {
    super('MultiplayerLab');
  }

  create(): void {
    const grid = this.add.graphics();
    grid.fillStyle(0xf2f5ec).fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    grid.lineStyle(1, 0xdde6d8, 0.9);
    for (let x = 0; x <= MAP_WIDTH; x += GRID_SIZE) grid.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += GRID_SIZE) grid.lineBetween(0, y, MAP_WIDTH, y);
    grid.lineStyle(4, 0xbed0b9).strokeRect(2, 2, MAP_WIDTH - 4, MAP_HEIGHT - 4);
    OBSTACLES.forEach((obstacle, index) => {
      const { x, y, width, height } = obstacle;
      grid.fillStyle(0xb7c6b1, 0.4).fillRoundedRect(x + 4, y + 5, width, height, 5);
      grid.fillStyle(0x8ca68b).fillRoundedRect(x, y, width, height, 5);
      grid.lineStyle(2, 0x718b70).strokeRoundedRect(x, y, width, height, 5);
      this.add.text(x + 10, y + 9, `BLOCK 0${index + 1}`, { fontFamily: 'monospace', fontSize: '11px', color: '#f2f5ec' });
    });
    this.add.text(24, MAP_HEIGHT - 28, '960 × 640  /  COLLISION TEST FIELD', { fontFamily: 'monospace', fontSize: '11px', color: '#738672' });
    this.placeholder = this.add.text(MAP_WIDTH / 2, MAP_HEIGHT / 2 - 42, '방에 연결하면 테스트가 시작됩니다', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#385e4d', backgroundColor: '#f2f5ecd9', padding: { x: 18, y: 12 },
    }).setOrigin(0.5).setDepth(10);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.playerViews.clear());
  }

  update(now: number, delta: number): void {
    const snapshot = this.onFrame(now, delta);
    if (!snapshot) return;
    this.placeholder?.setVisible(snapshot.players.length === 0);
    const present = new Set(snapshot.players.map((player) => player.id));
    for (const [id, view] of this.playerViews) {
      if (!present.has(id)) {
        view.body.destroy(); view.ring.destroy(); view.label.destroy(); view.shadow.destroy();
        this.playerViews.delete(id);
      }
    }
    for (const player of snapshot.players) this.drawPlayer(player);
  }

  private drawPlayer(player: RenderPlayer): void {
    let view = this.playerViews.get(player.id);
    if (!view) {
      const color = Phaser.Display.Color.HexStringToColor(player.color).color;
      view = {
        shadow: this.add.ellipse(0, 0, PLAYER_RADIUS * 2.4, PLAYER_RADIUS, 0x244b3c, 0.15),
        ring: this.add.circle(0, 0, PLAYER_RADIUS + 5).setStrokeStyle(2, 0x254c3c, 0.8),
        body: this.add.circle(0, 0, PLAYER_RADIUS, color).setStrokeStyle(2, 0xffffff),
        label: this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#1e4034', backgroundColor: '#f2f5ecdf', padding: { x: 5, y: 2 } }).setOrigin(0.5, 1),
      };
      this.playerViews.set(player.id, view);
    }
    view.body.setPosition(player.x, player.y).setAlpha(player.connected ? 1 : 0.4).setDepth(10 + player.y / MAP_HEIGHT);
    view.shadow.setPosition(player.x, player.y + PLAYER_RADIUS).setDepth(5);
    view.ring.setPosition(player.x, player.y).setVisible(player.local).setDepth(9);
    view.label.setPosition(player.x, player.y - PLAYER_RADIUS - 7).setText(`${player.nickname}${player.local ? ' · 나' : ''}${player.connected ? '' : ' · 재연결 중'}`).setDepth(20);
  }
}

export function createRenderer(onFrame: (now: number, delta: number) => NetworkSnapshot | null): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'arena',
    width: MAP_WIDTH, height: MAP_HEIGHT,
    backgroundColor: '#f2f5ec',
    antialias: true,
    banner: false,
    input: { keyboard: false, mouse: false, touch: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 60, smoothStep: false },
    scene: new LabScene(onFrame),
  });
}
