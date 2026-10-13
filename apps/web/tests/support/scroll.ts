import { vi } from 'vitest';

// jsdom lays nothing out and has no scrollTo: a strip's sizes are stubbed,
// and scrollTo writes scrollLeft at once, as behavior 'instant' does.

/** The sizes every element reports; change it before rendering. */
export const stubbedSize = { scrollWidth: 0, clientWidth: 0 };

/** Call in beforeEach; vi.restoreAllMocks() in afterEach undoes the sizes. */
export function stubScrolling(): void {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    () => stubbedSize.scrollWidth,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => stubbedSize.clientWidth,
  );
  HTMLElement.prototype.scrollTo = function scrollTo(
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === 'object' && options.left !== undefined) {
      this.scrollLeft = options.left;
    }
  };
}

/** One animation frame, inside act. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
