"use client";

/** Error from our AI routes, with whether trying again might help. */
export class ConvertError extends Error {
  constructor(message: string, public retryable: boolean, public code = "", public retryAfterMs = 0) {
    super(message);
  }
}

export type ConvertBody =
  | { mode: "page"; image: string; mimeType: string; text: string; page: number; total: number }
  | { mode: "text"; text: string; page: number; total: number };

/** Shown while we wait on a rate limit or a busy server; the process then continues by itself. */
export type WaitInfo = { message: string; until: number } | null;

/**
 * Which model the browser asks for. After 3 failed tries on the main model we switch to the
 * fallback for the rest of the run (its quota is separate), and stay there.
 */
export type AiState = { useFallback: boolean; hasFallback: boolean };
export const newAiState = (): AiState => ({ useFallback: false, hasFallback: true });

/** Free-tier limits: 3 tries per model, waiting 10, 20, 30 s (or longer if Gemini says so). */
const TRIES_PER_MODEL = 3;
const BACKOFF_MS = [10_000, 20_000, 30_000];
const MAX_WAIT_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Reply = { error?: string; code?: string; retryable?: boolean; hasFallback?: boolean; usedFallback?: boolean };

/** When the last AI request was sent (retries included), so runPool can space the next one. */
let lastRequestAt = 0;

async function postOnce<T extends Reply>(url: string, body: unknown): Promise<T> {
  let res: Response;
  lastRequestAt = Date.now();
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ConvertError("Koneksi terputus. Periksa internet lalu coba lagi.", true, "network");
  }
  const raw = await res.text();
  let data: T;
  try {
    data = JSON.parse(raw);
  } catch {
    // Platform errors (e.g. Vercel 504/413) are HTML or plain text.
    if (res.status === 413) throw new ConvertError("Data yang dikirim terlalu besar.", false);
    throw new ConvertError(res.status === 504 ? "Server kehabisan waktu." : `Server mengembalikan respons tidak terduga (HTTP ${res.status}).`, res.status >= 500 || res.status === 429);
  }
  if (res.ok && !data.error) return data;
  const retryAfter = Number(res.headers.get("Retry-After")) || 0;
  const err = new ConvertError(data.error || `Gagal (HTTP ${res.status}).`, data.retryable ?? [429, 502, 503, 504].includes(res.status), data.code ?? "", retryAfter * 1000);
  (err as ConvertError & { hasFallback?: boolean }).hasFallback = data.hasFallback;
  throw err;
}

/**
 * POSTs to an AI route with the free-tier retry policy:
 * 429/503/timeouts → wait (Retry-After, at least 10–30 s), up to 3 tries, then the fallback model.
 * A missing model (404) is switched to the fallback on the server, without retries.
 */
export async function callAi<T extends Reply>(url: string, body: object, state: AiState, onWait?: (w: WaitInfo) => void, stop?: { stopped: boolean }): Promise<T> {
  for (;;) {
    let last: ConvertError | undefined;
    for (let i = 0; i < TRIES_PER_MODEL; i++) {
      try {
        const data = await postOnce<T>(url, { ...body, useFallback: state.useFallback });
        if (data.usedFallback) state.useFallback = true;
        return data;
      } catch (e) {
        last = e instanceof ConvertError ? e : new ConvertError(String((e as Error)?.message ?? e), true);
        const hf = (last as ConvertError & { hasFallback?: boolean }).hasFallback;
        if (hf !== undefined) state.hasFallback = hf;
        if (!last.retryable || stop?.stopped || i + 1 >= TRIES_PER_MODEL) break;
        const wait = Math.min(MAX_WAIT_MS, Math.max(last.retryAfterMs, BACKOFF_MS[i])) + Math.random() * 1000;
        onWait?.({
          message: last.code === "rate_limit" ? "Kuota AI per menit habis, menunggu sebentar..." : "Server AI sedang sibuk, menunggu sebentar...",
          until: Date.now() + wait,
        });
        await sleep(wait);
        onWait?.(null);
        if (stop?.stopped) break;
      }
    }
    if (last?.retryable && !stop?.stopped && !state.useFallback && state.hasFallback) {
      state.useFallback = true; // separate quota: try the backup model
      continue;
    }
    throw last ?? new ConvertError("Gagal.", false);
  }
}

/** Converts one PDF page or text part to Markdown + LaTeX. */
export async function convertPart(body: ConvertBody, state: AiState, onWait?: (w: WaitInfo) => void, stop?: { stopped: boolean }): Promise<string> {
  const data = await callAi<Reply & { markdown?: string }>("/api/to-markdown", body, state, onWait, stop);
  if (!data.markdown) throw new ConvertError("Gemini tidak mengembalikan hasil.", true);
  return data.markdown;
}

/** Requests per minute allowed for the PDF model (from the server's env), used to space requests. */
export async function pdfPacing(): Promise<{ rpm: number; enabled: boolean }> {
  try {
    const r = await fetch("/api/to-markdown");
    const d = (await r.json()) as { rpm?: number; enabled?: boolean };
    return { rpm: d.rpm && d.rpm > 0 ? d.rpm : 5, enabled: d.enabled !== false };
  } catch {
    return { rpm: 5, enabled: true };
  }
}

/** Time between request starts for a given RPM, with ~1 s of margin (15 RPM → 5 s). */
export const gapForRpm = (rpm: number) => Math.ceil(60_000 / rpm) + 1000;

/**
 * Runs `worker` over `items` one at a time (or `concurrency` at once), starting each item at least
 * `gapMs` after the previous AI request (retries included), so the free tier's per-minute limit holds.
 */
export async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 1, gapMs = 5000, stop?: { stopped: boolean }) {
  let next = 0;
  let nextStart = 0;
  async function lane() {
    while (next < items.length && !stop?.stopped) {
      const item = items[next++];
      const startAt = Math.max(nextStart, lastRequestAt + gapMs);
      nextStart = Math.max(Date.now(), startAt) + gapMs;
      const wait = startAt - Date.now();
      if (wait > 0) await sleep(wait);
      if (stop?.stopped) return;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}
