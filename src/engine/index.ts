export * from "./types";
export * from "./math";
export * from "./simulate";

export function createRegistry(entries: import("./types").FamilyDefinition[]): import("./types").Registry {
  const registry: import("./types").Registry = new Map();
  for (const family of entries) {
    registry.set(family.id, family);
  }
  return registry;
}
