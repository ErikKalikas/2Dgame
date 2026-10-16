import type { Renderer } from './gfx/renderer';

export interface Scene {
  update(dt: number): void;
  render(r: Renderer): void;
}

/** Глобальное состояние приложения: текущая сцена и рендерер */
export const app = {
  r: null as unknown as Renderer,
  scene: null as unknown as Scene,
  time: 0,
  setScene(s: Scene) {
    this.scene = s;
  },
};

export function applyFullscreen(on: boolean) {
  try {
    if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) void document.exitFullscreen();
  } catch {
    /* браузер может запретить без жеста пользователя */
  }
}

export const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
