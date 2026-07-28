/**
 * Core numbering logic for Numify.
 *
 * Prefix format: "1.2.3<sep>Collection Name"
 * where <sep> is the user-configured separator: " " (space) or " - " (dash)
 *
 * - Top-level collections: "1 Name", "2 Name"
 * - Sub-collections: "1.1 Name", "1.2 Name"
 * - Deep nesting: "1.2.3 Name", "6.5.4.3.2.1.1 Name"
 */

/**
 * Matches any known separator after a numeric prefix for PARSING purposes.
 * Recognises all legacy separators (" | ", ": ") as well as the current
 * ones (" - ", " ") so old collection names are stripped cleanly when
 * renumbering after a separator change.
 *
 * Order matters — multi-char separators must come before bare space.
 */
const PREFIX_PATTERN = /^(\d+(?:\.\d+)*)( \| | - |: | )/;

export interface ParsedName {
  prefix: string | null;
  baseName: string;
}

/**
 * Read the current settings from Zotero preferences.
 * Use full absolute keys with global=true to avoid any branch-scoping
 * ambiguity across different Zotero contexts (main window vs pref pane).
 */
function getSettings(): {
  maxDepth: number;
  separator: string;
  padZero: boolean;
} {
  const rawDepth = Zotero.Prefs.get("extensions.zotero.numify.maxDepth", true);
  const rawSep = Zotero.Prefs.get("extensions.zotero.numify.separator", true);
  const rawPadZero = Zotero.Prefs.get("extensions.zotero.numify.padZero", true);
  // Prefs may come back as string or number depending on context — coerce both
  const maxDepth = parseInt(String(rawDepth), 10);
  return {
    maxDepth: !isNaN(maxDepth) && maxDepth >= 1 ? maxDepth : 6,
    separator: typeof rawSep === "string" && rawSep.length > 0 ? rawSep : " ",
    padZero: rawPadZero === true,
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
  positionIndex: number,
): string {
  if (parentPrefix) {
    // Strip any leading zero from the parent prefix so sub-collections
    // use unpadded numbering (e.g. "1.1" under "01 PhD", not "01.1")
    const unpadded = parentPrefix.replace(/^0+(\d)/, "$1");
    return `${unpadded}.${positionIndex}`;
  }
  // Top-level: optionally pad single-digit positions with a leading zero
  const { padZero } = getSettings();
  if (padZero && positionIndex < 10) {
    return String(positionIndex).padStart(2, "0");
  }
  return `${positionIndex}`;
}

/**
 * Get sibling collections for a given parent (raw, in Zotero internal order).
 * If parentID is falsy, returns top-level collections for the library.
 *
 * NOTE: callers should generally use {@link getSiblings} (prefix-sorted)
 * so renumbering preserves the order the user sees, not Zotero's internal
 * creation/ID order.
 */
function getRawSiblings(
  parentID: number | false | null,
  libraryID: number,
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
 * Convert a prefix string ("1.2.3") to numeric segments ([1,2,3]).
 * Returns null for an unprefixed/invalid key.
 */
function prefixKeyToSegments(key: string | null): number[] | null {
  if (!key) return null;
  const parts = key.split(".");
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => isNaN(n))) return null;
  return nums;
}

/**
 * Compare two prefix keys (each a dotted numeric string or null).
 * Order: prefixed collections first (by numeric segments, shorter first),
 * unprefixed collections last. This makes "1.10" sort AFTER "1.2" and
 * "1.2" sort BEFORE "1.2.1", matching the numeric hierarchy the user sees.
 */
export function comparePrefixKeys(a: string | null, b: string | null): number {
  const sa = prefixKeyToSegments(a);
  const sb = prefixKeyToSegments(b);
  if (sa === null && sb === null) return 0;
  if (sa === null) return 1; // unprefixed sorts after prefixed
  if (sb === null) return -1;
  const len = Math.min(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    if (sa[i] !== sb[i]) return sa[i] - sb[i];
  }
  return sa.length - sb.length; // shorter prefix first: 1.2 before 1.2.1
}

