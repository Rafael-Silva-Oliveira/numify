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

/**
 * Called when the Numify preferences pane loads.
 * Manually syncs the UI controls with the stored pref values,
 * and binds change events to write back to prefs immediately.
 * This is needed because html:input doesn't support preference= binding
 * and XUL textbox type=number binding can be unreliable.
 */
function onPrefsLoad(window: Window) {
  const doc = window.document;

  // --- maxDepth ---
  const depthInput = doc.getElementById("numify-maxDepth") as any;
  if (depthInput) {
    const stored = Zotero.Prefs.get("numify.maxDepth");
    depthInput.value = String(typeof stored === "number" ? stored : 6);

    // "input" fires on every keystroke/spin; "change" fires on blur
    const saveDepth = () => {
      const val = parseInt(depthInput.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 20) {
        Zotero.Prefs.set("numify.maxDepth", val);
      }
    };
    depthInput.addEventListener("input", saveDepth);
    depthInput.addEventListener("change", saveDepth);
  }

  // --- separator ---
  const sepList = doc.getElementById("numify-separator") as any;
  if (sepList) {
    const stored = Zotero.Prefs.get("numify.separator");
    const sep = typeof stored === "string" ? stored : " ";
    // Set the selected item by matching value
    const items = sepList.querySelectorAll("menuitem");
    for (const item of items) {
      if (item.getAttribute("value") === sep) {
        sepList.selectedItem = item;
        break;
      }
    }

    sepList.addEventListener("command", () => {
      const val = sepList.value;
      if (val) {
        Zotero.Prefs.set("numify.separator", val);
      }
    });
  }
}

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onPrefsLoad,
};
