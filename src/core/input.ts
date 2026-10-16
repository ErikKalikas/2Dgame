// Клавиатурный ввод. Хранит нажатые клавиши по event.code (не зависит от раскладки).

export const ACTIONS = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  shootUp: ['ArrowUp'],
  shootDown: ['ArrowDown'],
  shootLeft: ['ArrowLeft'],
  shootRight: ['ArrowRight'],
  focus: ['ShiftLeft', 'ShiftRight'],
  dash: ['Space'],
  interact: ['KeyE'],
  bomb: ['KeyF'],
  active: ['KeyQ'],
  pause: ['Escape'],
  restart: ['KeyP'],
  // меню
  menuUp: ['ArrowUp', 'KeyW'],
  menuDown: ['ArrowDown', 'KeyS'],
  menuLeft: ['ArrowLeft', 'KeyA'],
  menuRight: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space', 'KeyE'],
  back: ['Escape', 'Backspace'],
} as const;

export type Action = keyof typeof ACTIONS;

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace']);

class Input {
  private down = new Set<string>();
  private pressedNow = new Set<string>();
  private repeatNow = new Set<string>();
  /** Символы, набранные за кадр (для ввода seed) */
  typed: string[] = [];

  attach(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.down.add(e.code);
        this.pressedNow.add(e.code);
      }
      this.repeatNow.add(e.code);
      if (e.key.length === 1) this.typed.push(e.key);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Вызывается в конце каждого шага логики */
  endFrame() {
    this.pressedNow.clear();
    this.repeatNow.clear();
    this.typed.length = 0;
  }

  isDown(a: Action): boolean {
    for (const c of ACTIONS[a]) if (this.down.has(c)) return true;
    return false;
  }

  pressed(a: Action): boolean {
    for (const c of ACTIONS[a]) if (this.pressedNow.has(c)) return true;
    return false;
  }

  /** Нажатие с автоповтором (для навигации по меню) */
  repeat(a: Action): boolean {
    for (const c of ACTIONS[a]) if (this.repeatNow.has(c)) return true;
    return false;
  }

  codePressed(code: string): boolean {
    return this.pressedNow.has(code);
  }

  codeRepeat(code: string): boolean {
    return this.repeatNow.has(code);
  }

  /** Тестовый хук: эмулировать нажатие клавиши */
  simulate(code: string, isDown: boolean) {
    if (isDown) {
      if (!this.down.has(code)) this.pressedNow.add(code);
      this.down.add(code);
      this.repeatNow.add(code);
    } else this.down.delete(code);
  }
}

export const input = new Input();
