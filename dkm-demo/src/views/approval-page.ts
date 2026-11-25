// Gerçek çalışan müşteri taslak onay sayfası (/approve/:token)
// Müşteri JPG taslağı ve %100 yakın detayı inceler; onay verir veya revizyon ister.

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function renderApprovalPage(opts: { order: any; draft: any; isCurrent: boolean; token: string }): string {
  const { order, draft, isCurrent, token } = opts;
  const previewUrl = `/api/files/preview/${draft.id}?token=${encodeURIComponent(token)}`;
  const detailUrl = `/api/files/detail/${draft.id}?token=${encodeURIComponent(token)}`;
  const isApproved = draft.status === "approved";
  const isStale = !isCurrent || draft.status === "superseded";
  const isLowPpi = draft.ppi_status === "low" || draft.status === "failed";
  const canAct = !isApproved && !isStale && !isLowPpi;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DKM Taslak Onayı — #${esc(order.order_no)} (v${esc(draft.version)})</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
    .demo-banner { background: linear-gradient(90deg, #f59e0b, #ea580c); color: #0f172a; font-weight: 800; text-align: center; padding: 8px 16px; font-size: 13px; letter-spacing: .5px; }
    .wrap { max-width: 1120px; margin: 24px auto; padding: 0 16px 48px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 20px; margin-bottom: 18px; }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .b-ok { background: #064e3b; color: #6ee7b7; border: 1px solid #10b981; }
    .b-warn { background: #78350f; color: #fde68a; border: 1px solid #f59e0b; }
    .b-err { background: #7f1d1d; color: #fca5a5; border: 1px solid #ef4444; }
    .grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    img.proof { width: 100%; border-radius: 10px; border: 1px solid #475569; background: #020617; display: block; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: 14px; }
    .meta div { background: #0f172a; padding: 10px 12px; border-radius: 10px; border: 1px solid #334155; }
    .meta small { display: block; color: #94a3b8; font-size: 11px; margin-bottom: 3px; }
    .meta strong { font-size: 14px; color: #f8fafc; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
    @media (max-width: 720px) { .actions { grid-template-columns: 1fr; } }
    input, textarea { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px; margin-bottom: 10px; }
    button { border: none; border-radius: 10px; padding: 12px 18px; font-weight: 700; font-size: 14px; cursor: pointer; width: 100%; }
    .btn-approve { background: #10b981; color: #022c22; }
    .btn-approve:hover { background: #34d399; }
    .btn-rev { background: #f59e0b; color: #451a03; }
    .btn-rev:hover { background: #fbbf24; }
    .alert { padding: 14px 16px; border-radius: 10px; font-weight: 600; margin-bottom: 14px; }
    .alert-ok { background: #064e3b; border: 1px solid #10b981; color: #a7f3d0; }
    .alert-err { background: #7f1d1d; border: 1px solid #ef4444; color: #fecaca; }
    .alert-warn { background: #78350f; border: 1px solid #f59e0b; color: #fef08a; }
    #msg { margin-top: 12px; }
  </style>
</head>
<body>
  <div class="demo-banner">⚠️ DEMO MODE — BU SAYFA TEST ORTAMIDIR • GERÇEK ÜRETİME / CANLI SİSTEME AKTARIM YAPILMAZ</div>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div>
          <h1 style="margin:0;font-size:22px;">Baskı Öncesi Taslak Onayı — #${esc(order.order_no)}</h1>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px;">Sayın ${esc(order.customer)} • ${esc(order.product_name)}</div>
        </div>
        <div>
          <span class="badge ${isApproved ? "b-ok" : isStale || isLowPpi ? "b-err" : "b-warn"}">
            Taslak v${esc(draft.version)} • ${isApproved ? "ONAYLANDI" : isStale ? "ESKİ SÜRÜM" : isLowPpi ? "YETERSİZ ÇÖZÜNÜRLÜK" : "ONAY BEKLİYOR"}
          </span>
        </div>
      </div>

      <div class="meta">
        <div><small>SKU</small><strong>${esc(order.sku)}</strong></div>
        <div><small>Sipariş Ölçüsü</small><strong>${esc(order.width)} × ${esc(order.height)} ${esc(order.unit)}</strong></div>
        <div><small>Efektif Çözünürlük</small><strong>${Math.round(draft.effective_ppi || 0)} PPI (${esc(draft.ppi_status)})</strong></div>
        <div><small>Kaynak Format</small><strong>${esc((draft.source_format || "").toUpperCase())} (${esc(draft.source_width)}×${esc(draft.source_height)}px)</strong></div>
        <div><small>Malzeme</small><strong>${esc(order.material || "-")}</strong></div>
      </div>
    </div>

    ${isApproved ? `<div class="alert alert-ok">✅ Bu taslak (v${esc(draft.version)}) ${esc(draft.approved_by_name || "")} tarafından ${esc(draft.approved_at || "")} tarihinde onaylandı. Test baskı dosyası DKM_DEMO/PRINT_READY klasörüne kaydedilmektedir.</div>` : ""}
    ${isStale ? `<div class="alert alert-err">⛔ Bu onay bağlantısı eski bir taslak sürümüne (v${esc(draft.version)}) aittir. Güncel sürüm v${esc(order.draft_version)} olduğundan bu bağlantı üzerinden onay verilemez.</div>` : ""}
    ${isLowPpi ? `<div class="alert alert-err">⛔ Bu taslağın çözünürlüğü baskı için yetersizdir (${Math.round(draft.effective_ppi || 0)} PPI). Onay devre dışıdır.</div>` : ""}

    <div class="grid">
      <div class="card">
        <h3 style="margin-top:0;">1. Genel Taslak Önizlemesi (Ölçüye Göre Kırpılmış)</h3>
        <img class="proof" src="${previewUrl}" alt="Taslak Önizleme" />
      </div>
      <div class="card">
        <h3 style="margin-top:0;">2. %100 Yakın Baskı Detayı (Gerçek Piksel)</h3>
        <img class="proof" src="${detailUrl}" alt="%100 Detay" />
        <p style="font-size:12px;color:#94a3b8;margin-bottom:0;">Bu görsel, baskı dosyasındaki gerçek piksellerin %100 yakın çekimidir.</p>
      </div>
    </div>

    ${canAct ? `
    <div class="card">
      <h3 style="margin-top:0;">Onay veya Revizyon Kararı</h3>
      <div class="actions">
        <div style="background:#0f172a;padding:16px;border-radius:12px;border:1px solid #065f46;">
          <h4 style="margin:0 0 8px;color:#6ee7b7;">Taslağı Onayla</h4>
          <p style="font-size:13px;color:#94a3b8;margin-top:0;">Ölçü, kadraj ve %100 baskı detayını inceledim, üretime alınmasını onaylıyorum.</p>
          <input id="approverName" placeholder="Adınız Soyadınız" value="${esc(order.customer)}" />
          <button class="btn-approve" id="btnApprove">✅ Taslağı Onayla (v${esc(draft.version)})</button>
        </div>
        <div style="background:#0f172a;padding:16px;border-radius:12px;border:1px solid #92400e;">
          <h4 style="margin:0 0 8px;color:#fde68a;">Revizyon İste</h4>
          <textarea id="revNote" rows="3" placeholder="Örn: Deseni biraz sola kaydırabilir miyiz?"></textarea>
          <button class="btn-rev" id="btnRev">✏️ Revizyon Talebi Gönder</button>
        </div>
      </div>
      <div id="msg"></div>
    </div>` : ""}
  </div>

  <script>
    const token = ${JSON.stringify(token)};
    const msg = document.getElementById('msg');
    const btnApprove = document.getElementById('btnApprove');
    const btnRev = document.getElementById('btnRev');
    if (btnApprove) {
      btnApprove.onclick = async () => {
        btnApprove.disabled = true;
        msg.innerHTML = '<div class="alert alert-warn">Onay kaydediliyor ve test baskı dosyası hazırlanıyor...</div>';
        const r = await fetch('/api/approve/' + token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerName: document.getElementById('approverName').value })
        });
        const d = await r.json();
        if (r.ok) {
          msg.innerHTML = '<div class="alert alert-ok">✅ Onayınız alındı! Sipariş "Onaylandı" durumuna taşındı ve yüksek çözünürlüklü test baskı dosyası kuyruğa eklendi. Sayfa yenileniyor...</div>';
          setTimeout(() => location.reload(), 1200);
        } else {
          btnApprove.disabled = false;
          msg.innerHTML = '<div class="alert alert-err">❌ ' + (d.error || 'Hata oluştu') + '</div>';
        }
      };
    }
    if (btnRev) {
      btnRev.onclick = async () => {
        const note = document.getElementById('revNote').value.trim();
        if (!note) { msg.innerHTML = '<div class="alert alert-err">Lütfen revizyon açıklamasını yazın.</div>'; return; }
        btnRev.disabled = true;
        const r = await fetch('/api/approve/' + token + '/revision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note })
        });
        const d = await r.json();
        if (r.ok) {
          msg.innerHTML = '<div class="alert alert-warn">✏️ Revizyon talebiniz iletildi. Sipariş "Taslak" aşamasına geri alındı.</div>';
          setTimeout(() => location.reload(), 1200);
        } else {
          btnRev.disabled = false;
          msg.innerHTML = '<div class="alert alert-err">❌ ' + (d.error || 'Hata oluştu') + '</div>';
        }
      };
    }
  </script>
</body>
</html>`;
}
