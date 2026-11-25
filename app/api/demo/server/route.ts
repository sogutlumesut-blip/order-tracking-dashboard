import { NextResponse } from "next/server";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import {
  DEMO_ROOT,
  getDemoDb,
  getDemoPaths,
  getDemoSettingsMap,
  indexServerDesigns,
  searchDesignBySkuOnServer,
  testServerConnection,
} from "@/lib/demo-engine";
import { validateOutputPath } from "@/dkm-demo/src/paths.ts";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku");
  if (sku) {
    try {
      const res = await searchDesignBySkuOnServer(sku);
      return NextResponse.json(res);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "Arama hatası" }, { status: 400 });
    }
  }

  const s = await getDemoSettingsMap();
  const paths = await getDemoPaths();
  const ddb = getDemoDb();
  const indexedCount = await ddb.designIndexEntry.count();
  return NextResponse.json({
    ok: true,
    serverPath: s.demo_server_designs_path || "",
    lastIndexedAt: s.demo_server_last_indexed_at || null,
    indexedCount,
    paths,
    settings: {
      minPpi: s.demo_min_ppi || "45",
      warnPpi: s.demo_warn_ppi || "72",
      printPpiMax: s.demo_print_ppi_max || "150",
      maxFileGb: s.demo_max_file_gb || "12",
      livePromotionStatus: s.demo_live_promotion_status || "locked",
      livePromotionNote: s.demo_live_promotion_note || "",
      livePromotionBy: s.demo_live_promotion_by || "",
      livePromotionAt: s.demo_live_promotion_at || "",
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "test") {
    const res = await testServerConnection(String(body.serverPath || ""));
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === "index") {
    if (session.user.role !== "admin") return NextResponse.json({ error: "Yalnızca yönetici indeksleme başlatabilir" }, { status: 403 });
    try {
      if (body.serverPath !== undefined) {
        const ddb = getDemoDb();
        await ddb.systemSetting.upsert({
          where: { key: "demo_server_designs_path" },
          update: { value: String(body.serverPath).trim() },
          create: { key: "demo_server_designs_path", value: String(body.serverPath).trim() },
        });
      }
      const res = await indexServerDesigns(body.serverPath);
      return NextResponse.json(res);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "İndeksleme hatası" }, { status: 400 });
    }
  }

  if (action === "save") {
    if (session.user.role !== "admin") return NextResponse.json({ error: "Yalnızca yönetici ayarları değiştirebilir" }, { status: 403 });
    const ddb = getDemoDb();
    const serverPath = String(body.serverPath ?? "").trim();
    const updates: Record<string, string> = {
      demo_server_designs_path: serverPath,
    };

    const outputKeys: [string, string][] = [
      ["previews", "demo_path_previews"],
      ["details", "demo_path_details"],
      ["approved", "demo_path_approved"],
      ["printReady", "demo_path_print_ready"],
      ["cache", "demo_path_cache"],
      ["logs", "demo_path_logs"],
    ];
    for (const [field, settingKey] of outputKeys) {
      if (body.paths?.[field]) {
        const rawOut = path.resolve(String(body.paths[field]));
        const validated = isDemoMode()
          ? validateOutputPath(rawOut, serverPath || path.join(DEMO_ROOT, "DESIGNS"), DEMO_ROOT)
          : rawOut;
        updates[settingKey] = validated;
      }
    }
    if (body.minPpi) updates.demo_min_ppi = String(body.minPpi);
    if (body.warnPpi) updates.demo_warn_ppi = String(body.warnPpi);
    if (body.printPpiMax) updates.demo_print_ppi_max = String(body.printPpiMax);
    if (body.maxFileGb) updates.demo_max_file_gb = String(body.maxFileGb);

    for (const [key, value] of Object.entries(updates)) {
      await ddb.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    return NextResponse.json({ ok: true, message: "Server ve demo klasör ayarları kaydedildi." });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
