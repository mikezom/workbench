import { promises as fs } from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "groups.json");

export interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  settings: {
    dailyNewLimit: number;
    dailyReviewLimit: number;
  };
  created_at: string;
}

async function readGroups(): Promise<Group[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeGroups(groups: Group[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(groups, null, 2));
}

export async function getAllGroups(): Promise<Group[]> {
  return readGroups();
}

export async function getGroup(id: string): Promise<Group | undefined> {
  const groups = await readGroups();
  return groups.find((g) => g.id === id);
}

export async function createGroup(
  name: string,
  parentId: string | null = null,
  settings?: Partial<Group["settings"]>
): Promise<Group> {
  const groups = await readGroups();
  const group: Group = {
    id: crypto.randomUUID(),
    name,
    parent_id: parentId,
    settings: {
      dailyNewLimit: settings?.dailyNewLimit ?? 20,
      dailyReviewLimit: settings?.dailyReviewLimit ?? 100,
    },
    created_at: new Date().toISOString(),
  };
  groups.push(group);
  await writeGroups(groups);
  return group;
}

export async function updateGroup(
  id: string,
  updates: { name?: string; settings?: Partial<Group["settings"]> }
): Promise<Group | null> {
  const groups = await readGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  if (updates.name !== undefined) groups[idx].name = updates.name;
  if (updates.settings) {
    groups[idx].settings = { ...groups[idx].settings, ...updates.settings };
  }
  await writeGroups(groups);
  return groups[idx];
}

export async function deleteGroup(id: string): Promise<boolean> {
  const groups = await readGroups();
  const idsToDelete = getDescendantIdsSync(id, groups);
  const filtered = groups.filter((g) => !idsToDelete.includes(g.id));
  if (filtered.length === groups.length) return false;
  await writeGroups(filtered);
  return true;
}

/** Synchronous version for use when groups are already loaded. */
function getDescendantIdsSync(id: string, groups: Group[]): string[] {
  const result: string[] = [id];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const g of groups) {
      if (g.parent_id === current) {
        result.push(g.id);
        queue.push(g.id);
      }
    }
  }
  return result;
}

export async function getDescendantIds(id: string): Promise<string[]> {
  const groups = await readGroups();
  const result: string[] = [id];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const g of groups) {
      if (g.parent_id === current) {
        result.push(g.id);
        queue.push(g.id);
      }
    }
  }
  return result;
}

export async function createGroupsBulk(
  newGroups: Array<{ name: string; parent_id: string | null }>
): Promise<Group[]> {
  const groups = await readGroups();
  const created: Group[] = [];
  for (const ng of newGroups) {
    const group: Group = {
      id: crypto.randomUUID(),
      name: ng.name,
      parent_id: ng.parent_id,
      settings: { dailyNewLimit: 20, dailyReviewLimit: 100 },
      created_at: new Date().toISOString(),
    };
    groups.push(group);
    created.push(group);
  }
  await writeGroups(groups);
  return created;
}
