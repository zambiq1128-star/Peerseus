import { ApiError, GoogleGenAI, ThinkingLevel, type ContentListUnion, type GenerateContentConfig, type ThinkingConfig } from "@google/genai";

export const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";

/** Error with an HTTP status and a message that is safe to show to the user. */
export class GeminiError extends Error {
  constructor(public status: number, message: string, public code = "gemini", public retryAfterSec?: number) {
    super(message);
  }
}

/** Thinking makes these tasks slow without improving them, so keep it off or minimal. */
export function lowThinking(model: string): ThinkingConfig | undefined {
  if (/gemini-2\.5-pro/.test(model)) return { thinkingBudget: 128 }; // 2.5 Pro cannot turn thinking off
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: /pro/.test(model) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL };
  return undefined; // older models have no thinking
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GenerateOptions = {
  contents: ContentListUnion;
  config?: GenerateContentConfig;
  /** Absolute time (ms) by which we must have an answer or give up. */
  deadline: number;
  /** Longest a single attempt may take. */
  attemptMs: number;
};

/**
 * Calls Gemini with retries (exponential backoff on 429/5xx/timeouts) and a fallback model,
 * never running past `deadline`.
 */
export async function generate({ contents, config, deadline, attemptMs }: GenerateOptions): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(503, "no key", "no_key");
  const ai = new GoogleGenAI({ apiKey: key });

  // Two tries on the main model, then two on the fallback model.
  const plan = FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL
    ? [PRIMARY_MODEL, PRIMARY_MODEL, FALLBACK_MODEL, FALLBACK_MODEL]
    : [PRIMARY_MODEL, PRIMARY_MODEL, PRIMARY_MODEL];
  let last: GeminiError | undefined;

  for (let i = 0; i < plan.length; i++) {
    const model = plan[i];
    const remaining = deadline - Date.now();
    if (remaining < 4000) break;
    const timeout = Math.min(attemptMs, remaining - 1000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: { ...config, thinkingConfig: lowThinking(model), abortSignal: ctrl.signal, httpOptions: { timeout } },
      });
      const text = res.text ?? "";
      if (!text.trim()) throw new GeminiError(502, `empty response (${res.candidates?.[0]?.finishReason ?? "unknown"})`, "empty");
      return { text, model };
    } catch (e) {
      last = toGeminiError(e, ctrl.signal.aborted);
      console.error(`[gemini] ${model} attempt ${i + 1} failed:`, last.status, last.message.slice(0, 300));
      // A wrong model name: go straight to the fallback model.
      if (last.status === 404) {
        while (plan[i + 1] === model) i++;
        continue;
      }
      if (!RETRYABLE.has(last.status) && last.code !== "empty") throw last;
      // Quota exhausted or very slow on this model: retrying it soon won't help, try the fallback model.
      if (last.status === 429 || last.code === "timeout") {
        while (plan[i + 1] === model) i++;
      }
    } finally {
      clearTimeout(timer);
    }
    const next = plan[i + 1];
    if (!next) break;
    const wait = next !== model ? 500 : 1500 * 2 ** i + Math.random() * 500;
    if (deadline - Date.now() - wait < 5000) break;
    await sleep(wait);
  }
  throw last ?? new GeminiError(504, "timeout", "timeout");
}

/** A short, friendly Indonesian message for the user. Raw details stay in the server log. */
export function friendlyMessage(e: GeminiError): string {
  if (e.code === "no_key") return "Fitur AI belum aktif karena GEMINI_API_KEY belum diatur di server.";
  if (e.status === 429) return "Kuota Gemini sedang habis (batas tier gratis). Tunggu sekitar 1 menit, lalu coba lagi.";
  if (e.code === "timeout" || e.status === 504) return "Gemini terlalu lama merespons. Coba lagi sebentar lagi.";
  if (e.status === 400 && /api key/i.test(e.message)) return "Kunci API Gemini tidak valid. Periksa GEMINI_API_KEY di pengaturan Vercel.";
  if (e.status === 403) return "Kunci API Gemini tidak punya akses ke model ini. Periksa GEMINI_API_KEY dan nama model.";
  if (e.status === 404) return "Model Gemini tidak ditemukan. Periksa GEMINI_MODEL dan GEMINI_FALLBACK_MODEL di Vercel.";
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
    { error: g.code === "internal" ? "Terjadi kesalahan di server. Coba lagi." : friendlyMessage(g), code: g.code, retryable },
    { status, headers },
  );
}
