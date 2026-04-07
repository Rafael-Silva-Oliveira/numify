import Addon from "./addon";

const addonInstance = "Numify";

if (!(Zotero as any)[addonInstance]) {
  const addon = new Addon();
  (Zotero as any)[addonInstance] = addon;
  addon.hooks.onStartup();
}
