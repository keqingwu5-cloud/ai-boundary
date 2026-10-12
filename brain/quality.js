/* brain/quality.js — render-quality levels + the FPS watchdog. No three.js / DOM here; app.js applies the decisions.
   Levels: every device starts at 'mid' (laptops get a denser mid than phones, so the interior stays detailed);
   'high' only via ?q=high; bloom is an opt-in toggle (✨) on laptops. ?q=high|mid|low pins the level (tests). */
export const QPARAM = (/[?&]q=(high|mid|low)\b/.exec(location.search) || [])[1];
export function levels(coarse){
  return {
    high:{ fibers:700, sub:0.3, K:14, pulses:520, cloud:3000, layers:true },
    mid: coarse ? { fibers:240, sub:0.3, K:10, pulses:150, cloud:1000, layers:true }
                : { fibers:460, sub:0.3, K:12, pulses:320, cloud:2000, layers:true },
    low:{ fibers:110, sub:0.35, K:8, pulses:60, cloud:600, layers:false } };
}
export const initialLevel = () => QPARAM || 'mid';
/* targets: laptop ~60 fps, phone 30+. Measures 2 s windows (after a 2.5 s warm-up). Two slow windows in a row -> onSlow();
   four comfortable ones -> onFast(). The caller decides what to give up (bloom -> resolution -> level). */
export function createWatch({ coarse, onSlow, onFast, onFps }){
  const LOW = coarse ? 30 : 50, OK = coarse ? 50 : 58, s = { t0:0, n:0, slow:0, fast:0 };
  return {
    reset(){ s.t0 = 0; s.n = 0; },
    tick(now, hidden){
      if (!s.t0){ s.t0 = now + 2500; return; } if (now < s.t0) return;
      s.n++; const el = now - s.t0; if (el < 2000) return;
      const fps = s.n * 1000 / el; s.t0 = now; s.n = 0; onFps && onFps(fps);
      if (hidden || QPARAM) return;
      if (fps < LOW){ s.fast = 0; if (++s.slow >= 2){ s.slow = 0; onSlow(); } }
      else { s.slow = 0; if (fps > OK && ++s.fast >= 4){ s.fast = 0; onFast(); } }
    } };
}
