"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import {
  answerProblem, answerQuestion, canPickBest, deleteAnswer, deleteQuestion, discussionProblem, editAnswer, editQuestion, loadDiscussions,
  report, setBestAnswer, toggleVote, askQuestion, BODY_MAX, TITLE_MAX,
  type AnswerView, type DiscussionDraft, type DiscussionView,
} from "@/lib/discussions";
import { plainSnippet } from "@/lib/latex";
import type { Material, Question, Quiz, UserProfile } from "@/lib/types";
import { MarkdownView } from "./Markdown";
import { CollapsibleRows, Empty, ErrorState, Section, Spinner, timeAgo, useAsync } from "./ui";

/**
 * Diskusi on a public material: questions about the material or one quiz question, one level of answers,
 * upvotes and a best answer picked by the asker or the uploader. Not shown on private materials.
 */
export function Discussions({ material, quiz, me }: { material: Material; quiz: Quiz | null; me: UserProfile }) {
  const { data, error, reload } = useAsync(() => loadDiscussions(material.id, me.id), [material.id, me.id]);
  const [asking, setAsking] = useState(false);
  const [openId, setOpenId] = useState("");
  const questions = quiz?.status === "published" ? quiz.questions : [];
  // ?soal=<questionId> (from "Bahas soal ini"): only that question's discussions, and Tanya starts on that question.
  const soalParam = useSearchParams().get("soal") ?? "";
  const filter = questions.some((q) => q.id === soalParam) ? soalParam : "";
  const shown = data && filter ? data.filter((d) => d.questionId === filter) : data;
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!data || arrived || !filter) return;
    setArrived(true);
    if (!shown?.length) setAsking(true);
    document.getElementById("diskusi")?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter]);
  const ctx: Ctx = { material, questions, me, reload };
  const askButton = <button className="btn-ghost !py-1.5" onClick={() => setAsking(true)}>Tanya</button>;

  return (
    <Section title={`Diskusi${data ? ` (${data.length})` : ""}`} action={!asking && shown && shown.length > 0 && askButton}>
      <div id="diskusi" className="space-y-3">
        {filter && (
          <div className="callout flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">Menampilkan diskusi untuk <b>{contextLabel(filter, questions)}</b></span>
            <Link href={`/materials/${material.id}#diskusi`} className="link shrink-0">Tampilkan semua</Link>
          </div>
        )}
        {asking && (
          <DiscussionForm
            questions={questions}
            initial={{ title: "", body: "", questionId: filter }}
            submitLabel="Kirim pertanyaan"
            onCancel={() => setAsking(false)}
            onSubmit={async (draft) => {
              const d = await askQuestion(material, me, draft, questions);
              setAsking(false);
              setOpenId(d.id);
              reload();
            }}
          />
        )}
        {error ? <ErrorState message={error} onRetry={reload} />
          : !data ? <Spinner label="Memuat diskusi…" />
          : !shown || shown.length === 0 ? (!asking && <Empty action={askButton}>{filter ? "Belum ada diskusi untuk soal ini. Jadilah yang pertama bertanya." : "Belum ada diskusi. Jadilah yang pertama bertanya."}</Empty>)
          : (
            <CollapsibleRows items={shown}>
              {(d) => <DiscussionRow key={d.id} d={d} ctx={ctx} open={openId === d.id} onToggle={() => setOpenId(openId === d.id ? "" : d.id)} />}
            </CollapsibleRows>
          )}
      </div>
    </Section>
  );
}

type Ctx = { material: Material; questions: Question[]; me: UserProfile; reload: () => void };

/** "Umum", or "Soal 3: …the start of the question…". */
function contextLabel(questionId: string | null | undefined, questions: Question[]) {
  if (!questionId) return "Umum";
  const i = questions.findIndex((q) => q.id === questionId);
  if (i < 0) return "Soal (sudah tidak ada di kuis)";
  const text = plainSnippet(questions[i].question, 70);
  return `Soal ${i + 1}: ${text}${text.length >= 70 ? "…" : ""}`;
}

