// Test klasör yolları, güvenlik doğrulaması ve yapılandırılabilir klasör yönetimi.
// Tüm çıktı yolları DKM_DEMO veya izinli test klasörü altında tutulur; canlı baskı klasörlerine yazılamaz.

import fs from "node:fs";
import path from "node:path";
import { EngineError } from "./engine/errors.ts";

export interface DemoPaths {
  designs: string;
  previews: string;
  details: string;
  approved: string;
  printReady: string;
  cache: string;
  logs: string;
}

export const FOLDER_KEYS: { key: keyof DemoPaths; settingKey: string; sub: string; label: string; readOnly?: boolean }[] = [
  { key: "designs", settingKey: "path_designs", sub: "DESIGNS", label: "Tasarım Arşivi (Salt Okunur)", readOnly: true },
  { key: "previews", settingKey: "path_previews", sub: "PREVIEWS", label: "JPG Taslak Önizlemeleri" },
  { key: "details", settingKey: "path_details", sub: "DETAILS", label: "%100 Yakın Detay Görselleri" },
  { key: "approved", settingKey: "path_approved", sub: "APPROVED", label: "Onaylı Taslak Kayıtları" },
  { key: "printReady", settingKey: "path_print_ready", sub: "PRINT_READY", label: "Test Baskı Klasörü (Canlıya Aktarılmaz)" },
  { key: "cache", settingKey: "path_cache", sub: "CACHE", label: "Önbellek (Proxy / Ara TIFF)" },
  { key: "logs", settingKey: "path_logs", sub: "LOGS", label: "İşlem ve Test Günlükleri" },
];

export function defaultPaths(demoRoot: string): DemoPaths {
  const r = path.resolve(demoRoot);
  return {
    designs: path.join(r, "DESIGNS"),
    previews: path.join(r, "PREVIEWS"),
    details: path.join(r, "DETAILS"),
    approved: path.join(r, "APPROVED"),
    printReady: path.join(r, "PRINT_READY"),
    cache: path.join(r, "CACHE"),
    logs: path.join(r, "LOGS"),
  };
}

export function ensureDemoFolders(paths: DemoPaths) {
  for (const dir of Object.values(paths)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Çıktı klasörlerinin canlı sisteme veya tasarım arşivine yazmasını engeller
export function validateOutputPath(targetDir: string, designsDir: string, demoRoot: string): string {
  const resolved = path.resolve(targetDir);
  const resolvedDesigns = path.resolve(designsDir);
  const resolvedRoot = path.resolve(demoRoot);

  // Canlı/üretim klasörü gibi görünen yolları yasakla
  if (/(^|[/\\])(LIVE|PROD|PRODUCTION|CANLI|BASKI_CANLI)([/\\]|$)/i.test(resolved)) {
    throw new EngineError("OUTPUT_PATH_FORBIDDEN", `Güvenlik: Demo ortamı canlı baskı yoluna yazamaz: ${resolved}`);
  }
  // Tasarım arşivine asla yazma
  if (resolved === resolvedDesigns || resolved.startsWith(resolvedDesigns + path.sep)) {
    throw new EngineError("OUTPUT_PATH_FORBIDDEN", `Güvenlik: Çıktı klasörü salt-okunur tasarım arşivi içinde olamaz: ${resolved}`);
  }
  // Demo kökü veya /tmp altında olmalı
  const inDemoRoot = resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
  const inTmp = resolved.startsWith("/tmp/") || resolved.startsWith("/private/tmp/");
  if (!inDemoRoot && !inTmp) {
    throw new EngineError(
      "OUTPUT_PATH_FORBIDDEN",
      `Güvenlik: Demo çıktı klasörü yalnızca ${resolvedRoot} altında olabilir (verilen: ${resolved})`,
    );
  }
  return resolved;
}

export function appendLog(logsDir: string, fileName: string, entry: Record<string, any>) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(path.join(logsDir, fileName), line, "utf8");
  } catch {
    // log hatası işlemi durdurmaz
  }
}
