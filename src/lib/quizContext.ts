/**
 * Picks the most quiz-relevant parts of a long material, up to `limit` characters,
 * keeping them in their original order. Short materials are returned unchanged.
 */
export function pickRelevant(text: string, terms: string[], limit = 15_000): string {
  if (text.length <= limit) return text;

  // Blocks = paragraphs (never splitting a $$ block); a heading sticks to the paragraph after it.
  const paras: string[] = [];
  let cur = "";
  let inMath = false;
  for (const line of text.split("\n")) {
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inMath = !inMath;
    cur += line + "\n";
    if (!inMath && !line.trim() && cur.trim()) {
      paras.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) paras.push(cur.trim());
  const blocks: string[] = [];
  let pending = "";
  for (const p of paras) {
    if (p.split("\n").every((l) => /^#{1,6}\s/.test(l))) {
      pending += p + "\n\n";
      continue;
    }
    blocks.push(pending + p);
    pending = "";
  }
  if (pending.trim()) blocks.push(pending.trim());

  const words = Array.from(new Set(terms.flatMap((t) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((w) => w.length >= 3)));
  const scored = blocks
    .filter(Boolean)
    .map((b, i) => {
      const low = b.toLowerCase();
      const hits = words.reduce((s, w) => s + (low.split(w).length - 1), 0);
      const math = /\$/.test(b) ? 1 : 0; // formulas make good questions
      const density = (hits + math) / Math.sqrt(Math.max(b.length, 200) / 1000);
      // Small bonus for spread so that, with no matches, we don't only keep the beginning.
      return { b: b.length > limit ? b.slice(0, b.lastIndexOf("\n", limit) > 0 ? b.lastIndexOf("\n", limit) : limit) : b, i, score: density + (i === 0 ? 0.5 : 0) + ((i * 7919) % 13) / 1000 };
    });

  const chosen: typeof scored = [];
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    if (used + s.b.length + 2 > limit) continue;
    chosen.push(s);
    used += s.b.length + 2;
  }
  return chosen.sort((a, b) => a.i - b.i).map((s) => s.b).join("\n\n");
}
