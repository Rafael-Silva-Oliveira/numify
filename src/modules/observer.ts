/**
 * Notifier observer for Zotero collection events.
 * Listens for add, modify, and delete events and triggers renumbering.
 */

import {
  parseName,
  buildName,
  renumberSiblings,
  renumberAfterMove,
  reorderByUserPrefix,
  getLocalPosition,
} from "./numbering";

let observerID: string | null = null;
let _isRenumbering = false;
let _prefObservers: symbol[] = [];

function getAddon() {
  return (Zotero as any).Numify;
}

function getParentCache(): Map<number, number | null> {
  return getAddon().data.parentCache;
}

function getNameCache(): Map<number, string> {
  return getAddon().data.nameCache;
}

/**
 * Build the in-memory parent cache from all existing collections.
 * Maps collectionID → parentID (null for top-level).
 */
export function buildCaches(): void {
  const parentCache = getParentCache();
  const nameCache = getNameCache();
  parentCache.clear();
  nameCache.clear();

  const libraries = Zotero.Libraries.getAll();
  for (const lib of libraries) {
    const collections = Zotero.Collections.getByLibrary(lib.libraryID, true);
    for (const col of collections) {
      parentCache.set(col.id, col.parentID || null);
      nameCache.set(col.id, col.name);
    }
  }

  Zotero.debug(`[Numify] Caches built with ${parentCache.size} entries`);
}

/**
 * Handle a new collection being created.
 * Renumber all siblings under the new collection's parent.
 */
async function handleCollectionAdd(id: number): Promise<void> {
  const collection = Zotero.Collections.get(id);
  if (!collection) return;

  const parentID = collection.parentID || null;
  const libraryID = collection.libraryID;

  Zotero.debug(
    `[Numify] Collection added: "${collection.name}" (id=${id}, parentID=${parentID})`
  );

  // Renumber all siblings under this parent (includes the new one)
  await renumberSiblings(parentID, libraryID);

  // Update caches
  const parentCacheRef = getParentCache();
  const nameCacheRef = getNameCache();
  parentCacheRef.set(id, parentID);
  nameCacheRef.set(id, collection.name);

  // Also refresh name cache for all siblings (they were just renumbered)
  refreshNameCacheForParent(parentID, libraryID);
}

/**
 * Handle a collection being modified.
 * Detects:
 *   1. Moves (parentID change)
 *   2. User-driven prefix reordering (user changed the prefix number)
 *   3. Simple base name renames (just reapply correct prefix)
 */
async function handleCollectionModify(
  id: number,
  _extraData: any
): Promise<void> {
  const collection = Zotero.Collections.get(id);
  if (!collection) return;

  const parentCacheRef = getParentCache();
  const nameCacheRef = getNameCache();
  const cachedParentID = parentCacheRef.has(id) ? parentCacheRef.get(id)! : null;
  const currentParentID = collection.parentID || null;
  const cachedName = nameCacheRef.get(id) || null;

  if (cachedParentID !== currentParentID) {
    // It's a move — parent changed
    Zotero.debug(
      `[Numify] Collection moved: "${collection.name}" (id=${id}, ${cachedParentID} → ${currentParentID})`
    );

    await renumberAfterMove(collection, cachedParentID);

    // Update caches for the moved collection and all its descendants
    updateCacheForSubtree(collection);
    refreshNameCacheForParent(cachedParentID, collection.libraryID);
    refreshNameCacheForParent(currentParentID, collection.libraryID);
  } else {
    // Same parent — check if the user changed the prefix (reorder intent)
    const currentParsed = parseName(collection.name);
    const cachedParsed = cachedName ? parseName(cachedName) : null;

    const oldLocalPos = cachedParsed ? getLocalPosition(cachedParsed.prefix) : null;
    const newLocalPos = getLocalPosition(currentParsed.prefix);

    if (
      newLocalPos !== null &&
      oldLocalPos !== null &&
      newLocalPos !== oldLocalPos
    ) {
      // User deliberately changed the prefix → reorder
      Zotero.debug(
        `[Numify] Collection reorder: "${cachedName}" → "${collection.name}" (id=${id}, pos ${oldLocalPos} → ${newLocalPos})`
      );

      await reorderByUserPrefix(
        id,
        currentParsed.prefix!,
        currentParentID,
        collection.libraryID
      );

      refreshNameCacheForParent(currentParentID, collection.libraryID);
    } else {
      // Simple base name rename — reapply correct prefix
      Zotero.debug(
        `[Numify] Collection renamed: "${collection.name}" (id=${id})`
      );

      await renumberSiblings(currentParentID, collection.libraryID);
      refreshNameCacheForParent(currentParentID, collection.libraryID);
    }
  }
}

/**
 * Handle a collection being deleted.
 * Renumber the remaining siblings under the deleted collection's parent.
 */
async function handleCollectionDelete(
  id: number,
  extraData: any
): Promise<void> {
  const parentCacheRef = getParentCache();
  const nameCacheRef = getNameCache();
  const parentID = parentCacheRef.has(id) ? parentCacheRef.get(id)! : null;

  Zotero.debug(
    `[Numify] Collection deleted: id=${id}, parentID=${parentID}`
  );

  // Remove from caches
  parentCacheRef.delete(id);
  nameCacheRef.delete(id);

  // We need the libraryID. Try to get it from extraData or find it from the parent.
  let libraryID: number | null = null;

  if (extraData?.libraryID) {
    libraryID = extraData.libraryID;
  } else if (parentID) {
    const parent = Zotero.Collections.get(parentID);
    if (parent) {
      libraryID = parent.libraryID;
    }
  } else {
    // Fallback: use the user library
    libraryID = Zotero.Libraries.userLibraryID;
  }

  if (libraryID !== null) {
    await renumberSiblings(parentID, libraryID);
    refreshNameCacheForParent(parentID, libraryID);
  }
}

