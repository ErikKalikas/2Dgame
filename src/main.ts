import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/cyrillic-400.css';
import { app, applyFullscreen } from './app';
import { FONT, STEP } from './config';
import { registerContent } from './content';
import { input } from './core/input';
import { settings } from './core/storage';
import { Renderer } from './gfx/renderer';
import { initSprites } from './gfx/sprites';
import { MainMenu } from './scenes/main-menu';

async function boot() {
  const screen = document.getElementById('screen') as HTMLCanvasElement;
  app.r = new Renderer(screen);
  input.attach(window);
  registerContent();
  initSprites();
  try {
    await document.fonts.load(`8px ${FONT}`, 'АБВ ABC');
  } catch {
    /* шрифт подгрузится позже */
  }
  app.setScene(new MainMenu());
  if (settings.fullscreen) {
    // браузер разрешает полный экран только после действия пользователя
    window.addEventListener('keydown', () => applyFullscreen(true), { once: true });
  }

  // Фиксированный шаг логики 60 Гц, отрисовка — по кадрам браузера
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      app.time += STEP;
      app.scene.update(STEP);
      input.endFrame();
      acc -= STEP;
    }
    app.scene.render(app.r);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // хук для автотестов в браузере
  (window as unknown as { __game: typeof app }).__game = app;
}

void boot();
