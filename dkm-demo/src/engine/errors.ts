// Motor hata kodları. Her hata kullanıcıya açık mesajla gösterilir; sahte başarı yoktur.

export const ERROR_CODES = {
  INVALID_SKU: "Geçersiz / yanlış SKU",
  DESIGN_NOT_FOUND: "Tasarım dosyası bulunamadı",
  MULTIPLE_MATCH: "Birden fazla tasarım dosyası eşleşti",
  UNSUPPORTED_FORMAT: "Desteklenmeyen dosya biçimi",
  CORRUPT_FILE: "Dosya bozuk veya güvenilir biçimde okunamıyor",
  NO_COMPOSITE: "PSD/PSB birleşik görüntü içermiyor (Maximize Compatibility kapalı)",
  FILE_TOO_LARGE: "Dosya yapılandırılmış sınırdan büyük",
  INVALID_DIMENSIONS: "Geçersiz sipariş ölçüsü",
  INVALID_CROP: "Geçersiz kırpma alanı",
  SOURCE_UNAVAILABLE: "Tasarım sunucusuna / klasörüne erişilemiyor",
  NOT_APPROVED: "Onaylanmamış taslak için baskı dosyası üretilemez",
  STALE_VERSION: "Taslak sürümü güncel değil",
  OUTPUT_PATH_FORBIDDEN: "Çıktı yolu güvenlik kuralını ihlal ediyor",
  WORKER_CRASH: "Worker beklenmedik şekilde kapandı",
  INTERNAL: "Beklenmeyen motor hatası",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const RETRYABLE: ErrorCode[] = ["SOURCE_UNAVAILABLE", "WORKER_CRASH", "INTERNAL"];

export class EngineError extends Error {
  code: ErrorCode;
  details: any;
  constructor(code: ErrorCode, message?: string, details?: any) {
    super(message || ERROR_CODES[code]);
    this.code = code;
    this.details = details;
  }
  get retryable() {
    return RETRYABLE.includes(this.code);
  }
}

export function toEngineError(e: any): EngineError {
  if (e instanceof EngineError) return e;
  if (e?.code && e.code in ERROR_CODES) return new EngineError(e.code as ErrorCode, e.message);
  const msg = String(e?.message || e);
  const code = e?.code as string | undefined;
  if (code && ["ENOENT", "EIO", "EHOSTDOWN", "EHOSTUNREACH", "ETIMEDOUT", "ENOTCONN", "ECONNRESET", "ESTALE", "ENETUNREACH", "EACCES", "EPERM"].includes(code)) {
    return new EngineError("SOURCE_UNAVAILABLE", `${ERROR_CODES.SOURCE_UNAVAILABLE}: ${msg}`);
  }
  if (/premature end|truncated|corrupt|bad (huffman|seek)|Read error|not a known file format|unsupported image format|Input file contains unsupported image format|Input buffer contains unsupported|IHDR|TIFFFetch|TIFFRead|invalid|VipsJpeg|vipspng|tiff2vips|libspng|pngload|jpegload|tiffload/i.test(msg)) {
    return new EngineError("CORRUPT_FILE", `${ERROR_CODES.CORRUPT_FILE}: ${msg}`);
  }
  return new EngineError("INTERNAL", msg);
}
