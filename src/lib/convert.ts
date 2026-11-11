"use client";

/** Error from /api/to-markdown, with whether trying again might help. */
export class ConvertError extends Error {
  constructor(message: string, public retryable: boolean, public code = "", public retryAfterMs = 0) {
    super(message);
  }
}

export type ConvertBody =
  | { mode: "page"; image: string; mimeType: string; text: string; page: number; total: number }
  | { mode: "text"; text: string; page: number; total: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(body: ConvertBody): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/to-markdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ConvertError("Koneksi terputus. Periksa internet lalu coba lagi.", true);
  }
  const raw = await res.text();
  let data: { markdown?: string; error?: string; code?: string; retryable?: boolean } = {};
  try {
    data = JSON.parse(raw);
  } catch {
    // Platform errors (e.g. Vercel 504/413) are HTML or plain text.
    if (res.status === 413) throw new ConvertError("Gambar halaman terlalu besar untuk dikirim.", false);
    throw new ConvertError(res.status === 504 ? "Server kehabisan waktu." : `Server mengembalikan respons tidak terduga (HTTP ${res.status}).`, res.status >= 500 || res.status === 429);
  }
  if (res.ok && data.markdown) return data.markdown;
  const retryAfter = Number(res.headers.get("Retry-After")) || 0;
  throw new ConvertError(data.error || `Gagal (HTTP ${res.status}).`, data.retryable ?? [429, 502, 503, 504].includes(res.status), data.code ?? "", retryAfter * 1000);
}

/** Converts one page/part, retrying with backoff on 429/5xx/timeouts. */
export async function convertWithRetry(body: ConvertBody, onWait?: (msg: string) => void, stop?: { stopped: boolean }, attempts = 3): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      return await callOnce(body);
    } catch (e) {
      const err = e instanceof ConvertError ? e : new ConvertError(String((e as Error)?.message ?? e), true);
      if (!err.retryable || i + 1 >= attempts || stop?.stopped) throw err;
      const wait = Math.min(60_000, Math.max(err.retryAfterMs, 5000 * 3 ** i)) + Math.random() * 1000;
      onWait?.(`menunggu ${Math.round(wait / 1000)} detik lalu mencoba lagi`);
      await sleep(wait);
    }
  }
}

/**
 * Runs `worker` over `items` with at most `concurrency` at once, and at least `gapMs`
 * between starts (Gemini free tier allows only ~10 requests per minute).
 */
export async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 2, gapMs = 6000, stop?: { stopped: boolean }) {
  let next = 0;
  let nextStart = 0;
  async function lane() {
    while (next < items.length && !stop?.stopped) {
      const item = items[next++];
      const wait = nextStart - Date.now();
      nextStart = Math.max(Date.now(), nextStart) + gapMs;
      if (wait > 0) await sleep(wait);
      if (stop?.stopped) return;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}
