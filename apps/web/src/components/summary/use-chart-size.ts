import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { DEFAULT_SIZE, fitSize, type ChartSize } from './chart-geometry';

/**
 * The pixel size of the element `ref` goes on, kept current as it resizes
 * (the window, the rail, a phone turning). Before the browser has measured -
 * the server's render, and a test without layout - it is DEFAULT_SIZE.
 */
export function useChartSize<E extends HTMLElement>(): [
  RefObject<E | null>,
  ChartSize,
] {
  const ref = useRef<E>(null);
  const [size, setSize] = useState<ChartSize>(DEFAULT_SIZE);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || !('ResizeObserver' in globalThis)) return;
    const measure = () => {
      const fitted = fitSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
      if (fitted === null) return;
      setSize((was) =>
        was.width === fitted.width && was.height === fitted.height
          ? was
          : fitted,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, size];
}
