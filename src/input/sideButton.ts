export type PenSample = {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerleave';
  pointerId: number;
  pointerType: string;
  buttons: number;
  pressure: number;
  t: number;
};

const MAX_CLICK_MS = 600;
const DOUBLE_MS = 400;

/** Detects S Pen side-button clicks reported on the hover pointer (buttons 0->1, pressure 0). */
export class SideButtonDetector {
  private pressId: number | null = null;
  private pressStart = 0;
  private firstReleaseT: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private onGesture: (g: 'single' | 'double') => void) {}

  handle(s: PenSample): void {
    const isHover = s.pointerType === 'pen' && s.pressure === 0;

    if (s.pressure > 0) {
      this.pressId = null; // tip contact mid-press cancels
      return;
    }
    if (s.type === 'pointerleave' || s.type === 'pointercancel') {
      if (s.pointerId === this.pressId) this.pressId = null;
      return;
    }
    if (!isHover) return;

    const down = (s.buttons & 1) === 1;
    if (this.pressId === null) {
      if (down) {
        this.pressId = s.pointerId;
        this.pressStart = s.t;
      }
      return;
    }
    if (s.pointerId !== this.pressId || down) return;

    // release of the pressed hover pointer
    const dur = s.t - this.pressStart;
    this.pressId = null;
    if (dur > MAX_CLICK_MS) return;
    this.registerClick(s.t);
  }

  private registerClick(t: number): void {
    if (this.timer !== null && this.firstReleaseT !== null && t - this.firstReleaseT <= DOUBLE_MS) {
      clearTimeout(this.timer);
      this.timer = null;
      this.firstReleaseT = null;
      this.onGesture('double');
      return;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.firstReleaseT = t;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.firstReleaseT = null;
      this.onGesture('single');
    }, DOUBLE_MS);
  }
}
