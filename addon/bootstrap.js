/* eslint-disable no-undef */
var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);

  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  const ctx = {
    rootURI,
  };

  Services.scriptloader.loadSubScript(
    `${rootURI}content/scripts/__addonRef__.js`,
    ctx
  );
}

function onMainWindowLoad({ window }) {
  Zotero.__addonInstance__.hooks.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }) {
  Zotero.__addonInstance__.hooks.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  if (typeof Zotero === "undefined") {
    Zotero = Components.classes["@mozilla.org/zotero;1"].getService(
      Components.interfaces.nsISupports
    ).wrappedJSObject;
  }
  if (Zotero.__addonInstance__) {
    Zotero.__addonInstance__.hooks.onShutdown();
  }
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}
