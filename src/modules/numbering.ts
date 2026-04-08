/**
 * Core numbering logic for Numify.
 *
 * Prefix format: "1.2.3<sep>Collection Name"
 * where <sep> is the user-configured separator: " ", " | ", or ": "
 *
 * - Top-level collections: "1 Name", "2 Name"
 * - Sub-collections: "1.1 Name", "1.2 Name"
 * - Deep nesting: "1.2.3 Name", "6.5.4.3.2.1.1 Name"
 */

/**
 * Matches any of the three supported separators after a numeric prefix.
 * Captures: (1) the numeric prefix, (2) the separator used.
 * Handles: " | ", ": ", or " " (space-only).
 *
 * Order matters — " | " and ": " must be checked before " " to avoid
 * a bare space match eating the first char of those separators.
 */
const PREFIX_PATTERN = /^(\d+(?:\.\d+)*)( - | )/;

export interface ParsedName {
  prefix: string | null;
  baseName: string;
}

/**
 * Read the current settings from Zotero preferences.
 * Use full absolute keys with global=true to avoid any branch-scoping
 * ambiguity across different Zotero contexts (main window vs pref pane).
 */
function getSettings(): { maxDepth: number; separator: string } {
  const rawDepth = Zotero.Prefs.get("extensions.zotero.numify.maxDepth", true);
  const rawSep = Zotero.Prefs.get("extensions.zotero.numify.separator", true);
  // Prefs may come back as string or number depending on context — coerce both
  const maxDepth = parseInt(String(rawDepth), 10);
  return {
    maxDepth: !isNaN(maxDepth) && maxDepth >= 1 ? maxDepth : 6,
    separator: typeof rawSep === "string" && rawSep.length > 0 ? rawSep : " ",
  };
}

/**
 * Parse a collection name into its numeric prefix and base name.
 * Handles all separator variants transparently.
 *
 * "1.2 My Collection"    → { prefix: "1.2", baseName: "My Collection" }
 * "1.2 | My Collection"  → { prefix: "1.2", baseName: "My Collection" }
 * "1.2: My Collection"   → { prefix: "1.2", baseName: "My Collection" }
 * "My Collection"        → { prefix: null,  baseName: "My Collection" }
 */
export function parseName(name: string): ParsedName {
  const match = name.match(PREFIX_PATTERN);
  if (match) {
    return {
      prefix: match[1],
      baseName: name.slice(match[0].length),
    };
  }
  return { prefix: null, baseName: name };
}

/**
 * Build a full collection name from prefix and base name using the
 * current separator setting.
 * ("1.2", "My Collection") → "1.2 My Collection"  (with default sep)
 * ("1.2", "My Collection") → "1.2 | My Collection" (with pipe sep)
 */
export function buildName(prefix: string, baseName: string): string {
  const { separator } = getSettings();
  return `${prefix}${separator}${baseName}`;
}

/**
 * Compute a prefix from the parent's prefix and a 1-based position index.
 * ("1", 2) → "1.2"
 * (null, 3) → "3"
 */
export function computePrefix(
  parentPrefix: string | null,
  positionIndex: number
): string {
  if (parentPrefix) {
    return `${parentPrefix}.${positionIndex}`;
  }
  return `${positionIndex}`;
}

/**
 * Get sibling collections for a given parent.
 * If parentID is falsy, returns top-level collections for the library.
 */
function getSiblings(
  parentID: number | false | null,
  libraryID: number
): Zotero.Collection[] {
  if (!parentID) {
    const all = Zotero.Collections.getByLibrary(libraryID);
    return all.filter((c) => !c.parentID);
  }
  const parent = Zotero.Collections.get(parentID);
  if (!parent) return [];
  return parent.getChildCollections(false) || [];
}

/**
 * Get the prefix of a collection's parent.
 * Returns null for top-level collections.
 */
function getParentPrefix(
  parentID: number | false | null
): string | null {
  if (!parentID) return null;
  const parent = Zotero.Collections.get(parentID);
  if (!parent) return null;
  return parseName(parent.name).prefix;
}

/**
 * Compute the depth of a prefix.
 * null → depth 1 (top-level children)
 * "1" → depth 2
 * "1.2" → depth 3
 */
function prefixDepth(parentPrefix: string | null): number {
  if (!parentPrefix) return 1;
  return parentPrefix.split(".").length + 1;
}

