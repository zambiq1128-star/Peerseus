"use client";
import { useState } from "react";
import {
  acceptProposal, addOwnQuestion, blankQuestion, deleteQuizQuestion, MAX_QUIZ_QUESTIONS, MIN_QUIZ_QUESTIONS, PROPOSAL_STATUS, proposeQuestion,
  questionProblem, rejectProposal, updateQuizQuestion, withdrawProposal,
} from "@/lib/proposals";
import type { Material, Question, QuestionProposal, Quiz, UserProfile } from "@/lib/types";
import { MathText } from "./Markdown";
import { CollapsibleRows, Section, timeAgo } from "./ui";

/** Fields of one multiple-choice question, with a LaTeX preview of the question and the options. */
export function QuestionForm({ value: q, onChange, topics, idPrefix }: {
  value: Question;
  onChange: (q: Question) => void;
  topics: string[];
  idPrefix: string;
}) {
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}-q`}>Pertanyaan</label>
        <textarea id={`${idPrefix}-q`} className="input font-mono text-xs" rows={3} value={q.question} onChange={(e) => set({ question: e.target.value })}
          placeholder="Boleh pakai LaTeX, mis. $\int_0^1 x^2\,dx$" />
        {q.question.trim() && <div className="mt-1 text-sm font-medium"><MathText text={q.question} /></div>}
      </div>
      <fieldset>
        <legend className="label">Opsi jawaban (pilih yang benar)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o, k) => (
            <label key={k} className={`block rounded-control border p-2 transition-colors ${q.answerIndex === k ? "border-good bg-good-soft" : "border-line"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name={`${idPrefix}-ans`} checked={q.answerIndex === k} onChange={() => set({ answerIndex: k })} />
                <span className="text-xs font-semibold text-muted">{"ABCD"[k]}</span>
                <input className="w-full bg-transparent font-mono text-xs outline-none" value={o} aria-label={`Opsi ${"ABCD"[k]}`}
                  onChange={(e) => set({ options: q.options.map((x, z) => (z === k ? e.target.value : x)) })} />
              </span>
              {o.trim() && <span className="mt-1 block text-sm"><MathText text={o} /></span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor={`${idPrefix}-ex`}>Pembahasan</label>
        <textarea id={`${idPrefix}-ex`} className="input font-mono text-xs" rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-topic`}>Topik</label>
        <input id={`${idPrefix}-topic`} className="input" list={`${idPrefix}-topics`} value={q.topic} onChange={(e) => set({ topic: e.target.value })} />
        <datalist id={`${idPrefix}-topics`}>{topics.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
    </div>
  );
}

/** "Usulkan soal" button that opens the form (for everyone except the uploader). */
export function ProposeQuestion({ quiz, material, me, onDone }: { quiz: Quiz; material: Material; me: UserProfile; onDone: () => void }) {
  const [q, setQ] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const full = quiz.questions.length >= MAX_QUIZ_QUESTIONS;

  if (!q) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Punya soal bagus dari materi ini?</div>
          <div className="text-xs text-muted">
            {full ? `Kuis ini sudah ${MAX_QUIZ_QUESTIONS} soal, jadi belum bisa menerima usulan.` : `Usulkan soalmu. Kalau diterima ${material.uploaderName}, soalnya ikut dipakai di duel dan latihan sendiri dengan namamu.`}
          </div>
          {sent && <div className="mt-1 text-xs text-good">Usulan terkirim. Statusnya ada di Usulanku di bawah.</div>}
        </div>
        {!full && <button className="btn-ghost" onClick={() => { setQ(blankQuestion(material.topics[0] ?? "")); setSent(false); }}>Usulkan soal</button>}
      </div>
    );
  }

  const problem = questionProblem(q);
  async function send() {
    setBusy(true);
    setErr("");
    try {
      await proposeQuestion(quiz, material, me, q!);
      setQ(null);
      setSent(true);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Section title="Usulkan soal">
      <div className="card space-y-3">
        <QuestionForm value={q} onChange={setQ} topics={material.topics} idPrefix="propose" />
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {problem && <span className="mr-auto text-xs text-muted">{problem}</span>}
          <button className="btn-ghost" onClick={() => setQ(null)} disabled={busy}>Batal</button>
          <button className="btn-primary" onClick={send} disabled={busy || !!problem}>{busy ? "Mengirim…" : "Kirim usulan"}</button>
        </div>
      </div>
    </Section>
  );
}

const STATUS_BADGE: Record<QuestionProposal["status"], string> = { pending: "badge", accepted: "badge-good", rejected: "badge-bad" };

/** The proposer's own proposals for this material, with their status. */
export function MyProposals({ list, onChange }: { list: QuestionProposal[]; onChange: () => void }) {
  const [busy, setBusy] = useState("");
  if (!list.length) return null;
  async function withdraw(p: QuestionProposal) {
    setBusy(p.id);
    await withdrawProposal(p).catch(() => {});
    setBusy("");
    onChange();
  }
  return (
    <Section title="Usulanku">
      <div className="rows">
        {list.map((p) => (
          <div key={p.id} className="space-y-1 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={STATUS_BADGE[p.status]}>{PROPOSAL_STATUS[p.status]}</span>
              <span className="text-xs text-muted">{timeAgo(p.reviewedAt ?? p.createdAt)}</span>
            </div>
            <div className="font-medium"><MathText text={p.question.question} /></div>
            {p.status === "rejected" && p.rejectReason && <div className="text-xs text-bad">Alasan: {p.rejectReason}</div>}
            {p.status === "pending" && (
              <button className="text-xs text-muted underline" onClick={() => withdraw(p)} disabled={busy === p.id}>{busy === p.id ? "Menarik…" : "Tarik usulan"}</button>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The uploader's queue: edit each proposal, then accept or reject it. */
export function ReviewProposals({ list, quiz, topics, onChange }: { list: QuestionProposal[]; quiz: Quiz; topics: string[]; onChange: () => void }) {
  if (!list.length) return null;
  return (
    <Section title={`Usulan soal menunggu (${list.length})`}>
      <p className="mb-3 text-sm text-muted">
        Cek dan perbaiki dulu. Soal yang diterima masuk ke kuis ({quiz.questions.length}/{MAX_QUIZ_QUESTIONS} soal) dan dipakai di duel dan latihan sendiri.
      </p>
      <div className="space-y-3">
        {list.map((p) => <ReviewOne key={p.id} p={p} full={quiz.questions.length >= MAX_QUIZ_QUESTIONS} topics={topics} onDone={onChange} />)}
      </div>
    </Section>
  );
}

function ReviewOne({ p, full, topics, onDone }: { p: QuestionProposal; full: boolean; topics: string[]; onDone: () => void }) {
  const [q, setQ] = useState<Question>(p.question);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const problem = questionProblem(q);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="text-xs text-muted">Dari <b className="text-ink">{p.proposerName}</b> · {timeAgo(p.createdAt)}</div>
      <QuestionForm value={q} onChange={setQ} topics={topics} idPrefix={p.id} />
      {err && <p className="text-sm text-bad">{err}</p>}
      {rejecting ? (
        <div className="space-y-2 border-t border-line pt-3">
          <label className="label" htmlFor={`${p.id}-reason`}>Alasan ditolak (opsional, terlihat oleh {p.proposerName})</label>
          <input id={`${p.id}-reason`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Di luar materi ini" />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRejecting(false)} disabled={busy}>Batal</button>
            <button className="btn-primary" onClick={() => act(() => rejectProposal(p, reason))} disabled={busy}>{busy ? "Menolak…" : "Ya, tolak"}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(problem || full) && <span className="mr-auto text-xs text-muted">{full ? `Kuis sudah ${MAX_QUIZ_QUESTIONS} soal.` : problem}</span>}
          <button className="btn-ghost" onClick={() => setRejecting(true)} disabled={busy}>Tolak</button>
          <button className="btn-primary" onClick={() => act(() => acceptProposal(p, q))} disabled={busy || !!problem || full}>{busy ? "Menyimpan…" : "Terima"}</button>
        </div>
      )}
    </div>
  );
}

/** The uploader's own view of a published quiz: add questions directly, edit or delete existing ones. */
export function ManageQuestions({ quiz, topics, onChange }: { quiz: Quiz; topics: string[]; onChange: () => void }) {
  const [adding, setAdding] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const n = quiz.questions.length;
  const full = n >= MAX_QUIZ_QUESTIONS;

  async function add() {
    setBusy(true);
    setErr("");
    try {
      await addOwnQuestion(quiz.id, adding!);
      setAdding(null);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Section
      title={`Kelola soal (${n}/${MAX_QUIZ_QUESTIONS})`}
      action={!adding && !full && <button className="btn-ghost !py-1.5" onClick={() => setAdding(blankQuestion(topics[0] ?? ""))}>Tambah soal</button>}
    >
      <p className="mb-3 text-sm text-muted">Perubahan berlaku untuk duel dan latihan berikutnya. Duel yang sudah dibuat memakai soal saat duel dibuat. Minimal {MIN_QUIZ_QUESTIONS} soal.</p>
      {adding && (
        <div className="card mb-3 space-y-3">
          <div className="font-semibold">Soal baru</div>
          <QuestionForm value={adding} onChange={setAdding} topics={topics} idPrefix="add" />
          {err && <p className="text-sm text-bad">{err}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {questionProblem(adding) && <span className="mr-auto text-xs text-muted">{questionProblem(adding)}</span>}
            <button className="btn-ghost" onClick={() => { setAdding(null); setErr(""); }} disabled={busy}>Batal</button>
            <button className="btn-primary" onClick={add} disabled={busy || !!questionProblem(adding)}>{busy ? "Menyimpan…" : "Tambahkan ke kuis"}</button>
          </div>
        </div>
      )}
      <CollapsibleRows items={quiz.questions.map((q, i) => ({ q, i }))}>
        {({ q, i }) => <ManageOne key={q.id} q={q} no={i + 1} quiz={quiz} topics={topics} canDelete={n > MIN_QUIZ_QUESTIONS} onDone={onChange} />}
      </CollapsibleRows>
    </Section>
  );
}

function ManageOne({ q, no, quiz, topics, canDelete, onDone }: { q: Question; no: number; quiz: Quiz; topics: string[]; canDelete: boolean; onDone: () => void }) {
  const [editing, setEditing] = useState<Question | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(fn: () => Promise<void>, after: () => void) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      after();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  if (editing) {
    const problem = questionProblem(editing);
    return (
      <div className="space-y-3 p-4">
        <div className="text-xs font-semibold text-muted">Edit soal {no}</div>
        <QuestionForm value={editing} onChange={setEditing} topics={topics} idPrefix={`edit-${q.id}`} />
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {problem && <span className="mr-auto text-xs text-muted">{problem}</span>}
          <button className="btn-ghost" onClick={() => { setEditing(null); setErr(""); }} disabled={busy}>Batal</button>
          <button className="btn-primary" disabled={busy || !!problem} onClick={() => act(() => updateQuizQuestion(quiz.id, editing), () => setEditing(null))}>{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium"><span className="text-muted">{no}.</span> <MathText text={q.question} /></div>
          <div className="mt-0.5 text-xs text-muted">
            {q.topic} · jawaban {"ABCD"[q.answerIndex]}{q.proposedBy && <> · diusulkan oleh {q.proposedBy.name}</>}
          </div>
        </div>
        {!confirming && (
          <div className="flex shrink-0 gap-3 text-xs">
            <button className="link" onClick={() => setEditing(q)}>Edit</button>
            <button className="text-bad hover:underline disabled:opacity-40" disabled={!canDelete} title={canDelete ? undefined : `Kuis minimal ${MIN_QUIZ_QUESTIONS} soal`} onClick={() => setConfirming(true)}>Hapus</button>
          </div>
        )}
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-bad">Hapus soal ini dari kuis?</span>
          <button className="btn-ghost !py-1.5" onClick={() => setConfirming(false)} disabled={busy}>Batal</button>
          <button className="btn-primary !py-1.5" onClick={() => act(() => deleteQuizQuestion(quiz.id, q.id), () => setConfirming(false))} disabled={busy}>{busy ? "Menghapus…" : "Ya, hapus"}</button>
        </div>
      )}
      {err && <p className="text-xs text-bad">{err}</p>}
    </div>
  );
}
