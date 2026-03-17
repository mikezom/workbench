import { NextRequest, NextResponse } from "next/server";
import { listStrategies, createStrategy } from "@/lib/quant-db";

export function GET() {
  const strategies = listStrategies();
  return NextResponse.json(strategies);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, factors, model_type, hyperparams, universe } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!factors || !Array.isArray(factors) || factors.length === 0) {
    return NextResponse.json({ error: "at least one factor is required" }, { status: 400 });
  }
  if (!model_type) {
    return NextResponse.json({ error: "model_type is required" }, { status: 400 });
  }

  const strategy = createStrategy({
    name: name.trim(),
    description: description?.trim(),
    factors,
    model_type,
    hyperparams,
    universe,
  });
  return NextResponse.json(strategy, { status: 201 });
}
