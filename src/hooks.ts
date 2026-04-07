import {
  registerCollectionObserver,
  unregisterCollectionObserver,
  buildCaches,
} from "./modules/observer";

function getAddon() {
  return (Zotero as any).Numify;
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  Zotero.debug("[Numify] Starting up...");

  // Build initial caches from all existing collections
  buildCaches();

  // Register collection observer
  registerCollectionObserver();

  const addon = getAddon();
  addon.data.initialized = true;

  Zotero.debug("[Numify] Started successfully");
}

function onMainWindowLoad(_window: Window) {
  // No UI to register
}

function onMainWindowUnload(_window: Window) {
  // No UI to clean up
}

function onShutdown() {
  Zotero.debug("[Numify] Shutting down...");

  unregisterCollectionObserver();

  const addon = getAddon();
  if (addon) {
    addon.data.parentCache.clear();
    addon.data.nameCache.clear();
    addon.data.initialized = false;
  }

  delete (Zotero as any).Numify;

  Zotero.debug("[Numify] Shut down");
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
};
