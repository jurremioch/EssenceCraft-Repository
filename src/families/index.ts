import { createRegistry } from "@/engine";

import { naturalFamily } from "./natural/rules";

export const familyRegistry = createRegistry([naturalFamily]);

export type RegisteredFamilyId = typeof naturalFamily.id;