/** busy flag + error message around one async action. */
function useAction() {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  }
  return { busy, err, run };
}

function DiscussionRow({ d, ctx, open, onToggle }: { d: DiscussionView; ctx: Ctx; open: boolean; onToggle: () => void }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full p-4 text-left transition-colors hover:bg-navy-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="badge max-w-full truncate">{contextLabel(d.questionId, ctx.questions)}</span>
          {d.best && <span className="badge-good">✓ Terjawab</span>}
        </div>
        <div className="mt-2 font-semibold">{d.title}</div>
        <div className="mt-1 text-xs text-muted">
          {d.authorName} · {timeAgo(d.createdAt)} · {d.answers.length} jawaban · ▲ {d.upvotes}
          <span aria-hidden className={`ml-2 inline-block transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </div>
      </button>
      {open && <DiscussionDetail d={d} ctx={ctx} />}
    </div>
  );
}

function DiscussionDetail({ d, ctx }: { d: DiscussionView; ctx: Ctx }) {
  const { material, questions, me, reload } = ctx;
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reported, setReported] = useState(false);
  const { busy, err, run } = useAction();
  const mine = d.authorId === me.id;
  const others = d.answers.some((a) => a.authorId !== me.id);

  if (editing) {
    return (
      <div className="border-t border-line p-4">
        <DiscussionForm
          questions={questions}
          initial={{ title: d.title, body: d.body, questionId: d.questionId ?? "" }}
          submitLabel="Simpan"
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await editQuestion(d, me.id, draft, questions);
            setEditing(false);
            reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-line p-4">
      <MarkdownView text={d.body} className="text-sm" />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <VoteButton target={d} type="discussion" ctx={ctx} />
        {d.updatedAt && <span className="text-muted">diedit {timeAgo(d.updatedAt)}</span>}
        <span className="ml-auto flex flex-wrap gap-3">
          {mine ? (
            !confirming && <>
              <button className="link" onClick={() => setEditing(true)}>Edit</button>
              <button className="text-bad hover:underline disabled:opacity-40" disabled={others}
                title={others ? "Sudah dijawab orang lain, jadi tidak bisa dihapus" : undefined} onClick={() => setConfirming(true)}>Hapus</button>
            </>
          ) : (
            <button className="text-muted underline" disabled={reported} onClick={() => run("report", async () => { await report("discussion", d); setReported(true); })}>
              {reported ? "Laporan terkirim" : "Laporkan"}
            </button>
          )}
        </span>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-bad">Hapus pertanyaan ini?</span>
          <button className="btn-ghost !py-1.5" onClick={() => setConfirming(false)} disabled={!!busy}>Batal</button>
          <button className="btn-primary !py-1.5" disabled={!!busy} onClick={() => run("delete", async () => { await deleteQuestion(d, me.id); reload(); })}>
            {busy === "delete" ? "Menghapus…" : "Ya, hapus"}
          </button>
        </div>
      )}
      {err && <p className="text-xs text-bad">{err}</p>}

      <div>
        <div className="mb-2 text-sm font-semibold">{d.answers.length ? `${d.answers.length} jawaban` : "Belum ada jawaban."}</div>
        {d.answers.length > 0 && (
          <div className="divide-y divide-line border-y border-line">
            {d.answers.map((a) => <AnswerRow key={a.id} a={a} d={d} ctx={ctx} />)}
          </div>
        )}
      </div>
      <AnswerForm d={d} ctx={ctx} />
      {canPickBest(d, material, me.id) && !d.best && d.answers.length > 0 && (
        <p className="text-xs text-muted">Kamu bisa memilih satu jawaban terbaik. Pertanyaan yang sudah punya jawaban terbaik ditandai ✓ Terjawab.</p>
      )}
    </div>
  );
}

function AnswerRow({ a, d, ctx }: { a: AnswerView; d: DiscussionView; ctx: Ctx }) {
  const { material, me, reload } = ctx;
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reported, setReported] = useState(false);
  const { busy, err, run } = useAction();
  const isBest = d.best?.id === a.id;
  const picker = canPickBest(d, material, me.id);
  const mine = a.authorId === me.id;

  return (
    <div className={`space-y-2 py-3 ${isBest ? "border-l-4 border-accent pl-3" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {isBest && <span className="badge-strong">✓ Jawaban terbaik</span>}
        <span><b className="text-ink">{a.authorName}</b> · {timeAgo(a.createdAt)}{a.updatedAt && " · diedit"}</span>
      </div>
      {editing !== null ? (
        <div className="space-y-2">
          <BodyField id={`edit-${a.id}`} value={editing} onChange={setEditing} rows={4} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {answerProblem(editing) && <span className="mr-auto text-xs text-muted">{answerProblem(editing)}</span>}
            <button className="btn-ghost !py-1.5" onClick={() => setEditing(null)} disabled={!!busy}>Batal</button>
            <button className="btn-primary !py-1.5" disabled={!!busy || !!answerProblem(editing)}
              onClick={() => run("edit", async () => { await editAnswer(a, me.id, editing); setEditing(null); reload(); })}>
              {busy === "edit" ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      ) : (
        <MarkdownView text={a.body} className="text-sm" />
      )}
      {editing === null && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <VoteButton target={a} type="answer" ctx={ctx} />
          {picker && (isBest
            ? <button className="text-muted underline" disabled={!!busy} onClick={() => run("best", async () => { await setBestAnswer(d, material, me.id, null); reload(); })}>Batalkan pilihan</button>
            : <button className="link" disabled={!!busy} onClick={() => run("best", async () => { await setBestAnswer(d, material, me.id, a.id); reload(); })}>
                {busy === "best" ? "Menyimpan…" : "Pilih sebagai jawaban terbaik"}
              </button>)}
          <span className="ml-auto flex flex-wrap gap-3">
            {mine ? (
              !confirming && <>
                <button className="link" onClick={() => setEditing(a.body)}>Edit</button>
                <button className="text-bad hover:underline" onClick={() => setConfirming(true)}>Hapus</button>
              </>
            ) : (
              <button className="text-muted underline" disabled={reported} onClick={() => run("report", async () => { await report("answer", a); setReported(true); })}>
                {reported ? "Laporan terkirim" : "Laporkan"}
              </button>
            )}
          </span>
        </div>
      )}
      {confirming && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-bad">Hapus jawaban ini?</span>
          <button className="btn-ghost !py-1.5" onClick={() => setConfirming(false)} disabled={!!busy}>Batal</button>
          <button className="btn-primary !py-1.5" disabled={!!busy} onClick={() => run("delete", async () => { await deleteAnswer(a, me.id); reload(); })}>
            {busy === "delete" ? "Menghapus…" : "Ya, hapus"}
          </button>
        </div>
      )}
      {err && <p className="text-xs text-bad">{err}</p>}
    </div>
  );
}