/**
 * Renumber all siblings under a given parent, then recursively
 * renumber their descendants (since the prefix path may have changed).
 *
 * Respects maxDepth: collections at a depth exceeding the setting
 * have their prefix stripped (bare base name only).
 *
 * If `orderedSiblings` is provided, use that ordering instead of
 * the default Zotero ordering. This supports user-driven reordering.
 */
export async function renumberSiblings(
  parentID: number | false | null,
  libraryID: number,
  orderedSiblings?: Zotero.Collection[]
): Promise<void> {
  const { maxDepth } = getSettings();
  const siblings = orderedSiblings || getSiblings(parentID, libraryID);
  const parentPrefix = getParentPrefix(parentID);
  const depth = prefixDepth(parentPrefix);

  for (let i = 0; i < siblings.length; i++) {
    const sib = siblings[i];
    const { baseName } = parseName(sib.name);

    if (depth > maxDepth) {
      // Beyond max depth — strip prefix, keep only base name
      if (sib.name !== baseName) {
        sib.name = baseName;
        await sib.saveTx({ skipNotifier: true });
      }
    } else {
      const newPrefix = computePrefix(parentPrefix, i + 1);
      const newName = buildName(newPrefix, baseName);
      if (sib.name !== newName) {
        sib.name = newName;
        await sib.saveTx({ skipNotifier: true });
      }
    }

    // Always recurse so descendants are also corrected
    // Pass depth+1 explicitly so stripped collections don't reset the counter
    await renumberChildren(sib, depth + 1);
  }
}

/**
 * Extract the local position (last segment) from a prefix.
 * "7.1.2" → 2, "3" → 3, null → null
 */
export function getLocalPosition(prefix: string | null): number | null {
  if (!prefix) return null;
  const parts = prefix.split(".");
  return parseInt(parts[parts.length - 1], 10);
}

/**
 * Reorder siblings by moving a collection to a user-specified position.
 * The user changes the prefix to indicate where they want the collection.
 *
 * Example: User renames "7.1.2 B" to "7.1.1 B" → move B to position 1,
 * shifting "7.1.1 A" to become "7.1.2 A".
 */
export async function reorderByUserPrefix(
  collectionID: number,
  userPrefix: string,
  parentID: number | false | null,
  libraryID: number
): Promise<void> {
  const desiredPos = getLocalPosition(userPrefix);
  if (desiredPos === null || desiredPos < 1) {
    await renumberSiblings(parentID, libraryID);
    return;
  }

  const siblings = getSiblings(parentID, libraryID);

  const targetIndex = siblings.findIndex((s) => s.id === collectionID);
  if (targetIndex === -1) {
    await renumberSiblings(parentID, libraryID);
    return;
  }

  const [target] = siblings.splice(targetIndex, 1);
  const insertIndex = Math.min(desiredPos - 1, siblings.length);
  siblings.splice(insertIndex, 0, target);

  await renumberSiblings(parentID, libraryID, siblings);
}

/**
 * Recursively renumber all descendants of a collection.
 * `depth` is the depth of the children being processed (parent depth + 1).
 * Passed explicitly so stripped collections don't reset the depth counter
 * when their prefix is null.
 */
export async function renumberChildren(
  collection: Zotero.Collection,
  depth: number
): Promise<void> {
  const children = collection.getChildCollections(false) || [];
  if (children.length === 0) return;

  const { maxDepth } = getSettings();
  // Use the collection's current prefix to build children's prefixes,
  // but only if this depth is within the allowed range.
  const parentPrefix = parseName(collection.name).prefix;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const { baseName } = parseName(child.name);

    if (depth > maxDepth) {
      // Strip prefix — this level and all below are beyond max depth
      if (child.name !== baseName) {
        child.name = baseName;
        await child.saveTx({ skipNotifier: true });
      }
    } else {
      const newPrefix = computePrefix(parentPrefix, i + 1);
      const newName = buildName(newPrefix, baseName);
      if (child.name !== newName) {
        child.name = newName;
        await child.saveTx({ skipNotifier: true });
      }
    }

    // depth+1 for grandchildren — always explicit, never inferred from name
    await renumberChildren(child, depth + 1);
  }
}

/**
 * Handle a collection move: renumber both the old parent's children
 * and the new parent's children.
 */
export async function renumberAfterMove(
  movedCollection: Zotero.Collection,
  oldParentID: number | null
): Promise<void> {
  const libraryID = movedCollection.libraryID;

  await renumberSiblings(oldParentID, libraryID);

  const newParentID = movedCollection.parentID || null;
  await renumberSiblings(newParentID, libraryID);
}
