// Bulut (dkmtakip.online) <-> Ofis Worker Ajanı köprüsü
// Ofis içindeki Windows Server dosyalarına güvenli outbound HTTPS ile erişim sağlar.

import crypto from "node:crypto";
import { getDemoDb, getDemoSettingsMap } from "@/lib/demo-engine";

export async function getOrCreateAgentToken(): Promise<string> {
  const ddb = getDemoDb();
  const row = await ddb.systemSetting.findUnique({ where: { key: "dkm_agent_token" } });
  if (row?.value && row.value.length >= 32) return row.value;
  const token = crypto.randomBytes(24).toString("hex");
  await ddb.systemSetting.upsert({
    where: { key: "dkm_agent_token" },
    update: { value: token },
    create: { key: "dkm_agent_token", value: token },
  });
  return token;
}

export async function verifyAgentAuth(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const provided = auth.slice(7).trim();
  const expected = await getOrCreateAgentToken();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function getOfficeAgentStatus() {
  const s = await getDemoSettingsMap();
  const lastSeen = s.dkm_agent_last_seen ? new Date(s.dkm_agent_last_seen).getTime() : 0;
  const online = lastSeen > 0 && Date.now() - lastSeen < 25_000;
  return {
    online,
    lastSeenAt: s.dkm_agent_last_seen || null,
    hostname: s.dkm_agent_hostname || null,
    agentServerPath: s.dkm_agent_server_path || null,
  };
}

export async function dispatchToOfficeAgent(
  type: "test_connection" | "index_server" | "search_sku" | "generate_draft" | "generate_print",
  payload: Record<string, any>,
  opts: { orderId?: number; timeoutMs?: number; wait?: boolean } = {},
) {
  const ddb = getDemoDb();
  const job = await ddb.agentJob.create({
    data: {
      type,
      status: "queued",
      orderId: opts.orderId ?? null,
      payload: JSON.stringify(payload || {}),
    },
  });

  if (opts.wait === false) {
    return { ok: true, queued: true, jobId: job.id };
  }

  const timeoutMs = opts.timeoutMs ?? 55_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    const cur = await ddb.agentJob.findUnique({ where: { id: job.id } });
    if (!cur) throw new Error("Ajan işi kayboldu");
    if (cur.status === "done") {
      return cur.result ? JSON.parse(cur.result) : { ok: true };
    }
    if (cur.status === "failed") {
      const err: any = new Error(cur.error || "Ofis ajanı işlemi başarısız oldu");
      err.code = "AGENT_ERROR";
      throw err;
    }
  }
  throw new Error("Ofis ajanı zaman aşımına uğradı (iş arka planda devam ediyor olabilir).");
}
