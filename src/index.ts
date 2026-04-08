import Addon from "./addon";

const addonInstance = "Numify";

if (!(Zotero as any)[addonInstance]) {
  const addon = new Addon();
  (Zotero as any)[addonInstance] = addon;
  // Capture rootURI from bootstrap script context
  addon.data.rootURI = (this as any).rootURI ?? "";
  addon.hooks.onStartup();
}
