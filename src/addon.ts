import hooks from "./hooks";

class Addon {
  public data = {
    initialized: false,
    observerID: null as string | null,
    parentCache: new Map<number, number | null>(),
    nameCache: new Map<number, string>(),
  };
  public hooks = hooks;
}

export default Addon;
