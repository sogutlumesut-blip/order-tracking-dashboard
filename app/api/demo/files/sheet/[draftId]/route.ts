// Birleşik Müşteri Sunum Kartı (Ölçülü Taslak + %100 Çözünürlük Detayı bir arada)
// Referans krem/fildişi lüks mimari sunum tasarımında tek bir yüksek kaliteli JPG üretir.

import fs from "node:fs";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDemoDb } from "@/lib/demo-engine";
import { UNIT_TO_INCH } from "@/dkm-demo/src/engine/units";
import type { Unit } from "@/dkm-demo/src/engine/units.ts";

function esc(t: string) {
  return String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function fmtBothUnits(val: number, unit: string): string {
  const u = (unit || "cm").toLowerCase() as Unit;
  const inches = val * (UNIT_TO_INCH[u] || 1 / 2.54);
  const cm = inches * 2.54;
  const f = (n: number) => (Math.round(n * 10) / 10).toString();
  if (u === "in") return `${f(val)} in (${Math.round(cm)} cm)`;
  if (u === "ft") return `${f(val)} ft (${Math.round(cm)} cm)`;
  return `${f(val)} ${u} (${f(inches)} in)`;
}

async function loadBuf(filePath: string | null | undefined, base64: string | null | undefined): Promise<Buffer | null> {
  if (filePath && !filePath.startsWith("db:") && fs.existsSync(filePath)) {
    return fs.promises.readFile(filePath);
  }
  if (base64) return Buffer.from(base64, "base64");
  return null;
}

export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params;
  const id = Number(draftId);
  if (!id) return NextResponse.json({ error: "Geçersiz draftId" }, { status: 400 });

  const ddb = getDemoDb();
  const draft = await ddb.draftRecord.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Taslak bulunamadı" }, { status: 404 });

  const token = new URL(request.url).searchParams.get("token");
  if (!token || token !== draft.approvalToken) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  const order = await ddb.order.findUnique({ where: { id: draft.orderId }, include: { items: true } });
  const prevBuf = await loadBuf(draft.previewPath, draft.previewData);
  const proxyBuf = await loadBuf(draft.proxyPath, draft.proxyData);
  const detBuf = await loadBuf(draft.detailPath, draft.detailData);
  if (!prevBuf && !proxyBuf) return NextResponse.json({ error: "Taslak görseli bulunamadı" }, { status: 404 });

  // Tuval: 1600 x 1160 px sıcak fildişi/krem lüks sunum sayfası
  const W = 1600;
  const H = 1160;
  const BG = "#f7f3eb";

  // Sol alan: ölçülü ana taslak (filigransız temiz proxy varsa doğrudan ondan kırp, yoksa prevBuf'tan alt şeridi temizle)
  const leftMaxW = 800;
  const leftMaxH = 740;
  let prevPipe: sharp.Sharp | null = null;
  if (proxyBuf && draft.layoutMode !== "seamless" && draft.cropJson && draft.sourceWidth && draft.sourceHeight) {
    try {
      const crop = JSON.parse(draft.cropJson) as { x: number; y: number; w: number; h: number };
      const pm = await sharp(proxyBuf).metadata();
      if (pm.width && pm.height && crop.w > 0 && crop.h > 0) {
        const sx = pm.width / draft.sourceWidth;
        const sy = pm.height / draft.sourceHeight;
        const left = Math.max(0, Math.min(pm.width - 1, Math.round(crop.x * sx)));
        const top = Math.max(0, Math.min(pm.height - 1, Math.round(crop.y * sy)));
        const width = Math.max(1, Math.min(pm.width - left, Math.round(crop.w * sx)));
        const height = Math.max(1, Math.min(pm.height - top, Math.round(crop.h * sy)));
        prevPipe = sharp(proxyBuf).extract({ left, top, width, height });
      }
    } catch {
      prevPipe = null;
    }
  }
  if (!prevPipe && prevBuf) {
    const prevMeta = await sharp(prevBuf).metadata();
    prevPipe = sharp(prevBuf);
    if (prevMeta.width && prevMeta.height && prevMeta.height > 120) {
      const approxH = Math.round(prevMeta.height / 1.035);
      const barH = Math.max(34, Math.round(Math.max(prevMeta.width, approxH) * 0.035)) + 2;
      if (prevMeta.height - barH > 80) {
        prevPipe = prevPipe.extract({ left: 0, top: 0, width: prevMeta.width, height: prevMeta.height - barH });
      }
    }
  }
  if (!prevPipe && proxyBuf) prevPipe = sharp(proxyBuf);

  const prevResized = await prevPipe!
    .resize(leftMaxW, leftMaxH, { fit: "inside" })
    .toColourspace("srgb")
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });

  const pw = prevResized.info.width;
  const ph = prevResized.info.height;
  // Sol kutu içinde ortala (solda 110px ölçü çizgisi payı bırak)
  const leftAreaX = 115;
  const leftAreaW = 820;
  const prevX = Math.round(leftAreaX + (leftAreaW - pw) / 2);
  const prevY = Math.round(185 + (leftMaxH - ph) / 2);

  // Sağ alan: %100 yakın çözünürlük detayı (500 x 440, alt koyu 30px şeridi temizleyerek)
  const rightX = 1005;
  const detMaxW = 510;
  const detMaxH = 440;
  let detComp: { input: Buffer; left: number; top: number } | null = null;
  let dw = detMaxW;
  let dh = 360;
  if (detBuf) {
    const dm = await sharp(detBuf).metadata();
    let detPipe = sharp(detBuf);
    if (dm.width && dm.height && dm.height > 80) {
      detPipe = detPipe.extract({ left: 0, top: 0, width: dm.width, height: dm.height - 32 });
    }
    const detResized = await detPipe
      .resize(detMaxW, detMaxH, { fit: "inside" })
      .toColourspace("srgb")
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    dw = detResized.info.width;
    dh = detResized.info.height;
    detComp = { input: detResized.data, left: rightX + Math.round((detMaxW - dw) / 2), top: 245 };
  }

  const wLabel = fmtBothUnits(Number(draft.width || 0), draft.unit || "cm");
  const hLabel = fmtBothUnits(Number(draft.height || 0), draft.unit || "cm");
  const item = order?.items?.[0];
  const material = item?.material || "";
  const titleText = "WALLPAPER PRINT PREVIEW";
  const subText = [
    `#${order?.barcode || order?.id}`,
    draft.sku,
    material,
    `${draft.width} × ${draft.height} ${draft.unit === "in" ? "in" : draft.unit}`,
    draft.layoutMode === "seamless" ? "Seamless Repeat" : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  const effPpi = Math.round(Number(draft.effectivePpi || 0));
  const ppiColor = draft.ppiStatus === "ok" ? "#166534" : draft.ppiStatus === "warn" ? "#92400e" : "#991b1b";
  const ppiBg = draft.ppiStatus === "ok" ? "#dcfce7" : draft.ppiStatus === "warn" ? "#fef3c7" : "#fee2e2";
  const ppiLabel =
    draft.ppiStatus === "ok"
      ? `${effPpi} PPI — Yüksek Baskı Kalitesi`
      : draft.ppiStatus === "warn"
      ? `${effPpi} PPI — Kabul Edilebilir Kalite`
      : `${effPpi} PPI — Düşük Çözünürlük`;

  // Ölçü çizgisi koordinatları
  const vLineX = prevX - 36;
  const hLineY = prevY + ph + 34;
  const detBoxY = 245;
  const detInfoY = detBoxY + dh + 36;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="#d6cfc2" stroke-width="1.5"/>

    <!-- Header -->
    <text x="${W / 2}" y="92" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="42" letter-spacing="3" fill="#292524">${esc(titleText)}</text>
    <text x="${W / 2}" y="132" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="#57534e">${esc(subText)}</text>
    <line x1="120" y1="154" x2="${W - 120}" y2="154" stroke="#d6cfc2" stroke-width="1"/>

    <!-- Sol: Ana Görsel Çerçeve & Ölçü Çizgileri -->
    <rect x="${prevX - 2}" y="${prevY - 2}" width="${pw + 4}" height="${ph + 4}" fill="none" stroke="#a8a29e" stroke-width="1.5"/>

    <!-- Dikey Ölçü Çizgisi (Yükseklik) -->
    <line x1="${vLineX}" y1="${prevY}" x2="${vLineX}" y2="${prevY + ph}" stroke="#78716c" stroke-width="1.5"/>
    <line x1="${vLineX - 8}" y1="${prevY}" x2="${vLineX + 8}" y2="${prevY}" stroke="#78716c" stroke-width="1.5"/>
    <line x1="${vLineX - 8}" y1="${prevY + ph}" x2="${vLineX + 8}" y2="${prevY + ph}" stroke="#78716c" stroke-width="1.5"/>
    <text x="${vLineX - 16}" y="${prevY + ph / 2}" text-anchor="middle" transform="rotate(-90 ${vLineX - 16} ${prevY + ph / 2})" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="#292524">${esc(hLabel)}</text>

    <!-- Yatay Ölçü Çizgisi (Genişlik) -->
    <line x1="${prevX}" y1="${hLineY}" x2="${prevX + pw}" y2="${hLineY}" stroke="#78716c" stroke-width="1.5"/>
    <line x1="${prevX}" y1="${hLineY - 8}" x2="${prevX}" y2="${hLineY + 8}" stroke="#78716c" stroke-width="1.5"/>
    <line x1="${prevX + pw}" y1="${hLineY - 8}" x2="${prevX + pw}" y2="${hLineY + 8}" stroke="#78716c" stroke-width="1.5"/>
    <text x="${prevX + pw / 2}" y="${hLineY + 30}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="#292524">${esc(wLabel)}</text>

    <!-- Sağ: %100 Çözünürlük Detay Paneli -->
    <rect x="${rightX - 18}" y="185" width="${detMaxW + 36}" height="${H - 270}" rx="12" fill="#efe9dd" stroke="#d6cfc2" stroke-width="1.5"/>
    <text x="${rightX + detMaxW / 2}" y="222" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="21" letter-spacing="1.5" fill="#292524">100% PRINT RESOLUTION DETAIL</text>
    <rect x="${rightX + Math.round((detMaxW - dw) / 2) - 2}" y="${detBoxY - 2}" width="${dw + 4}" height="${dh + 4}" fill="none" stroke="#78716c" stroke-width="1.5"/>

    <!-- Çözünürlük & Bilgi Kartı -->
    <rect x="${rightX + 12}" y="${detInfoY}" width="${detMaxW - 24}" height="46" rx="8" fill="${ppiBg}" stroke="${ppiColor}" stroke-width="1"/>
    <text x="${rightX + detMaxW / 2}" y="${detInfoY + 29}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="18" fill="${ppiColor}">${esc(ppiLabel)}</text>

    <text x="${rightX + 16}" y="${detInfoY + 84}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#44403c">Kaynak Format: ${esc(String(draft.sourceFormat || "").toUpperCase())} (${draft.sourceWidth || "?"} × ${draft.sourceHeight || "?"} px)</text>
    <text x="${rightX + 16}" y="${detInfoY + 114}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#44403c">Baskı Ölçüsü: ${esc(wLabel)} × ${esc(hLabel)}</text>
    <text x="${rightX + 16}" y="${detInfoY + 144}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#44403c">Taslak Sürümü: v${draft.version} • ${draft.layoutMode === "seamless" ? "Takipli (Seamless)" : "Mural"}</text>
    <text x="${rightX + 16}" y="${detInfoY + 184}" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="15" fill="#78716c">Sağdaki görsel, baskı dosyasındaki gerçek piksellerin</text>
    <text x="${rightX + 16}" y="${detInfoY + 206}" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="15" fill="#78716c">%100 yakın baskı netliği önizlemesidir.</text>

    <!-- Alt Not -->
    <text x="${W / 2}" y="${H - 46}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="16" fill="#78716c">Actual print proportions &amp; 100% pixel resolution proof for customer approval • DKM</text>
  </svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: prevResized.data, top: prevY, left: prevX },
  ];
  if (detComp) composites.push(detComp);

  const outBuf = await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
    .composite(composites)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-store",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="DKM_Taslak_${order?.barcode || order?.id}_v${draft.version}.jpg"`;
  }
  return new NextResponse(new Uint8Array(outBuf), { status: 200, headers });
}
