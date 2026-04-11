/* global Zotero */
"use strict";

const PREF_MAX_DEPTH = "extensions.zotero.numify.maxDepth";
const PREF_SEPARATOR = "extensions.zotero.numify.separator";
const PREF_PAD_ZERO = "extensions.zotero.numify.padZero";

(function initNumifyPrefs() {
  function setup() {
    const depthInput = document.getElementById("numify-maxDepth");
    const sepList = document.getElementById("numify-separator");
    const padZeroCheckbox = document.getElementById("numify-padZero");

    if (!depthInput || !sepList || !padZeroCheckbox) {
      window.setTimeout(setup, 50);
      return;
    }

    // --- maxDepth ---
    // Prefs may be returned as string or number depending on context
    const rawDepth = Zotero.Prefs.get(PREF_MAX_DEPTH, true);
    const storedDepth = parseInt(String(rawDepth), 10);
    depthInput.value = (!isNaN(storedDepth) && storedDepth >= 1) ? storedDepth : 6;

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

    // --- padZero ---
    const storedPadZero = Zotero.Prefs.get(PREF_PAD_ZERO, true);
    padZeroCheckbox.checked = storedPadZero === true;

    padZeroCheckbox.addEventListener("command", function () {
      Zotero.Prefs.set(PREF_PAD_ZERO, padZeroCheckbox.checked, true);
    });
  }

  setup();
})();