/**
 * Sort a list of collections by the numeric prefix embedded in their names,
 * giving the order the user actually sees (not Zotero's internal ID order).
 *
 * `overrides` lets a caller supply a different prefix for specific ids — used
 * by the reorder path to position a just-renamed collection at its *previous*
 * slot before splicing it to the desired position (avoids prefix collisions
 * with the displaced sibling).
 *
 * The sort is stable: ties (e.g. two unprefixed, or equal prefixes) break by
 * collection id so the result is deterministic across runs/sessions.
 */
export function sortByPrefix(
  collections: Zotero.Collection[],
  overrides?: Map<number, string | null>,
): Zotero.Collection[] {
  const getKey = (col: Zotero.Collection): string | null => {
    if (overrides && overrides.has(col.id)) {
      return overrides.get(col.id) ?? null;
    }
    return parseName(col.name).prefix;
  };
  return collections.slice().sort((a, b) => {
    const c = comparePrefixKeys(getKey(a), getKey(b));
    if (c !== 0) return c;
    return a.id - b.id; // stable tie-break
  });
}

/**
 * Get sibling collections for a given parent, sorted by prefix so that
 * renumbering preserves the order the user sees. If parentID is falsy,
 * returns top-level collections for the library.
 */
function getSiblings(
  parentID: number | false | null,
  libraryID: number,
): Zotero.Collection[] {
  return sortByPrefix(getRawSiblings(parentID, libraryID));
}

/**
 * Get the prefix of a collection's parent.
 * Returns null for top-level collections.
 */
function getParentPrefix(parentID: number | false | null): string | null {
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
  orderedSiblings?: Zotero.Collection[],
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
 *
 * The target collection is sorted into the list using its *old* prefix (read
 * from the addon name cache) so it lands at its true previous slot before
 * being spliced to the desired position. This avoids the ambiguity that
 * occurs when the new prefix collides with the displaced sibling's prefix —
 * which previously let Zotero's internal ID order decide, producing the
 * unpredictable shuffling reported in issue #4.
 */
export async function reorderByUserPrefix(
  collectionID: number,
  userPrefix: string,
  parentID: number | false | null,
  libraryID: number,
): Promise<void> {
  const desiredPos = getLocalPosition(userPrefix);
  if (desiredPos === null || desiredPos < 1) {
    await renumberSiblings(parentID, libraryID);
    return;
  }

  // Build the siblings sorted by prefix, but use the target's OLD prefix
  // (from the name cache) so it is placed at its previous position before we
  // move it — independent of Zotero's internal creation/ID order.
  const addon = (Zotero as any).Numify;
  const oldName: string | undefined = addon?.data?.nameCache?.get(collectionID);
  const oldPrefix = oldName ? parseName(oldName).prefix : null;

  const overrides = new Map<number, string | null>();
  if (oldName !== undefined) {
    overrides.set(collectionID, oldPrefix);
  }
  const siblings = sortByPrefix(getRawSiblings(parentID, libraryID), overrides);

  const targetIndex = siblings.findIndex((s) => s.id === collectionID);
  if (targetIndex === -1) {
    await renumberSiblings(parentID, libraryID);
    return;
  }

  const [target] = siblings.splice(targetIndex, 1);
  const insertIndex = Math.min(desiredPos - 1, siblings.length);
  siblings.splice(insertIndex, 0, target);

  Zotero.debug(
    `[Numify] reorder: target id=${collectionID} oldPrefix=${oldPrefix} ` +
      `desiredPos=${desiredPos} → order=${siblings
        .map((s) => `${s.id}:${parseName(s.name).prefix ?? "-"}`)
        .join(", ")}`,
  );

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
  depth: number,
): Promise<void> {
  const { maxDepth } = getSettings();
  // Use the collection's current prefix to build children's prefixes,
  // but only if this depth is within the allowed range.
  const parentPrefix = parseName(collection.name).prefix;

  // Sort children by prefix so descendant numbering preserves the order
  // the user sees, not Zotero's internal ID order (fixes siblings being
  // shuffled when a parent is renumbered).
  const children = sortByPrefix(collection.getChildCollections(false) || []);

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
  oldParentID: number | null,
): Promise<void> {
  const libraryID = movedCollection.libraryID;

  await renumberSiblings(oldParentID, libraryID);

  const newParentID = movedCollection.parentID || null;
  await renumberSiblings(newParentID, libraryID);
}
