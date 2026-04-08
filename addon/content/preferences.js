/* global Zotero */
"use strict";

// Full pref keys — avoids any ambiguity with branch scoping
const PREF_MAX_DEPTH = "extensions.zotero.numify.maxDepth";
const PREF_SEPARATOR = "extensions.zotero.numify.separator";

(function initNumifyPrefs() {
  function setup() {
    const depthInput = document.getElementById("numify-maxDepth");
    const sepList = document.getElementById("numify-separator");

    if (!depthInput || !sepList) {
      window.setTimeout(setup, 50);
      return;
    }

    // --- maxDepth ---
    const storedDepth = Zotero.Prefs.get(PREF_MAX_DEPTH, true);
    depthInput.value = (typeof storedDepth === "number" && storedDepth >= 1)
      ? storedDepth
      : 6;

    const saveDepth = function () {
      const val = parseInt(depthInput.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 20) {
        Zotero.Prefs.set(PREF_MAX_DEPTH, val, true);
      }
    };
    depthInput.addEventListener("input", saveDepth);
    depthInput.addEventListener("change", saveDepth);

    // --- separator ---
    const storedSep = Zotero.Prefs.get(PREF_SEPARATOR, true);
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
        Zotero.Prefs.set(PREF_SEPARATOR, sepList.value, true);
      }
    });
  }

  setup();
})();
