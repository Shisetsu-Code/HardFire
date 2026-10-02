'use strict';

function isBrowserVisible(window) {
  if (!window || window.isDestroyed()) return false;
  return window.isVisible() && (process.platform !== 'win32' || window.getOpacity() > 0);
}

function setBrowserMode(window, mode) {
  if (!['visible', 'hidden'].includes(mode)) throw new Error('mode must be visible or hidden');
  if (!window || window.isDestroyed()) throw new Error('HardFire browser window is unavailable');
  if (mode === 'visible') {
    if (process.platform === 'win32') {
      window.setOpacity(1);
      window.setIgnoreMouseEvents(false);
      window.setFocusable(true);
      window.setSkipTaskbar(false);
    }
    window.hide();
    window.show();
  } else if (process.platform === 'win32') {
    // A fully hidden Windows WebContentsView has no capturable compositor
    // surface in Electron 44. Keep rendering without pixels, input or focus.
    window.setOpacity(0);
    window.setIgnoreMouseEvents(true);
    window.setFocusable(false);
    window.setSkipTaskbar(true);
    window.showInactive();
  } else {
    window.hide();
  }
  return { visible: isBrowserVisible(window), mode };
}

module.exports = { isBrowserVisible, setBrowserMode };
