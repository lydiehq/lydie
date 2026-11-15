import type { Contributed, ContributionKind, Contributions } from "@lydie/plugin-api";

const EMPTY: readonly never[] = Object.freeze([]);

export type ContributionRegistry = {
  add<K extends ContributionKind>(kind: K, pluginId: string, def: Contributions[K]): () => void;
  list<K extends ContributionKind>(kind: K): readonly Contributed<K>[];
  subscribe(kind: ContributionKind, listener: () => void): () => void;
};

const orderOf = (item: unknown) => {
  const order = (item as { order?: number }).order;
  return typeof order === "number" ? order : 100;
};

export function createContributionRegistry(): ContributionRegistry {
  const lists = new Map<ContributionKind, readonly unknown[]>();
  const listeners = new Map<ContributionKind, Set<() => void>>();
  const notify = (kind: ContributionKind) => {
    for (const listener of [...(listeners.get(kind) ?? [])]) listener();
  };
  return {
    add(kind, pluginId, def) {
      const item = { ...def, pluginId };
      const next = [...(lists.get(kind) ?? []), item].sort((a, b) => orderOf(a) - orderOf(b));
      lists.set(kind, next);
      notify(kind);
      return () => {
        const current = lists.get(kind) ?? [];
        if (!current.includes(item)) return;
        lists.set(
          kind,
          current.filter((x) => x !== item),
        );
        notify(kind);
      };
    },
    list<K extends ContributionKind>(kind: K) {
      return (lists.get(kind) ?? EMPTY) as readonly Contributed<K>[];
    },
    subscribe(kind, listener) {
      let set = listeners.get(kind);
      if (!set) listeners.set(kind, (set = new Set()));
      set.add(listener);
      return () => set.delete(listener);
    },
  };
}
