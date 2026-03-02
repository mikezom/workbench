import { promises as fs } from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "study_log.json");

interface DayGroupLog {
  new: number;
  review: number;
}

type StudyLog = Record<string, Record<string, DayGroupLog>>;

async function readLog(): Promise<StudyLog> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeLog(log: StudyLog): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(log, null, 2));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getGroupStudiedToday(
  groupId: string
): Promise<DayGroupLog> {
  const log = await readLog();
  const today = todayKey();
  return log[today]?.[groupId] ?? { new: 0, review: 0 };
}

export async function recordStudy(
  groupId: string,
  isNew: boolean
): Promise<void> {
  const log = await readLog();
  const today = todayKey();
  if (!log[today]) log[today] = {};
  if (!log[today][groupId]) log[today][groupId] = { new: 0, review: 0 };
  if (isNew) {
    log[today][groupId].new++;
  } else {
    log[today][groupId].review++;
  }
  await writeLog(log);
}
