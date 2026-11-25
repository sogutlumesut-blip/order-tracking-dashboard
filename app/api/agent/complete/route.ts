import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDemoDb, createTestWhatsAppForDraft } from "@/lib/demo-engine";
import { verifyAgentAuth } from "@/lib/office-agent-bridge";

export async function POST(request: Request) {
  if (!(await verifyAgentAuth(request))) {
    return NextResponse.json({ error: "Geçersiz ajan anahtarı" }, { status: 401 });
  }

  const body = await request.json();
  const jobId = Number(body.jobId);
  if (!jobId) return NextResponse.json({ error: "jobId gerekli" }, { status: 400 });

  const ddb = getDemoDb();
  const job = await ddb.agentJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "İş bulunamadı" }, { status: 404 });

  if (!body.ok) {
    await ddb.agentJob.update({
      where: { id: jobId },
      data: { status: "failed", error: String(body.error || "Bilinmeyen ajan hatası") },
    });
    if (job.orderId && body.failedDraft) {
      const fd = body.failedDraft;
      await ddb.draftRecord.create({
        data: {
          orderId: job.orderId,
          version: Number(fd.version || 1),
          sku: String(fd.sku || "-"),
          dimensionsRaw: String(fd.dimensionsRaw || "-"),
          status: "failed",
          errorCode: String(fd.errorCode || "ERROR"),
          errorMessage: String(body.error || "Hata"),
          totalMs: Number(fd.totalMs || 0),
          peakRssMb: Number(fd.peakRssMb || 0),
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  let finalResult: any = body.result ?? { ok: true };

  // 1. Taslak sonucu geldiyse DraftRecord oluştur (küçük JPG'ler DB'ye yazılır ki buluttan anında görünsün)
  if (body.draftPayload && job.orderId) {
    const dp = body.draftPayload;
    const prevLatest = await ddb.draftRecord.findFirst({ where: { orderId: job.orderId }, orderBy: { version: "desc" } });
    const nextVersion = (prevLatest?.version || 0) + 1;
    const approvalToken = crypto.randomBytes(20).toString("hex");

    await ddb.draftRecord.updateMany({
      where: { orderId: job.orderId, status: { in: ["ready", "sent", "revision_requested"] } },
      data: { status: "superseded" },
    });

    const draft = await ddb.draftRecord.create({
      data: {
        orderId: job.orderId,
        version: nextVersion,
        sku: dp.sku,
        dimensionsRaw: dp.dimensionsRaw,
        width: dp.width,
        height: dp.height,
        unit: dp.unit,
        sourcePath: dp.sourcePath,
        sourceFormat: dp.sourceFormat,
        sourceWidth: dp.sourceWidth,
        sourceHeight: dp.sourceHeight,
        sourceSpace: dp.sourceSpace,
        sourceBytes: dp.sourceBytes,
        cropX: dp.cropX,
        cropY: dp.cropY,
        cropW: dp.cropW,
        cropH: dp.cropH,
        layoutMode: dp.layoutMode || "mural",
        tileConfig: dp.tileConfig || null,
        effectivePpi: dp.effectivePpi,
        outPpi: dp.outPpi,
        ppiStatus: dp.ppiStatus,
        outWidth: dp.outWidth,
        outHeight: dp.outHeight,
        proxyPath: dp.proxyPath || prevLatest?.proxyPath || null,
        previewPath: dp.previewPath || null,
        detailPath: dp.detailPath || null,
        proxyData: dp.proxyData || prevLatest?.proxyData || null,
        previewData: dp.previewData || null,
        detailData: dp.detailData || null,
        status: dp.ppiStatus === "low" ? "failed" : "ready",
        approvalToken,
        errorCode: dp.ppiStatus === "low" ? "LOW_RESOLUTION" : null,
        errorMessage: dp.ppiStatus === "low" ? `Yetersiz çözünürlük: ${Number(dp.effectivePpi || 0).toFixed(1)} PPI` : null,
        warnings: JSON.stringify(dp.warnings || []),
        findMs: dp.findMs,
        readMs: dp.readMs,
        renderMs: dp.renderMs,
        totalMs: dp.totalMs,
        peakRssMb: dp.peakRssMb,
        cpuPercent: dp.cpuPercent,
        outputBytes: dp.outputBytes,
      },
    });

    if (dp.rememberSkuMapping && dp.sku && dp.sourcePath) {
      await ddb.skuMapping.upsert({
        where: { sku: dp.sku },
        update: { filePath: dp.sourcePath, fileName: dp.sourceFileName || dp.sku, matchedBy: "office_agent" },
        create: { sku: dp.sku, filePath: dp.sourcePath, fileName: dp.sourceFileName || dp.sku, matchedBy: "office_agent" },
      });
    }

    await ddb.orderActivity.create({
      data: {
        orderId: job.orderId,
        author: dp.actor || "Ofis Ajanı",
        action: dp.ppiStatus === "low" ? "DRAFT_LOW_PPI" : "DRAFT_CREATED",
        details: `[Ofis Ajanı] Taslak v${nextVersion} (${String(dp.sourceFormat || "").toUpperCase()}, ${dp.sourceWidth}×${dp.sourceHeight}px) • ${Math.round(dp.effectivePpi || 0)} PPI • ${dp.totalMs}ms`,
      },
    });

    const jobPayload = JSON.parse(job.payload || "{}");
    let whatsappLog = null;
    if (dp.ppiStatus !== "low" && jobPayload.autoSendWhatsApp) {
      const origin = new URL(request.url).origin;
      whatsappLog = await createTestWhatsAppForDraft(job.orderId, draft.id, origin, dp.actor || "Ofis Ajanı");
    }

    // Büyük base64 verilerini job result JSON'ında tekrar etme
    const { previewData: _p, detailData: _d, proxyData: _x, ...lightDraft } = draft;
    finalResult = { ok: dp.ppiStatus !== "low", draft: lightDraft, whatsappLog };
  }

  // 2. İndeksleme sonucu geldiyse DesignIndexEntry tablosunu güncelle
  if (Array.isArray(body.indexEntries)) {
    const now = new Date();
    await ddb.designIndexEntry.deleteMany({});
    const chunkSize = 200;
    for (let i = 0; i < body.indexEntries.length; i += chunkSize) {
      const slice = body.indexEntries.slice(i, i + chunkSize).map((e: any) => ({ ...e, indexedAt: now }));
      await ddb.designIndexEntry.createMany({ data: slice, skipDuplicates: true });
    }
    await ddb.systemSetting.upsert({ where: { key: "demo_server_last_indexed_at" }, update: { value: now.toISOString() }, create: { key: "demo_server_last_indexed_at", value: now.toISOString() } });
    await ddb.systemSetting.upsert({ where: { key: "demo_server_indexed_count" }, update: { value: String(body.indexEntries.length) }, create: { key: "demo_server_indexed_count", value: String(body.indexEntries.length) } });
  }

  // 3. Baskı dosyası ofiste üretildiyse DraftRecord güncelle
  if (body.printUpdate && body.printUpdate.draftId) {
    const pu = body.printUpdate;
    const updated = await ddb.draftRecord.update({
      where: { id: Number(pu.draftId) },
      data: {
        approvedPath: pu.approvedPath || null,
        printReadyPath: pu.printReadyPath,
        printReadySha256: pu.printReadySha256,
        printReadyBytes: pu.printReadyBytes,
      },
    });
    if (job.orderId) {
      await ddb.orderActivity.create({
        data: {
          orderId: job.orderId,
          author: "Ofis Ajanı",
          action: "PRINT_READY_SAVED",
          details: `[Ofis Ajanı] Onaylı yüksek çözünürlüklü baskı dosyası ofis klasörüne kaydedildi: ${pu.printReadyPath} (${(pu.printReadyBytes / 1024 / 1024).toFixed(2)} MB)`,
        },
      });
    }
    const { previewData: _p, detailData: _d, proxyData: _x, ...light } = updated;
    finalResult = { ok: true, draft: light };
  }

  await ddb.agentJob.update({
    where: { id: jobId },
    data: { status: "done", result: JSON.stringify(finalResult) },
  });

  return NextResponse.json({ ok: true });
}
