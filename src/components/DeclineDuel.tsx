"use client";
import { useState } from "react";
import { declineDuel } from "@/lib/peerseus";

/** "Tolak" with an inline "Ya, tolak / Batal" step, so one stray click doesn't decline a challenge. */
export default function DeclineDuel({ duelId, uid, onDone, className = "" }: { duelId: string; uid: string; onDone: () => void; className?: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decline() {
    setBusy(true);
    setError("");
    try {
      await declineDuel(duelId, uid);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menolak duel");
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {!asking ? (
        <button type="button" className="btn-ghost !py-1.5" onClick={() => setAsking(true)}>Tolak</button>
      ) : (
        <>
          <span className="text-xs text-muted">Tolak tantangan ini?</span>
          <button type="button" className="btn !py-1.5 bg-bad text-black hover:bg-white" disabled={busy} onClick={decline}>{busy ? "Menolak…" : "Ya, tolak"}</button>
          <button type="button" className="btn-ghost !py-1.5" disabled={busy} onClick={() => setAsking(false)}>Batal</button>
        </>
      )}
      {error && <span className="w-full text-xs text-bad">{error}</span>}
    </div>
  );
}
