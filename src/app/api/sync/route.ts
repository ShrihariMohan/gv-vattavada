import { NextRequest, NextResponse } from "next/server";

/** Optional cloud sync endpoint. Local Dexie remains the first write. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  return NextResponse.json({
    results: items.map((item: { entity_id?: string }) => ({
      entity_id: item.entity_id,
      server_id: item.entity_id ? `srv-${item.entity_id}` : null,
      status: "SYNCED",
    })),
  });
}
