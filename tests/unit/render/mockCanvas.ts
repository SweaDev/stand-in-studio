/**
 * A recording stand-in for CanvasRenderingContext2D so drawing code can run under Node.
 * Every method call is logged; property assignments are kept.
 */
export interface Recorded {
  ctx: CanvasRenderingContext2D;
  calls: { name: string; args: unknown[] }[];
}

export function mockCanvas(): Recorded {
  const calls: { name: string; args: unknown[] }[] = [];
  const props: Record<string | symbol, unknown> = { globalAlpha: 1, filter: 'none' };
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy(
    {},
    {
      get(_t, key) {
        if (key in props) return props[key];
        return (...args: unknown[]) => {
          calls.push({ name: String(key), args });
          if (key === 'createRadialGradient' || key === 'createLinearGradient') return gradient;
          if (key === 'measureText') return { width: String(args[0] ?? '').length * 7 };
          return undefined;
        };
      },
      set(_t, key, value) {
        props[key] = value;
        calls.push({ name: `set:${String(key)}`, args: [value] });
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
}
