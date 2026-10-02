'use strict';

const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_DELAY_MS = 5000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function updaterSupported() {
  return (
    app.isPackaged &&
    process.platform === 'win32' &&
    !process.argv.includes('--smoke-test')
  );
}

function configureAutoUpdater(getMainWindow) {
  if (!updaterSupported()) {
    return {
      enabled: false,
      checkNow: async () => null,
      stop: () => {}
    };
  }

  let stopped = false;
  let checking = false;
  let promptOpen = false;
  let firstTimer = null;
  let interval = null;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.log('[HardFire] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(
      `[HardFire] Update ${info.version} available; downloading...`
    );
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log(
      `[HardFire] Up to date (${info.version}).`
    );
  });

  autoUpdater.on('error', (error) => {
    console.warn(
      '[HardFire] Auto-update error:',
      error?.message || error
    );
  });

  autoUpdater.on('update-downloaded', async (info) => {
    if (promptOpen || stopped) return;

    promptOpen = true;

    const options = {
      type: 'info',
      title: 'HardFire update',
      message: `HardFire ${info.version} is ready to install.`,
      detail:
        'Restart now to install it. If you choose Later, it will install automatically when HardFire exits.',
      buttons: ['Restart and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    };

    try {
      const window = getMainWindow?.();
      const result =
        window && !window.isDestroyed()
          ? await dialog.showMessageBox(window, options)
          : await dialog.showMessageBox(options);

      if (result.response === 0) {
        setImmediate(() => {
          autoUpdater.quitAndInstall(false, true);
        });
      }
    } catch (error) {
      console.warn(
        '[HardFire] Update prompt failed:',
        error?.message || error
      );
    } finally {
      promptOpen = false;
    }
  });

  async function checkNow() {
    if (stopped || checking) return null;

    checking = true;

    try {
      return await autoUpdater.checkForUpdates();
    } catch (error) {
      console.warn(
        '[HardFire] Update check failed:',
        error?.message || error
      );
      return null;
    } finally {
      checking = false;
    }
  }

  firstTimer = setTimeout(() => {
    void checkNow();
  }, CHECK_DELAY_MS);

  firstTimer.unref?.();

  interval = setInterval(() => {
    void checkNow();
  }, CHECK_INTERVAL_MS);

  interval.unref?.();

  return {
    enabled: true,
    checkNow,
    stop() {
      stopped = true;

      if (firstTimer) {
        clearTimeout(firstTimer);
        firstTimer = null;
      }

      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }
  };
}

module.exports = {
  configureAutoUpdater
};
