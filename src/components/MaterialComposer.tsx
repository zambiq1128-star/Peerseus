"use client";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { MarkdownView } from "@/components/Markdown";
import { chunkText, normalizeMath, texToMarkdown } from "@/lib/latex";
import { ConvertError, convertPart, gapForRpm, newAiState, pdfPacing, runPool, type AiState, type ConvertBody, type WaitInfo } from "@/lib/convert";
import { MAX_PDF_PAGES, openPdf, type PdfHandle } from "@/lib/pdfPages";

type Unit = {
  n: number;
  status: "waiting" | "working" | "done" | "failed";
  out: string;
  /** Plain text used when the AI conversion fails (PDF text layer or the pasted part). */
  fallback: string;
  error?: string;
};
type Job = { kind: "pdf" | "text"; name: string; units: Unit[] };

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Joins converted pages; failed ones keep their plain text with a visible note. */
function combine(job: Job): string {
  const word = job.kind === "pdf" ? "Halaman" : "Bagian";
  return job.units
    .map((u) =>
      u.status === "done"
        ? u.out
        : u.fallback.trim()
          ? `> ${word} ${u.n} belum dirapikan (teks asli di bawah).\n\n${u.fallback.trim()}`
          : `> ${word} ${u.n} belum dirapikan dan tidak punya teks yang bisa dibaca.`,
    )
    .join("\n\n");
}

