/* global Zotero */
"use strict";

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

    Zotero.debug("[Numify prefs] DOM ready. Zotero=" + typeof Zotero);
    Zotero.debug("[Numify prefs] reading " + PREF_MAX_DEPTH);

    // Try both global=true and global=false to see which works
    const depthGlobal = Zotero.Prefs.get(PREF_MAX_DEPTH, true);
    const depthLocal  = Zotero.Prefs.get("numify.maxDepth", false);
    Zotero.debug("[Numify prefs] maxDepth global=" + JSON.stringify(depthGlobal) + " local=" + JSON.stringify(depthLocal));

    const storedDepth = (typeof depthGlobal === "number" && depthGlobal >= 1) ? depthGlobal
      : (typeof depthLocal === "number" && depthLocal >= 1) ? depthLocal
      : 6;
    depthInput.value = storedDepth;

    const saveDepth = function () {
      const val = parseInt(depthInput.value, 10);
      Zotero.debug("[Numify prefs] saveDepth called, val=" + val);
      if (!isNaN(val) && val >= 1 && val <= 20) {
        try {
          Zotero.Prefs.set(PREF_MAX_DEPTH, val, true);
          Zotero.debug("[Numify prefs] set global ok. readback=" + Zotero.Prefs.get(PREF_MAX_DEPTH, true));
        } catch(e) {
          Zotero.debug("[Numify prefs] set global FAILED: " + e);
          try {
            Zotero.Prefs.set("numify.maxDepth", val, false);
            Zotero.debug("[Numify prefs] set local ok. readback=" + Zotero.Prefs.get("numify.maxDepth", false));
          } catch(e2) {
            Zotero.debug("[Numify prefs] set local also FAILED: " + e2);
          }
        }
      }
    };
    depthInput.addEventListener("input", saveDepth);
    depthInput.addEventListener("change", saveDepth);

    // --- separator ---
    const sepGlobal = Zotero.Prefs.get(PREF_SEPARATOR, true);
    const sepLocal  = Zotero.Prefs.get("numify.separator", false);
    Zotero.debug("[Numify prefs] separator global=" + JSON.stringify(sepGlobal) + " local=" + JSON.stringify(sepLocal));

    const sep = (typeof sepGlobal === "string" && sepGlobal.length > 0) ? sepGlobal
      : (typeof sepLocal === "string" && sepLocal.length > 0) ? sepLocal
      : " ";

    const items = sepList.querySelectorAll("menuitem");
    for (const item of items) {
      if (item.getAttribute("value") === sep) {
        sepList.selectedItem = item;
        break;
      }
    }

    sepList.addEventListener("command", function () {
      const val = sepList.value;
      Zotero.debug("[Numify prefs] separator command, val=" + JSON.stringify(val));
      if (val) {
        try {
          Zotero.Prefs.set(PREF_SEPARATOR, val, true);
          Zotero.debug("[Numify prefs] sep set global ok. readback=" + JSON.stringify(Zotero.Prefs.get(PREF_SEPARATOR, true)));
        } catch(e) {
          Zotero.debug("[Numify prefs] sep set global FAILED: " + e);
          Zotero.Prefs.set("numify.separator", val, false);
        }
      }
    });
  }

  setup();
})();
