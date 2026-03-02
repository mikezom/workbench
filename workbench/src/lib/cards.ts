import { promises as fs } from "fs";
import path from "path";
import { createEmptyCard, type Card as FSRSCard } from "ts-fsrs";

const DATA_PATH = path.join(process.cwd(), "data", "cards.json");

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  source: string | null;
  group_id: string | null;
  fsrs: FSRSCard;
  created_at: string;
  updated_at: string;
}

async function readCards(): Promise<StudyCard[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeCards(cards: StudyCard[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(cards, null, 2));
}

export async function getAllCards(): Promise<StudyCard[]> {
  return readCards();
}

export async function getCard(id: string): Promise<StudyCard | undefined> {
  const cards = await readCards();
  return cards.find((c) => c.id === id);
}

export async function getDueCards(): Promise<StudyCard[]> {
  const cards = await readCards();
  const now = new Date();
  return cards.filter((c) => new Date(c.fsrs.due) <= now);
}

export async function createCard(front: string, back: string, groupId: string | null = null): Promise<StudyCard> {
  const cards = await readCards();
  const now = new Date().toISOString();
  const card: StudyCard = {
    id: crypto.randomUUID(),
    front,
    back,
    source: null,
    group_id: groupId,
    fsrs: createEmptyCard(new Date()),
    created_at: now,
    updated_at: now,
  };
  cards.push(card);
  await writeCards(cards);
  return card;
}

export async function updateCard(
  id: string,
  updates: { front?: string; back?: string }
): Promise<StudyCard | null> {
  const cards = await readCards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  if (updates.front !== undefined) cards[idx].front = updates.front;
  if (updates.back !== undefined) cards[idx].back = updates.back;
  cards[idx].updated_at = new Date().toISOString();
  await writeCards(cards);
  return cards[idx];
}

export async function updateCardFSRS(
  id: string,
  fsrsCard: FSRSCard
): Promise<StudyCard | null> {
  const cards = await readCards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cards[idx].fsrs = fsrsCard;
  cards[idx].updated_at = new Date().toISOString();
  await writeCards(cards);
  return cards[idx];
}

export async function deleteCard(id: string): Promise<boolean> {
  const cards = await readCards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  cards.splice(idx, 1);
  await writeCards(cards);
  return true;
}

export async function getCardsByGroup(groupIds: string[]): Promise<StudyCard[]> {
  const cards = await readCards();
  return cards.filter((c) => c.group_id !== null && groupIds.includes(c.group_id));
}

export async function getDueCardsByGroup(groupIds: string[]): Promise<StudyCard[]> {
  const cards = await readCards();
  const now = new Date();
  return cards.filter(
    (c) =>
      c.group_id !== null &&
      groupIds.includes(c.group_id) &&
      new Date(c.fsrs.due) <= now
  );
}

export async function deleteCardsByGroupIds(groupIds: string[]): Promise<number> {
  const cards = await readCards();
  const before = cards.length;
  const filtered = cards.filter(
    (c) => c.group_id === null || !groupIds.includes(c.group_id)
  );
  await writeCards(filtered);
  return before - filtered.length;
}

export async function createCardsBulk(
  newCards: Array<{ front: string; back: string; group_id: string | null }>
): Promise<StudyCard[]> {
  const cards = await readCards();
  const created: StudyCard[] = [];
  const now = new Date().toISOString();
  for (const nc of newCards) {
    const card: StudyCard = {
      id: crypto.randomUUID(),
      front: nc.front,
      back: nc.back,
      source: null,
      group_id: nc.group_id,
      fsrs: createEmptyCard(new Date()),
      created_at: now,
      updated_at: now,
    };
    cards.push(card);
    created.push(card);
  }
  await writeCards(cards);
  return created;
}