/** Material input (PDF, .tex/.md/.txt, or pasted text) plus the Markdown/LaTeX editor with preview. */
export default function MaterialComposer({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"pdf" | "file" | "paste">("pdf");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const pdfRef = useRef<PdfHandle | null>(null);
  const stopRef = useRef({ stopped: false });
  // Main/fallback model choice for the current run (switches to fallback after 3 failed tries).
  const aiRef = useRef<AiState>(newAiState());
  const [waitInfo, setWaitInfo] = useState<WaitInfo>(null);
  const valueRef = useRef(value);
  const lastAuto = useRef<string | null>(null);
  valueRef.current = value;

  useEffect(() => () => {
    stopRef.current.stopped = true;
    pdfRef.current?.destroy();
  }, []);

  /** New conversion output: replace the editor unless the user has edited it since. */
  function apply(md: string) {
    const cur = valueRef.current;
    if (!cur.trim() || cur === lastAuto.current) {
      lastAuto.current = md;
      onChange(md);
      setPending(null);
    } else {
      setPending(md);
    }
  }

  function patch(n: number, p: Partial<Unit>) {
    setJob((j) => (j ? { ...j, units: j.units.map((u) => (u.n === n ? { ...u, ...p } : u)) } : j));
  }

  // When a run settles (nothing waiting/working), put the result in the editor.
  const settled = job && job.units.length > 0 && job.units.every((u) => u.status === "done" || u.status === "failed");
  const combined = settled ? combine(job) : null;
  useEffect(() => {
    if (combined !== null && !running) apply(combined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combined, running]);

  async function process(kind: Job["kind"], units: Unit[], total: number) {
    const stop = { stopped: false };
    stopRef.current = stop;
    setRunning(true);
    setWaitInfo(null);
    let fatal = "";
    // One page at a time, spaced to the PDF model's per-minute limit (15 RPM → about 5 s apart).
    const { rpm } = await pdfPacing();
    await runPool(units, async (u) => {
      if (stop.stopped) return;
      patch(u.n, { status: "working", error: undefined });
      try {
        let body: ConvertBody;
        if (kind === "pdf") {
          const pdf = pdfRef.current!;
          const text = await pdf.text(u.n).catch(() => "");
          patch(u.n, { fallback: text });
          const img = await pdf.image(u.n);
          body = { mode: "page", image: img.data, mimeType: img.mimeType, text, page: u.n, total };
        } else {
          body = { mode: "text", text: u.fallback, page: u.n, total };
        }
        const out = await convertPart(body, aiRef.current, setWaitInfo, stop);
        patch(u.n, { status: "done", out });
      } catch (e) {
        const err = e instanceof ConvertError ? e : new ConvertError((e as Error).message, false);
        patch(u.n, { status: "failed", error: err.message });
        // Without an API key every request fails the same way: stop and use the plain text.
        if (err.code === "no_key" || err.code === "bad_request") {
          fatal = err.message;
          stop.stopped = true;
        }
      }
    }, 1, gapForRpm(rpm), stop);
    // Stopped early (cancelled or no API key): remaining units fall back to plain text.
    for (const u of units) {
      if (!stop.stopped) break;
      const fallback = kind === "pdf" && pdfRef.current ? await pdfRef.current.text(u.n).catch(() => "") : u.fallback;
      setJob((j) => (j ? { ...j, units: j.units.map((x) => (x.n === u.n && (x.status === "waiting" || x.status === "working") ? { ...x, status: "failed", fallback, error: fatal || "Dibatalkan" } : x)) } : j));
    }
    setWaitInfo(null);
    setRunning(false);
  }

  async function onPdf(f: File | null) {
    setNote("");
    if (!f) return;
    if (!isPdf(f)) return setNote("Pilih file PDF.");
    pdfRef.current?.destroy();
    pdfRef.current = null;
    setJob(null);
    let pdf: PdfHandle;
    try {
      pdf = await openPdf(f);
    } catch {
      return setNote("PDF tidak bisa dibuka. Pastikan file tidak rusak atau terkunci kata sandi.");
    }
    if (pdf.numPages > MAX_PDF_PAGES) {
      pdf.destroy();
      return setNote(`PDF ini ${pdf.numPages} halaman. Maksimal ${MAX_PDF_PAGES} halaman per upload, jadi pecah dulu PDF-nya (misalnya per bab) lalu upload sebagai beberapa materi.`);
    }
    pdfRef.current = pdf;
    aiRef.current = newAiState();
    const units: Unit[] = Array.from({ length: pdf.numPages }, (_, i) => ({ n: i + 1, status: "waiting", out: "", fallback: "" }));
    setJob({ kind: "pdf", name: f.name, units });
    await process("pdf", units, pdf.numPages);
  }

  async function onTextFile(f: File | null) {
    setNote("");
    if (!f) return;
    if (isPdf(f)) {
      setTab("pdf");
      return onPdf(f);
    }
    const raw = await f.text();
    if (/\.tex$/i.test(f.name)) {
      const md = texToMarkdown(raw);
      apply(md);
      setNote("Preamble dan perintah LaTeX yang tidak didukung sudah dibersihkan. Cek hasilnya di pratinjau.");
    } else if (/\.(md|markdown)$/i.test(f.name)) {
      apply(normalizeMath(raw));
      setNote("File Markdown dimasukkan ke editor.");
    } else {
      setPaste(raw);
      setTab("paste");
      setNote("Isi file .txt dipindah ke kolom tempel. Rapikan dengan AI atau pakai apa adanya.");
    }
  }

  async function tidyText(src: string) {
    setNote("");
    if (!src.trim()) return setNote("Teksnya masih kosong.");
    const parts = chunkText(src, 4000);
    const units: Unit[] = parts.map((p, i) => ({ n: i + 1, status: "waiting", out: "", fallback: p }));
    lastAuto.current = valueRef.current === src ? src : lastAuto.current;
    aiRef.current = newAiState();
    setJob({ kind: "text", name: "teks", units });
    await process("text", units, parts.length);
  }

  function retryFailed() {
    if (!job || running) return;
    const failed = job.units.filter((u) => u.status === "failed").map((u) => ({ ...u, status: "waiting" as const }));
    // Keep the editor in sync with re-runs if the user hasn't edited the last result.
    if (valueRef.current === combined) lastAuto.current = combined;
    setJob({ ...job, units: job.units.map((u) => failed.find((f) => f.n === u.n) ?? u) });
    setNote("");
    void process(job.kind, failed, job.units.length);
  }

  function retryOne(n: number) {
    if (!job || running) return;
    if (valueRef.current === combined) lastAuto.current = combined;
    patch(n, { status: "waiting" });
    void process(job.kind, [{ ...job.units.find((u) => u.n === n)! }], job.units.length);
  }

  const total = job?.units.length ?? 0;
  const finished = job?.units.filter((u) => u.status === "done" || u.status === "failed").length ?? 0;
  const failed = job?.units.filter((u) => u.status === "failed") ?? [];
  const word = job?.kind === "pdf" ? "halaman" : "bagian";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line p-4">
        <div className="mb-3 flex flex-wrap gap-1 text-sm">
          {([["pdf", "Upload PDF"], ["file", "File .tex / .md / .txt"], ["paste", "Tempel teks"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} disabled={running}
              className={`rounded-md px-3 py-1.5 font-medium ${tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-paper"}`}>{l}</button>
          ))}
        </div>

        {tab === "pdf" && (
          <div className="space-y-1">
            <input type="file" accept=".pdf,application/pdf" disabled={running} onChange={(e) => { void onPdf(e.target.files?.[0] ?? null); e.target.value = ""; }} className="text-sm" />
            <p className="text-xs text-muted">Maksimal {MAX_PDF_PAGES} halaman. Tiap halaman dibaca AI dari gambarnya, jadi rumus dan PDF hasil scan tetap terbaca. File PDF-nya tidak disimpan.</p>
          </div>
        )}
        {tab === "file" && (
          <div className="space-y-1">
            <input type="file" accept=".tex,.md,.markdown,.txt,text/plain,text/markdown" onChange={(e) => { void onTextFile(e.target.files?.[0] ?? null); e.target.value = ""; }} className="text-sm" />
            <p className="text-xs text-muted">.tex dibersihkan otomatis, .md langsung masuk editor, .txt bisa dirapikan AI.</p>
          </div>
        )}
        {tab === "paste" && (
          <div className="space-y-2">
            <textarea className="input min-h-32 text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Tempel teks materi di sini…" disabled={running} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={running || !paste.trim()} onClick={() => void tidyText(paste)}>Rapikan jadi Markdown + LaTeX</button>
              <button type="button" className="btn-ghost" disabled={running || !paste.trim()} onClick={() => { apply(paste); setNote("Teks dimasukkan ke editor apa adanya."); }}>Pakai apa adanya</button>
            </div>
          </div>
        )}

        {job && (
          <div className="mt-4 space-y-2">
            {running ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{job.kind === "pdf" ? "Membaca" : "Merapikan"} {word} {Math.min(finished + 1, total)} dari {total}...</span>
                <button type="button" className="text-xs text-muted underline" onClick={() => { stopRef.current.stopped = true; }}>Batalkan</button>
              </div>
            ) : (
              <p className="text-sm">
                {failed.length === 0
                  ? `Selesai: ${total} ${word} sudah dirapikan. Cek hasilnya di editor.`
                  : failed.length === total
                    ? `Konversi gagal untuk semua ${word}. Teks hasil ekstraksi biasa sudah dimasukkan ke editor, jadi kamu tetap bisa menyimpan materi lalu merapikannya nanti lewat Edit materi.`
                    : `${failed.length} dari ${total} ${word} gagal dirapikan dan diisi teks biasa. Ulangi ${word} itu saja tanpa mengulang semuanya.`}
              </p>
            )}
            <div className="h-1 rounded-full bg-line">
              <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${(finished / Math.max(total, 1)) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-1">
              {job.units.map((u) => (
                <button key={u.n} type="button" title={u.error ?? ""} disabled={u.status !== "failed" || running} onClick={() => retryOne(u.n)}
                  className={`min-w-8 rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                    u.status === "done" ? "border-good text-good" : u.status === "failed" ? "border-bad text-bad hover:bg-red-50" : u.status === "working" ? "border-accent text-accent" : "border-line text-muted"}`}>
                  {u.n}{u.status === "failed" ? " ↻" : ""}
                </button>
              ))}
            </div>
            {waitInfo && running && <WaitLine info={waitInfo} />}
            {running && aiRef.current.useFallback && <p className="text-xs text-muted">Memakai model AI cadangan.</p>}
            {!running && failed.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-ghost !py-1 text-xs" onClick={retryFailed}>Ulangi {failed.length} {word} yang gagal</button>
                <span className="text-xs text-bad">{failed[0].error}</span>
              </div>
            )}
          </div>
        )}
        {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      </div>

      {pending !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft p-3 text-sm">
          <span className="mr-auto">Hasil konversi baru sudah siap. Pakai hasil ini? Isi editor sekarang akan diganti.</span>
          <button type="button" className="btn-primary !py-1" onClick={() => { lastAuto.current = pending; onChange(pending); setPending(null); }}>Pakai hasil baru</button>
          <button type="button" className="btn-ghost !py-1" onClick={() => setPending(null)}>Abaikan</button>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="label !mb-0">Isi materi (Markdown + LaTeX)</label>
          <button type="button" className="text-xs font-medium text-accent disabled:opacity-50" disabled={running || !value.trim()}
            onClick={() => void tidyText(value)}>
            Rapikan isi editor dengan AI
          </button>
        </div>
        <MarkdownEditor value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/** Two panels on desktop (editor | preview), Edit/Pratinjau tabs on phones. */
export function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const preview = useDeferredValue(value);
  return (
    <div>
      <div className="mb-2 flex gap-1 text-sm md:hidden">
        {(["edit", "preview"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-3 py-1 font-medium ${tab === k ? "bg-ink text-white" : "text-ink-soft"}`}>
            {k === "edit" ? "Edit" : "Pratinjau"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <textarea
          className={`input h-[28rem] resize-y font-mono text-xs leading-relaxed md:block ${tab === "edit" ? "" : "hidden"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={"## Judul bagian\n\nGaya $\\vec{F} = m\\vec{a}$ ...\n\n$$\nv^2 = v_0^2 + 2a\\,\\Delta x\n$$"}
        />
        <div className={`h-[28rem] overflow-auto rounded-lg border border-line p-4 md:block ${tab === "preview" ? "" : "hidden"}`}>
          {preview.trim() ? <MarkdownView text={preview} /> : <p className="text-sm text-muted">Pratinjau muncul di sini.</p>}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">Rumus: $...$ dalam kalimat, $$...$$ untuk blok. Rumus yang salah tampil merah di pratinjau.</p>
    </div>
  );
}

/** "Kuota AI per menit habis, menunggu sebentar... (23 detik)": the run continues by itself. */
function WaitLine({ info }: { info: NonNullable<WaitInfo> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((info.until - now) / 1000));
  return <p className="text-xs text-amber-700">{info.message} {left > 0 && `(${left} detik)`}</p>;
}
