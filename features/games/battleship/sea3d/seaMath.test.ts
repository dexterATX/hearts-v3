// sea3d · camera math tests — plain node, no RN (vitest.config.ts §2.9).
import { describe, expect, it } from 'vitest';
import { ZOOM_CLOSE, ZOOM_FAR } from './seaMotion';
import { cellCenter, clampPan, clampZoom, easeOutCubic, lerp, zoomForCloseup } from './seaMath';

describe('cellCenter', () => {
  it('puts cell 0,0 exactly half a cell in', () => {
    // 400 / 8 = 50 per cell, so the first center sits at 25.
    expect(cellCenter(0, 0, 400)).toEqual({ cx: 25, cy: 25 });
  });

  it('puts the last cell half a cell from the far edge', () => {
    expect(cellCenter(7, 7, 400)).toEqual({ cx: 375, cy: 375 });
  });

  it('scales with the board size', () => {
    // 800 / 8 = 100 per cell.
    expect(cellCenter(3, 2, 800)).toEqual({ cx: 350, cy: 250 });
  });
});

describe('clampPan', () => {
  it('pins the board at zoom 1 when it exactly fills the view', () => {
    // boardPx = 400 = view: no panning room, any pan snaps home.
    expect(clampPan(80, -140, 1, 400, 400, 400)).toEqual({ px: 0, py: 0 });
  });

  it('keeps the tall axis inside at zoom 1 when the view is shorter', () => {
    // boardPx = 400, viewH = 300: py ranges over [-100, 0].
    expect(clampPan(0, 50, 1, 400, 400, 300)).toEqual({ px: 0, py: 0 });
    expect(clampPan(0, -250, 1, 400, 400, 300)).toEqual({ px: 0, py: -100 });
    expect(clampPan(0, -60, 1, 400, 400, 300)).toEqual({ px: 0, py: -60 });
  });

  it('keeps every edge inside at close-up zoom', () => {
    // zoom 5.5 -> boardPx = 2200 in a 400 view: range [-1800, 0].
    const zoom = zoomForCloseup();
    expect(clampPan(120, 30, zoom, 400, 400, 400)).toEqual({ px: 0, py: 0 });
    expect(clampPan(-9999, -9999, zoom, 400, 400, 400)).toEqual({ px: -1800, py: -1800 });
    expect(clampPan(-900, -450, zoom, 400, 400, 400)).toEqual({ px: -900, py: -450 });

    // the invariant itself: left edge <= 0, right edge >= viewW.
    const clamped = clampPan(-5000, 700, zoom, 400, 400, 400);
    expect(clamped.px).toBeLessThanOrEqual(0);
    expect(clamped.px + 400 * zoom).toBeGreaterThanOrEqual(400);
    expect(clamped.py).toBeLessThanOrEqual(0);
    expect(clamped.py + 400 * zoom).toBeGreaterThanOrEqual(400);
  });

  it('centers a board smaller than the view', () => {
    expect(clampPan(30, -10, 1, 300, 400, 500)).toEqual({ px: 50, py: 100 });
  });
});

describe('clampZoom', () => {
  it('never goes wider than the whole sea', () => {
    expect(clampZoom(0.2)).toBe(ZOOM_FAR);
    expect(clampZoom(ZOOM_FAR)).toBe(ZOOM_FAR);
  });

  it('never goes closer than the close-up plus its half step', () => {
    expect(clampZoom(99)).toBe(ZOOM_CLOSE + 0.5);
  });

  it('leaves an in-between zoom alone', () => {
    expect(clampZoom(3.2)).toBe(3.2);
  });

  it('recovers from nonsense', () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_FAR);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_FAR);
  });
});

describe('zoomForCloseup', () => {
  it('is the pinned close-up zoom', () => {
    expect(zoomForCloseup()).toBe(ZOOM_CLOSE);
  });
});

describe('lerp', () => {
  it('hits both endpoints and the middle', () => {
    expect(lerp(4, 8, 0)).toBe(4);
    expect(lerp(4, 8, 1)).toBe(8);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('easeOutCubic', () => {
  it('hits its endpoints exactly', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('eases out: halfway in time is most of the way in value', () => {
    expect(easeOutCubic(0.5)).toBe(0.875);
  });
});
