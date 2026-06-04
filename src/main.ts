import { GameManager } from '@core/GameManager';
import { SaveService } from '@systems/SaveService';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

if (!canvas) {
  throw new Error('Canvas element #game-canvas not found');
}

const game = GameManager.getInstance();
game.initialize(canvas);
// Hydrate saves from disk (Electron) before starting, so the Load Game screen
// sees them. init() never rejects; start regardless. The branding sequence runs
// long before the player can reach Load Game, so this never adds visible delay.
SaveService.init().finally(() => game.start());