/** ▲ N. Filled when I upvoted; disabled on my own writing. */
function VoteButton({ target, type, ctx }: { target: (DiscussionView | AnswerView); type: "discussion" | "answer"; ctx: Ctx }) {
  const { me, reload } = ctx;
  const { busy, err, run } = useAction();
  const own = target.authorId === me.id;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={`${target.voted ? "btn-primary" : "btn-ghost"} !px-4 !py-1 !text-xs`}
        disabled={own || !!busy}
        aria-pressed={target.voted}
        title={own ? "Tidak bisa upvote tulisan sendiri" : target.voted ? "Batalkan upvote" : "Upvote"}
        onClick={() => run("vote", async () => { await toggleVote(target, type, me.id); reload(); })}
      >
        ▲ {target.upvotes}
      </button>
      {err && <span className="text-bad">{err}</span>}
    </span>
  );
}

function AnswerForm({ d, ctx }: { d: DiscussionView; ctx: Ctx }) {
  const [body, setBody] = useState("");
  const { busy, err, run } = useAction();
  const problem = answerProblem(body);
  return (
    <div className="space-y-2">
      <BodyField id={`answer-${d.id}`} label="Jawabanmu" value={body} onChange={setBody} rows={3} />
      {err && <p className="text-xs text-bad">{err}</p>}
      <div className="flex justify-end">
        <button className="btn-primary !py-1.5" disabled={!!busy || !!problem}
          onClick={() => run("answer", async () => { await answerQuestion(d, ctx.me, body); setBody(""); ctx.reload(); })}>
          {busy ? "Mengirim…" : "Kirim jawaban"}
        </button>
      </div>
    </div>
  );
}