/**
 * Update the parent cache for a collection and all its descendants.
 */
function updateCacheForSubtree(collection: Zotero.Collection): void {
  const parentCacheRef = getParentCache();
  const nameCacheRef = getNameCache();
  parentCacheRef.set(collection.id, collection.parentID || null);
  nameCacheRef.set(collection.id, collection.name);

  const children = collection.getChildCollections(false) || [];
  for (const child of children) {
    updateCacheForSubtree(child);
  }
}

/**
 * Refresh the name cache for all siblings under a parent.
 * Called after renumbering to keep the cache in sync.
 */
function refreshNameCacheForParent(
  parentID: number | false | null,
  libraryID: number
): void {
  const nameCacheRef = getNameCache();

  let siblings: Zotero.Collection[];
  if (!parentID) {
    const all = Zotero.Collections.getByLibrary(libraryID);
    siblings = all.filter((c: Zotero.Collection) => !c.parentID);
  } else {
    const parent = Zotero.Collections.get(parentID);
    if (!parent) return;
    siblings = parent.getChildCollections(false) || [];
  }

  for (const sib of siblings) {
    nameCacheRef.set(sib.id, sib.name);
    refreshNameCacheRecursive(sib);
  }
}

/**
 * Recursively refresh name cache for all descendants.
 */
function refreshNameCacheRecursive(collection: Zotero.Collection): void {
  const nameCacheRef = getNameCache();
  const children = collection.getChildCollections(false) || [];
  for (const child of children) {
    nameCacheRef.set(child.id, child.name);
    refreshNameCacheRecursive(child);
  }
}

/**
 * Register the Notifier observer for collection events.
 */
export function registerCollectionObserver(): void {
  const observer = {
    notify: async (
      event: string,
      type: string,
      ids: (string | number)[],
      extraData: Record<string, any>
    ) => {
      if (_isRenumbering) return;
      if (type !== "collection") return;

      _isRenumbering = true;
      try {
        if (event === "add") {
          for (const id of ids) {
            await handleCollectionAdd(Number(id));
          }
        } else if (event === "modify") {
          for (const id of ids) {
            await handleCollectionModify(Number(id), extraData?.[id]);
          }
        } else if (event === "delete") {
          for (const id of ids) {
            await handleCollectionDelete(Number(id), extraData?.[id]);
          }
        } else if (event === "trash") {
          // Treat trash the same as delete for renumbering purposes
          for (const id of ids) {
            await handleCollectionDelete(Number(id), extraData?.[id]);
          }
        }
      } catch (err) {
        Zotero.debug(`[Numify] Error in observer: ${err}`);
      } finally {
        _isRenumbering = false;
      }
    },
  };

  observerID = Zotero.Notifier.registerObserver(
    observer,
    ["collection"],
    "numify"
  );

  const addon = getAddon();
  addon.data.observerID = observerID;

  Zotero.debug(`[Numify] Observer registered (id=${observerID})`);
}

/**
 * Unregister the Notifier observer.
 */
export function unregisterCollectionObserver(): void {
  if (observerID) {
    Zotero.Notifier.unregisterObserver(observerID);
    Zotero.debug(`[Numify] Observer unregistered (id=${observerID})`);
    observerID = null;
  }
}

/**
 * Renumber ALL top-level collections across all libraries.
 * Called when a setting (separator or maxDepth) changes so the
 * new setting is immediately reflected in existing collection names.
 */
async function renumberAllLibraries(): Promise<void> {
  if (_isRenumbering) return;
  _isRenumbering = true;
  Zotero.debug("[Numify] Settings changed — renumbering all collections");
  try {
    const libraries = Zotero.Libraries.getAll();
    for (const lib of libraries) {
      await renumberSiblings(null, lib.libraryID);
    }
    // Rebuild name cache to reflect new names
    buildCaches();
  } catch (err) {
    Zotero.debug(`[Numify] Error during full renumber: ${err}`);
  } finally {
    _isRenumbering = false;
  }
}

/**
 * Register observers on the separator and maxDepth preferences so that
 * changing either setting immediately renumbers all collections.
 */
export function registerPrefObservers(): void {
  // Use full absolute keys with global=true to match what the prefs pane writes
  const sepSym = Zotero.Prefs.registerObserver(
    "extensions.zotero.numify.separator",
    () => { renumberAllLibraries(); },
    true
  );
  const depthSym = Zotero.Prefs.registerObserver(
    "extensions.zotero.numify.maxDepth",
    () => { renumberAllLibraries(); },
    true
  );
  const padZeroSym = Zotero.Prefs.registerObserver(
    "extensions.zotero.numify.padZero",
    () => { renumberAllLibraries(); },
    true
  );
  _prefObservers = [sepSym, depthSym, padZeroSym];
  Zotero.debug("[Numify] Pref observers registered");
}

/**
 * Unregister pref observers on shutdown.
 */
export function unregisterPrefObservers(): void {
  for (const sym of _prefObservers) {
    Zotero.Prefs.unregisterObserver(sym);
  }
  _prefObservers = [];
  Zotero.debug("[Numify] Pref observers unregistered");
}
