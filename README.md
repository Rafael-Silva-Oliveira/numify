<p align="center">
  <img src="promo.png" alt="Numify — Auto-number your Zotero collections" width="640">
</p>

---

Numify automatically adds **hierarchical numeric prefixes** to your Zotero collection names. Create, rename, delete, or reorder collections — the numbering stays in sync.

## Features

- **Auto-prefix on creation** — New collections and sub-collections are instantly numbered
- **Deep nesting** — Supports unlimited depth (`1.2.3.4.5...`)
- **Reorder by renaming** — Change a prefix to move a collection to a new position
- **Gap-free numbering** — Deleting a collection renumbers remaining siblings automatically
- **Rename-safe** — Change the base name and your prefix is preserved
- **Syncs across devices** — Prefixes are stored in the collection name, so Zotero syncs them natively

```
Library
├── 1 Physics
│   ├── 1.1 Quantum Mechanics
│   │   ├── 1.1.1 Entanglement
│   │   └── 1.1.2 Superposition
│   └── 1.2 Classical Mechanics
├── 2 Mathematics
│   ├── 2.1 Algebra
│   └── 2.2 Calculus
└── 3 Chemistry
```

## Requirements

- **Zotero 7.0 or later** — Download from [zotero.org](https://www.zotero.org/download/)

| Zotero Version | Supported |
|----------------|-----------|
| Zotero 7       | Yes       |
| Zotero 8       | Yes       |
| Zotero 6       | No        |

## Installation

1. Download the latest `numify.xpi` from the [Releases](https://github.com/Rafael-Silva-Oliveira/numify/releases/latest) page

2. Open Zotero and go to **Tools > Add-ons**

3. Click the **gear icon** (⚙) in the top-right corner and select **Install Add-on From File...**

4. Browse to the downloaded `numify.xpi` file and click **Open**. Soon to be added in the Zotero Add-ons market (https://github.com/syt2/zotero-addons)

5. Restart Zotero if prompted

> **Building from source** (optional):
> ```bash
> git clone https://github.com/Rafael-Silva-Oliveira/numify.git
> cd numify
> npm install
> npm run build
> ```
> The built `.xpi` will be at `.scaffold/build/numify.xpi`

## Usage

### Creating collections

When you create a new collection, Numify automatically assigns the next available prefix.

1. Create a new collection in your library — Numify adds the prefix automatically

   ![Creating a new collection named "My Collection"](docs/01-create-collection.png)

2. The collection appears with its hierarchical prefix

   ![Collection appears as "2 My Collection"](docs/02-collection-created.png)

### Creating sub-collections

Sub-collections receive prefixes relative to their parent.

1. Right-click a collection and create a new sub-collection

   ![Creating a sub-collection under "2 My Collection"](docs/03-create-subcollection.png)

2. The full hierarchy is numbered automatically — sub-collections, sub-sub-collections, and beyond

   ![Full hierarchy: 2.1, 2.1.1, 2.1.1.1, 2.1.2, 2.2](docs/04-hierarchy-numbered.png)

### Reordering collections

Since Zotero doesn't support drag-and-drop reordering of collections, Numify lets you **reorder by editing the prefix**.

For example, to move `2.1.2 Another one` to position 1:

1. Starting from this hierarchy:

   ![Before reorder: 2.1.1 Yet another sub-collection!, 2.1.2 Another one](docs/04b-hierarchy-before-reorder.png)

2. Rename `2.1.2 Another one` to `2.1.1 Another one`

3. **Collapse and re-expand the parent collection** (in this case `2.1 Sub-Collection`) for the order to refresh

4. Numify detects the position change and shifts the other collections accordingly — `Another one` is now `2.1.1` and `Yet another sub-collection!` shifted to `2.1.2`

   ![After reorder: "Another one" is now 2.1.1, former 2.1.1 shifted to 2.1.2](docs/05-reordered.png)

> **Tip:** After changing a prefix, simply collapse and re-open the parent collection in the sidebar to see the updated order.

## How it works

Numify uses Zotero's [Notifier API](https://www.zotero.org/support/dev/client_coding/javascript_api) to listen for collection events:

| Event | What happens |
|-------|-------------|
| **Create** | New collection is assigned the next prefix; all siblings are renumbered |
| **Rename** | Base name change → prefix is reapplied. Prefix change → siblings are reordered |
| **Delete / Trash** | Remaining siblings are renumbered to close gaps |
| **Move** | Both old and new parent's children are renumbered |

All renaming is done with `skipNotifier: true` to prevent infinite loops. An in-memory cache tracks parent IDs and names to detect moves vs. reorder intents.

## Development

```bash
# Start dev mode with hot-reload
npm start
```

This watches for changes and auto-reloads the plugin in Zotero.

## License

[MIT](LICENSE)
