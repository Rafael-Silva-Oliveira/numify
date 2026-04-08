import {
  registerCollectionObserver,
  unregisterCollectionObserver,
  registerPrefObservers,
  unregisterPrefObservers,
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

  // Register the preferences pane in Zotero Settings
  const addon = getAddon();
  const rootURI = addon.data.rootURI;
  await Zotero.PreferencePanes.register({
    pluginID: "numify@zotero-plugin.dev",
    src: rootURI + "content/preferences.xhtml",
    label: "Numify",
    image: `chrome://numify/content/icons/favicon@0.5x.png`,
    scripts: [rootURI + "content/preferences.js"],
  });

  // Build initial caches from all existing collections
  buildCaches();

  // Register collection observer
  registerCollectionObserver();

  // Register pref observers so separator/maxDepth changes renumber immediately
  registerPrefObservers();

  addon.data.initialized = true;

  Zotero.debug("[Numify] Started successfully");
}

function onMainWindowLoad(_window: Window) {
  // No additional UI
}

function onMainWindowUnload(_window: Window) {
  // No additional UI to clean up
}

function onShutdown() {
  Zotero.debug("[Numify] Shutting down...");

  unregisterCollectionObserver();
  unregisterPrefObservers();

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