/** Markdown + LaTeX textarea with a live preview under it. */
function BodyField({ id, label, value, onChange, rows }: { id: string; label?: string; value: string; onChange: (v: string) => void; rows: number }) {
  const preview = useDeferredValue(value);
  return (
    <div>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <textarea id={id} className="input font-mono text-xs" rows={rows} value={value} maxLength={BODY_MAX} onChange={(e) => onChange(e.target.value)}
        placeholder="Boleh pakai Markdown dan LaTeX, mis. $\lim_{x \to 0} \frac{\sin x}{x}$" aria-label={label ? undefined : "Isi"} />
      {preview.trim() && (
        <div className="mt-2 border border-line p-3">
          <div className="mb-1 text-xs text-muted">Pratinjau</div>
          <MarkdownView text={preview} className="text-sm" />
        </div>
      )}
    </div>
  );
}

/** New question or editing one: title, body, and context (Umum or one quiz question). */
function DiscussionForm({ questions, initial = { title: "", body: "", questionId: "" }, submitLabel, onSubmit, onCancel }: {
  questions: Question[];
  initial?: DiscussionDraft;
  submitLabel: string;
  onSubmit: (d: DiscussionDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const { busy, err, run } = useAction();
  const problem = discussionProblem(draft);
  const set = (patch: Partial<DiscussionDraft>) => setDraft({ ...draft, ...patch });
  const id = initial.title ? "edit-discussion" : "ask";
  // A question that left the quiz stays selectable while editing, so saving doesn't silently drop it.
  const gone = draft.questionId && !questions.some((q) => q.id === draft.questionId);

  return (
    <div className="card space-y-3">
      <div>
        <label className="label" htmlFor={`${id}-title`}>Judul</label>
        <input id={`${id}-title`} className="input" value={draft.title} maxLength={TITLE_MAX} onChange={(e) => set({ title: e.target.value })}
          placeholder="mis. Kenapa limit ini tidak ada?" />
      </div>
      {(questions.length > 0 || gone) && (
        <div>
          <label className="label" htmlFor={`${id}-ctx`}>Tentang</label>
          <select id={`${id}-ctx`} className="input" value={draft.questionId} onChange={(e) => set({ questionId: e.target.value })}>
            <option value="">Umum (materi ini)</option>
            {questions.map((q) => <option key={q.id} value={q.id}>{contextLabel(q.id, questions)}</option>)}
            {gone && <option value={draft.questionId}>Soal (sudah tidak ada di kuis)</option>}
          </select>
        </div>
      )}
      <BodyField id={`${id}-body`} label="Isi" value={draft.body} onChange={(body) => set({ body })} rows={5} />
      {err && <p className="text-sm text-bad">{err}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {problem && <span className="mr-auto text-xs text-muted">{problem}</span>}
        <button className="btn-ghost" onClick={onCancel} disabled={!!busy}>Batal</button>
        <button className="btn-primary" disabled={!!busy || !!problem} onClick={() => run("send", () => onSubmit(draft))}>
          {busy ? "Mengirim…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
