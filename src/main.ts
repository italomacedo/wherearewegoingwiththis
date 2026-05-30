import { GameManager } from '@core/GameManager';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

if (!canvas) {
  throw new Error('Canvas element #game-canvas not found');
}

const game = GameManager.getInstance();
game.initialize(canvas);
game.start();
