/**
 * Core numbering logic for Numify.
 *
 * Prefix format: "1.2.3 Collection Name"
 * - Top-level collections: "1 Name", "2 Name"
 * - Sub-collections: "1.1 Name", "1.2 Name"
 * - Deep nesting: "1.2.3 Name", "6.5.4.3.2.1.1 Name"
 */

/** Matches a hierarchical numeric prefix at the start of a name */
const PREFIX_PATTERN = /^(\d+(?:\.\d+)*) /;

export interface ParsedName {
  prefix: string | null;
  baseName: string;
}

/**
 * Parse a collection name into its numeric prefix and base name.
 * "1.2 My Collection" → { prefix: "1.2", baseName: "My Collection" }
 * "My Collection"     → { prefix: null,  baseName: "My Collection" }
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
 * Build a full collection name from prefix and base name.
 * ("1.2", "My Collection") → "1.2 My Collection"
 */
export function buildName(prefix: string, baseName: string): string {
  return `${prefix} ${baseName}`;
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
    // Top-level collections: filter getByLibrary to only root collections
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
 * Renumber all siblings under a given parent, then recursively
 * renumber their descendants (since the prefix path may have changed).
 *
 * If `orderedSiblings` is provided, use that ordering instead of
 * the default Zotero ordering. This supports user-driven reordering.
 */
export async function renumberSiblings(
  parentID: number | false | null,
  libraryID: number,
  orderedSiblings?: Zotero.Collection[]
): Promise<void> {
  const siblings = orderedSiblings || getSiblings(parentID, libraryID);
  const parentPrefix = getParentPrefix(parentID);

  for (let i = 0; i < siblings.length; i++) {
    const sib = siblings[i];
    const { baseName } = parseName(sib.name);
    const newPrefix = computePrefix(parentPrefix, i + 1);
    const newName = buildName(newPrefix, baseName);

    if (sib.name !== newName) {
      sib.name = newName;
      await sib.saveTx({ skipNotifier: true });
    }

    // Recursively renumber children (their prefix path depends on this one)
    await renumberChildren(sib);
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
    // Invalid prefix, just do a normal renumber
    await renumberSiblings(parentID, libraryID);
    return;
  }

  const siblings = getSiblings(parentID, libraryID);

  // Remove the target collection from the list
  const targetIndex = siblings.findIndex((s) => s.id === collectionID);
  if (targetIndex === -1) {
    await renumberSiblings(parentID, libraryID);
    return;
  }

  const [target] = siblings.splice(targetIndex, 1);

  // Clamp desired position to valid range (1-based → 0-based insert index)
  const insertIndex = Math.min(desiredPos - 1, siblings.length);

  // Insert at the desired position
  siblings.splice(insertIndex, 0, target);

  // Renumber all siblings in the new order
  await renumberSiblings(parentID, libraryID, siblings);
}

/**
 * Recursively renumber all descendants of a collection.
 * Called after a collection's prefix changes to propagate the new path.
 */
export async function renumberChildren(
  collection: Zotero.Collection
): Promise<void> {
  const children = collection.getChildCollections(false) || [];
  if (children.length === 0) return;

  const parentPrefix = parseName(collection.name).prefix;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const { baseName } = parseName(child.name);
    const newPrefix = computePrefix(parentPrefix, i + 1);
    const newName = buildName(newPrefix, baseName);

    if (child.name !== newName) {
      child.name = newName;
      await child.saveTx({ skipNotifier: true });
    }

    // Recurse into grandchildren
    await renumberChildren(child);
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

  // Renumber old parent's remaining children
  await renumberSiblings(oldParentID, libraryID);

  // Renumber new parent's children (includes the moved collection)
  const newParentID = movedCollection.parentID || null;
  await renumberSiblings(newParentID, libraryID);
}
