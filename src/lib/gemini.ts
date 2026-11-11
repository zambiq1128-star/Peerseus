import { ApiError, GoogleGenAI, ThinkingLevel, type ContentListUnion, type GenerateContentConfig, type ThinkingConfig } from "@google/genai";

/** Gemini tasks, each with its own model so they don't share one per-minute quota. */
export type Task = "pdf" | "quiz";

const env = (k: string) => process.env[k]?.trim() || "";
/** GEMINI_MODEL: quizzes. GEMINI_PDF_MODEL: PDF pages and "Rapikan dengan AI" (falls back to GEMINI_MODEL). */
export function modelFor(task: Task): string {
  const main = env("GEMINI_MODEL") || "gemini-2.5-flash";
  return task === "pdf" ? env("GEMINI_PDF_MODEL") || main : main;
}
/** GEMINI_FALLBACK_MODEL: backup for every task. Empty = no fallback. */
export function fallbackModel(): string {
  return env("GEMINI_FALLBACK_MODEL");
}

/** Error with an HTTP status and a message that is safe to show to the user. */
export class GeminiError extends Error {
  model?: string;
  constructor(public status: number, message: string, public code = "gemini", public retryAfterSec?: number) {
    super(message);
  }
}

/**
 * Thinking makes these tasks slow without improving them, so use the lowest setting each model family accepts:
 * - Gemini 2.5 uses `thinkingBudget` (0 = off; 2.5 Pro cannot turn it off, 128 is its minimum).
 * - Gemini 3 and newer use `thinkingLevel`. Not every model accepts MINIMAL (gemini-3.8-flash rejects it), so use LOW.
 * - Older models (2.0, 1.5) have no thinking settings.
 */
