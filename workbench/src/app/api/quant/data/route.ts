import { NextRequest, NextResponse } from "next/server";
import { getDataSummary } from "@/lib/tushare-db";
import { spawn } from "child_process";
import path from "path";

export function GET() {
  const summary = getDataSummary();
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = body.mode ?? "history";
  const dryRun = body.dry_run !== false; // default true

  const scriptPath = path.join(process.cwd(), "scripts", "tushare_fetcher.py");
  const args = ["--mode", mode];
  if (dryRun) args.push("--dry-run");
  if (body.start) args.push("--start", body.start);
  if (body.end) args.push("--end", body.end);

  try {
    const child = spawn("python3", [scriptPath, ...args], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    return NextResponse.json({
      ok: true,
      message: `Data sync started (mode=${mode}, dry_run=${dryRun})`,
      pid: child.pid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to start sync: ${err}` },
      { status: 500 }
    );
  }
}
