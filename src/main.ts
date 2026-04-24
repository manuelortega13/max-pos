import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// iOS Safari intentionally ignores `user-scalable=no` / `maximum-scale=1`
// in the viewport meta since iOS 10 — Apple treats pinch-zoom as an
// accessibility feature. The only reliable way to block it in a POS
// where zoom is a bug (misaligned cart UI, miss-tapped buttons) is to
// cancel the non-standard `gesture*` events the touch engine fires
// during a pinch. Also block two-finger touchmove as a belt-and-braces
// measure — some WebKit versions fire the gesture events *after* the
// first few pixels of pinch have already visually zoomed.
const blockZoom = (e: Event): void => {
  e.preventDefault();
};
document.addEventListener('gesturestart', blockZoom);
document.addEventListener('gesturechange', blockZoom);
document.addEventListener('gestureend', blockZoom);
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
