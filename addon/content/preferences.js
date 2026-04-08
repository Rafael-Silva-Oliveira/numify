/* global Zotero */
"use strict";

// This script is loaded into the Zotero preferences window context via the
// scripts[] option of PreferencePanes.register(). In this context, Zotero
// and document are fully available.

(function initNumifyPrefs() {
  // The pane fragment may not be rendered yet when this script first runs,
  // so we poll until the elements exist.
  function setup() {
    const depthInput = document.getElementById("numify-maxDepth");
    const sepList = document.getElementById("numify-separator");

    if (!depthInput || !sepList) {
      // Pane not yet inserted — retry on next tick
      window.setTimeout(setup, 50);
      return;
    }

    // --- maxDepth: read and populate ---
    const storedDepth = Zotero.Prefs.get("numify.maxDepth");
    depthInput.value = (typeof storedDepth === "number" && storedDepth >= 1)
      ? storedDepth
      : 6;

    const saveDepth = function () {
      const val = parseInt(depthInput.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 20) {
        Zotero.Prefs.set("numify.maxDepth", val);
      }
    };
    depthInput.addEventListener("input", saveDepth);
    depthInput.addEventListener("change", saveDepth);

    // --- separator: read and select matching item ---
    const storedSep = Zotero.Prefs.get("numify.separator");
    const sep = (typeof storedSep === "string" && storedSep.length > 0)
      ? storedSep
      : " ";

    const items = sepList.querySelectorAll("menuitem");
    for (const item of items) {
      if (item.getAttribute("value") === sep) {
        sepList.selectedItem = item;
        break;
      }
    }

    sepList.addEventListener("command", function () {
      if (sepList.value) {
        Zotero.Prefs.set("numify.separator", sepList.value);
      }
    });
  }

  setup();
})();
