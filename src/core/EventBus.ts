export type EventHandler<T = unknown> = (data: T) => void;

export interface GameEvents {
  'scene:loaded': { sceneName: string };
  'scene:transition-start': { from: string; to: string };
  'scene:transition-end': { sceneName: string };
  'player:moved': { position: { x: number; y: number; z: number } };
  'player:action': { action: string };
  'npc:message': { npcId: string; message: string };
  'npc:response-chunk': { npcId: string; chunk: string };
  'npc:response-done': { npcId: string };
  'npc:player-nearby': { npcId: string; distance: number };
  'settings:changed': { key: string; value: unknown };
  'save:created': { saveId: string };
  'save:loaded': { saveId: string };
  'save:deleted': { saveId: string };
}

export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  on<K extends keyof GameEvents>(event: K, handler: EventHandler<GameEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: EventHandler<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler);
  }

  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    this.listeners.get(event)?.forEach((handler) => handler(data));
  }

  once<K extends keyof GameEvents>(event: K, handler: EventHandler<GameEvents[K]>): void {
    const unsubscribe = this.on(event, (data) => {
      handler(data);
      unsubscribe();
    });
  }

  clear(): void {
    this.listeners.clear();
  }

  listenerCount(event: keyof GameEvents): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