export function lowThinking(model: string): ThinkingConfig | undefined {
  const m = model.toLowerCase();
  if (/gemini-2\.5-pro/.test(m)) return { thinkingBudget: 128 };
  if (/gemini-2\.5/.test(m)) return { thinkingBudget: 0 };
  if (/gemini-([3-9]|\d{2,})/.test(m)) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

/** A 400 caused by the thinking settings, e.g. "Thinking level MINIMAL is not supported for this model". */
function isThinkingError(e: GeminiError) {
  return e.status === 400 && /thinking/i.test(e.message);
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function retryAfterOf(e: unknown): number | undefined {
  const m = String((e as Error)?.message ?? "").match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/);
  return m ? Math.ceil(Number(m[1])) : undefined;
}

function toGeminiError(e: unknown, timedOut: boolean): GeminiError {
  if (e instanceof GeminiError) return e;
  if (timedOut) return new GeminiError(504, "timeout", "timeout");
  if (e instanceof ApiError) return new GeminiError(e.status, e.message, "gemini", retryAfterOf(e));
  const msg = String((e as Error)?.message ?? e);
  if (/abort|timeout|timed out/i.test(msg)) return new GeminiError(504, msg, "timeout");
  // fetch failed, ECONNRESET, etc.
  return new GeminiError(503, msg, "network");
}


/** Models that rejected our thinking settings (kept while the server instance is warm). */
const noThinkingModels = new Set<string>();

/**
 * One Gemini call on `model`, with only the retries that cost nothing in quota terms being skipped:
 * - a 400 about thinking is retried once right away without thinkingConfig (and remembered);
 * - a 404 (model does not exist) switches to the fallback model straight away.
 * Rate limits (429), overload (503) and timeouts are returned to the caller, which waits and retries
 * (the browser does this, so it can show "menunggu sebentar" and keep the server request short).
 */
export async function generate({ task, useFallback, contents, config, deadline }: {
  task: Task;
  /** Use the fallback model (the browser asks for it after 3 failed tries on the main model). */
  useFallback?: boolean;
  contents: ContentListUnion;
  config?: GenerateContentConfig;
  /** Absolute time (ms) by which we must give up. */
  deadline: number;
}): Promise<{ text: string; model: string; usedFallback: boolean }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(503, "no key", "no_key");
  const ai = new GoogleGenAI({ apiKey: key });
  const fallback = fallbackModel();
  let model = useFallback && fallback ? fallback : modelFor(task);
  let thinkingRetried = false;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) throw new GeminiError(504, "timeout", "timeout");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    const useThinking = !noThinkingModels.has(model);
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: { ...config, thinkingConfig: useThinking ? lowThinking(model) : undefined, abortSignal: ctrl.signal, httpOptions: { timeout: remaining } },
      });
      const text = res.text ?? "";
      if (!text.trim()) throw new GeminiError(502, `empty response (finishReason ${res.candidates?.[0]?.finishReason ?? "unknown"})`, "empty");
      return { text, model, usedFallback: !!fallback && model === fallback };
    } catch (e) {
      const err = toGeminiError(e, ctrl.signal.aborted);
      err.model = model;
      // Log the model and Gemini's original error so problems are visible in the Vercel logs.
      console.error(`[gemini] task=${task} model=${model} thinking=${useThinking ? JSON.stringify(lowThinking(model) ?? null) : "off"} failed: ${err.status} ${err.message}`);
      if (isThinkingError(err) && useThinking && !thinkingRetried) {
        noThinkingModels.add(model);
        thinkingRetried = true;
        continue;
      }
      if (err.status === 404 && fallback && model !== fallback) {
        model = fallback;
        thinkingRetried = false;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** A short, friendly Indonesian message for the user. Raw details stay in the server log. */
export function friendlyMessage(e: GeminiError): string {
  if (e.code === "no_key") return "Fitur AI belum aktif karena GEMINI_API_KEY belum diatur di server.";
  if (e.status === 429) return "Kuota AI per menit habis. Tunggu sebentar lalu coba lagi.";
  if (e.code === "timeout" || e.status === 504) return "Gemini terlalu lama merespons. Coba lagi sebentar lagi.";
  if (e.status === 400 && /api key/i.test(e.message)) return "Kunci API Gemini tidak valid. Periksa GEMINI_API_KEY di pengaturan Vercel.";
  if (e.status === 403) return "Kunci API Gemini tidak punya akses ke model ini. Periksa GEMINI_API_KEY dan nama model.";
  if (e.status === 404) return `Model Gemini "${e.model ?? "?"}" tidak tersedia. Periksa GEMINI_MODEL, GEMINI_PDF_MODEL, dan GEMINI_FALLBACK_MODEL di Vercel.`;
  if (e.status === 400) return "Permintaan ditolak Gemini (isi terlalu besar atau format tidak didukung).";
  if (e.code === "empty") return "Gemini tidak mengembalikan jawaban. Coba lagi.";
  return "Server Gemini sedang sibuk. Coba lagi beberapa saat lagi.";
}

/** JSON error response for API routes. */
export function errorResponse(e: unknown) {
  const g = e instanceof GeminiError ? e : new GeminiError(500, String((e as Error)?.message ?? e), "internal");
  if (!(e instanceof GeminiError)) console.error(e);
  // Only 429/5xx/timeouts are worth retrying; a bad key or bad request will fail the same way again.
  const retryable = RETRYABLE.has(g.status) && g.code !== "no_key" && g.code !== "internal";
  const status = g.code === "no_key" ? 503 : retryable ? g.status : g.code === "internal" ? 500 : 502;
  const headers: Record<string, string> = {};
  if (g.retryAfterSec) headers["Retry-After"] = String(Math.min(g.retryAfterSec, 60));
  return Response.json(
    {
      error: g.code === "internal" ? "Terjadi kesalahan di server. Coba lagi." : friendlyMessage(g),
      code: g.status === 429 ? "rate_limit" : g.code,
      retryable,
      model: g.model,
      hasFallback: !!fallbackModel(),
    },
    { status, headers },
  );
}
