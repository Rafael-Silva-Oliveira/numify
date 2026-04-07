declare const __env__: string;

declare namespace _ZoteroTypes {
  interface Collection {
    id: number;
    key: string;
    libraryID: number;
    name: string;
    parentID: number | false;
    parentKey: string | false;
    version: number;
    deleted: boolean;
    getChildCollections(asIDs?: false): Zotero.Collection[];
    getChildCollections(asIDs: true): number[];
    getChildItems(asIDs?: false): Zotero.Item[];
    getChildItems(asIDs: true): number[];
    hasChildCollections(): boolean;
    hasChildItems(): boolean;
    saveTx(options?: {
      skipNotifier?: boolean;
      skipSyncedUpdate?: boolean;
      skipDateModifiedUpdate?: boolean;
      [key: string]: any;
    }): Promise<number>;
    toJSON(): any;
  }

  interface Collections {
    get(id: number): Zotero.Collection | false;
    getByLibrary(libraryID: number, recursive?: boolean): Zotero.Collection[];
    getLoaded(): Zotero.Collection[];
  }

  interface NotifierCallback {
    notify(
      event: string,
      type: string,
      ids: (string | number)[],
      extraData: Record<string, any>
    ): void | Promise<void>;
  }

  interface Notifier {
    registerObserver(
      ref: NotifierCallback,
      types: string[],
      id?: string,
      priority?: number
    ): string;
    unregisterObserver(id: string): void;
  }
}

declare namespace Zotero {
  type Collection = _ZoteroTypes.Collection;
  type Item = any;

  const Collections: _ZoteroTypes.Collections;
  const Notifier: _ZoteroTypes.Notifier;
  const initializationPromise: Promise<void>;
  const unlockPromise: Promise<void>;
  const uiReadyPromise: Promise<void>;
  const Libraries: {
    userLibraryID: number;
    getAll(): any[];
  };

  function debug(msg: string, level?: number): void;
  function log(msg: string): void;

  let Numify: any;
}

declare const Services: any;
declare const Components: any;
