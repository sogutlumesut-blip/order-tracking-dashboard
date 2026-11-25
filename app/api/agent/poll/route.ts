import { NextResponse } from "next/server";
import { getDemoDb, getDemoSettingsMap } from "@/lib/demo-engine";
import { verifyAgentAuth } from "@/lib/office-agent-bridge";
import { getValidGoogleDriveAccessToken } from "@/lib/google-drive-auth";

export async function GET(request: Request) {
  if (!(await verifyAgentAuth(request))) {
    return NextResponse.json({ error: "Geçersiz ajan anahtarı" }, { status: 401 });
  }

  const ddb = getDemoDb();
  const url = new URL(request.url);
  const hostname = url.searchParams.get("hostname") || "office-agent";
  const agentPath = url.searchParams.get("serverPath") || "";
  const nowIso = new Date().toISOString();

  await Promise.all([
    ddb.systemSetting.upsert({ where: { key: "dkm_agent_last_seen" }, update: { value: nowIso }, create: { key: "dkm_agent_last_seen", value: nowIso } }),
    ddb.systemSetting.upsert({ where: { key: "dkm_agent_hostname" }, update: { value: hostname }, create: { key: "dkm_agent_hostname", value: hostname } }),
    agentPath
      ? ddb.systemSetting.upsert({ where: { key: "dkm_agent_server_path" }, update: { value: agentPath }, create: { key: "dkm_agent_server_path", value: agentPath } })
      : Promise.resolve(),
  ]);

  if (url.searchParams.get("heartbeatOnly") === "1") {
    return NextResponse.json({ ok: true, heartbeat: true });
  }

  // Öncelik: anlık kullanıcı işleri (taslak, arama, bağlantı testi, baskı) uzun indeksleme işinin önünde çalışsın
  const job =
    (await ddb.agentJob.findFirst({
      where: { status: "queued", type: { not: "index_server" } },
      orderBy: { id: "asc" },
    })) ||
    (await ddb.agentJob.findFirst({
      where: { status: "queued" },
      orderBy: { id: "asc" },
    }));
  if (!job) {
    return NextResponse.json({ ok: true, job: null });
  }

  const claimed = await ddb.agentJob.updateMany({
    where: { id: job.id, status: "queued" },
    data: { status: "running", agentId: hostname },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ ok: true, job: null });
  }

  const settings = await getDemoSettingsMap();
  let order = null;
  let latestDraft = null;
  if (job.orderId) {
    order = await ddb.order.findUnique({ where: { id: job.orderId }, include: { items: true } });
    latestDraft = await ddb.draftRecord.findFirst({ where: { orderId: job.orderId }, orderBy: { version: "desc" } });
  }

  const skuMappings = await ddb.skuMapping.findMany();
  const gdriveAccessToken = job.type === "generate_draft" ? await getValidGoogleDriveAccessToken() : null;

  return NextResponse.json({
    ok: true,
    job: { ...job, payload: JSON.parse(job.payload || "{}") },
    settings: {
      serverPath: settings.demo_server_designs_path || agentPath || "",
      minPpi: Number(settings.demo_min_ppi || 45),
      warnPpi: Number(settings.demo_warn_ppi || 72),
      printPpiMax: Number(settings.demo_print_ppi_max || 150),
      maxFileGb: Number(settings.demo_max_file_gb || 12),
      gdriveAccessToken,
    },
    order,
    latestDraft,
    skuMappings,
  });
}
