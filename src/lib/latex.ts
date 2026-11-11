/**
 * Helpers for material text written in Markdown + LaTeX ($...$ inline, $$...$$ block).
 * Pure functions: safe to use on both the server and the browser.
 */

/** Normalises math delimiters so remark-math/KaTeX render them reliably. */
export function normalizeMath(src: string): string {
  let s = src.replace(/\r\n?/g, "\n");
  // \[ ... \] and \( ... \) are common in LLM output and LaTeX sources.
  s = s.replace(/(^|[^\\])\\\[([\s\S]+?)\\\]/g, (_, pre, m) => `${pre}$$${m}$$`);
  s = s.replace(/(^|[^\\])\\\(([\s\S]+?)\\\)/g, (_, pre, m) => `${pre}$${m.trim()}$`);
  // Put every $$...$$ block on its own lines, otherwise it is rendered as inline math.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => `\n\n$$\n${m.trim()}\n$$\n\n`);
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Removes a ```markdown ... ``` wrapper that models sometimes add around the whole answer. */
export function stripFence(s: string): string {
  const m = s.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : s.trim();
}

/**
 * JSON strings like "\frac" or "\vec" turn into control characters (form feed, vertical tab...)
 * when a model forgets to double the backslash. Turn them back into LaTeX commands.
 */
export function repairLatexEscapes(s: string): string {
  return s
    .replace(/\x0c/g, "\\f")
    .replace(/\x0b/g, "\\v")
    .replace(/\x08/g, "\\b")
    .replace(/\r(?=[a-zA-Z])/g, "\\r")
    .replace(/\t(?=[a-zA-Z])/g, "\\t")
    .replace(/\$[^$]*\$/g, (m) => m.replace(/\n(?=[a-zA-Z])/g, "\\n"));
}

/** Splits text into parts of about `size` characters, at blank lines (never inside a $$ block). */
export function chunkText(text: string, size = 4000): string[] {
  const blocks: string[] = [];
  let cur = "";
  let inMath = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inMath = !inMath;
    cur += line + "\n";
    if (!inMath && !line.trim()) {
      blocks.push(cur);
      cur = "";
    }
  }
  if (cur.trim()) blocks.push(cur);

  const out: string[] = [];
  let part = "";
  for (let b of blocks) {
    // A single huge paragraph: cut at line ends, or hard-cut as a last resort.
    while (b.length > size * 1.5) {
      const cut = b.lastIndexOf("\n", size) > size / 2 ? b.lastIndexOf("\n", size) : size;
      if (part.trim()) out.push(part.trim());
      out.push(b.slice(0, cut).trim());
      part = "";
      b = b.slice(cut);
    }
    if (part.length + b.length > size && part.trim()) {
      out.push(part.trim());
      part = "";
    }
    part += b;
  }
  if (part.trim()) out.push(part.trim());
  return out;
}

// ---------- .tex → Markdown + LaTeX ----------

/** Reads a {...} group starting at s[i] === "{"; returns [content, indexAfter]. */
function readGroup(s: string, i: number): [string, number] | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return null;
}

/** Replaces \cmd{arg} (with balanced braces) using fn(arg). */
function replaceCmd(s: string, cmd: string, fn: (arg: string) => string): string {
  const re = new RegExp(`\\\\${cmd}\\*?\\s*(?=\\{)`, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const g = readGroup(s, m.index + m[0].length);
    if (!g) continue;
    out += s.slice(last, m.index) + fn(g[0]);
    last = g[1];
    re.lastIndex = g[1];
  }
  return out + s.slice(last);
}

/** Collects simple \newcommand{\x}{body} macros without arguments and expands them. */
function expandSimpleMacros(s: string): string {
  const macros: [string, string][] = [];
  const re = /\\(?:re)?newcommand\*?\s*\{?\\([a-zA-Z]+)\}?\s*(\[\d\])?\s*(?=\{)/g;
  let m: RegExpExecArray | null;
  let out = "";
  let last = 0;
  while ((m = re.exec(s))) {
    const g = readGroup(s, m.index + m[0].length);
    if (!g) continue;
    if (!m[2]) macros.push([m[1], g[0]]);
    out += s.slice(last, m.index);
    last = g[1];
    re.lastIndex = g[1];
  }
  s = out + s.slice(last);
  for (const [name, body] of macros) {
    s = s.replace(new RegExp(`\\\\${name}(?![a-zA-Z])`, "g"), () => body);
  }
  return s;
}

const MATH_ENVS = "equation|align|gather|multline|eqnarray|displaymath|math";
const THEOREMS: Record<string, string> = {
  theorem: "Teorema", lemma: "Lema", corollary: "Akibat", definition: "Definisi", example: "Contoh",
  remark: "Catatan", proof: "Bukti", exercise: "Latihan", problem: "Soal", solution: "Penyelesaian",
};

/** Converts list environments into Markdown lists, keeping nesting. */
function convertLists(s: string): string {
  const stack: ("ul" | "ol")[] = [];
  return s.replace(/\\begin\{(itemize|enumerate|description)\}|\\end\{(itemize|enumerate|description)\}|\\item(?:\[([^\]]*)\])?\s*/g, (_, begin, end, label) => {
    if (begin) { stack.push(begin === "enumerate" ? "ol" : "ul"); return "\n"; }
    if (end) { stack.pop(); return "\n"; }
    const indent = "  ".repeat(Math.max(stack.length - 1, 0));
    const marker = stack[stack.length - 1] === "ol" ? "1." : "-";
    return `\n${indent}${marker} ${label ? `**${label}** ` : ""}`;
  });
}

/** Applies fn to text outside $...$ / $$...$$ only. */
function outsideMath(s: string, fn: (t: string) => string): string {
  return s.split(/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\\n])+\$)/g).map((p, i) => (i % 2 ? p : fn(p))).join("");
}

/** Cleans a .tex file into Markdown + LaTeX that KaTeX can render. */
export function texToMarkdown(src: string): string {
  let s = src.replace(/\r\n?/g, "\n");
  // Comments (an unescaped % to the end of the line).
  s = s.replace(/(^|[^\\])%.*$/gm, "$1");
  s = expandSimpleMacros(s);
  const b = s.indexOf("\\begin{document}");
  if (b >= 0) {
    // Keep the title that usually sits in the preamble.
    const t = s.slice(0, b).match(/\\title\{([^}]*)\}/);
    s = (t ? `# ${t[1]}\n\n` : "") + s.slice(b + "\\begin{document}".length);
  }
  const e = s.indexOf("\\end{document}");
  if (e >= 0) s = s.slice(0, e);

  // Preamble-only commands, in case the file has no document environment.
  s = s.replace(/^\s*\\(documentclass|usepackage|RequirePackage|DeclareMathOperator|geometry|setlength|pagestyle|thispagestyle|bibliographystyle|graphicspath|hypersetup|newtheorem|theoremstyle|setcounter|input|include)\b.*$/gm, "");

  // Figures, tables with layout, and drawings cannot be shown.
  s = s.replace(/\\begin\{(figure|figure\*|tikzpicture|picture|wrapfigure)\}[\s\S]*?\\end\{\1\}/g, "\n*[Gambar tidak ditampilkan]*\n");
  s = s.replace(/\\includegraphics(\[[^\]]*\])?\{[^}]*\}/g, "*[Gambar tidak ditampilkan]*");

  // Math environments → $$ blocks. aligned/gathered work inside KaTeX display math.
  s = s.replace(new RegExp(`\\\\begin\\{(${MATH_ENVS})\\*?\\}([\\s\\S]*?)\\\\end\\{\\1\\*?\\}`, "g"), (_, env: string, body: string) => {
    body = body.replace(/\\label\{[^}]*\}|\\nonumber|\\notag/g, "").trim();
    if (env === "align" || env === "eqnarray") body = `\\begin{aligned}\n${body.replace(/&=&/g, "&=")}\n\\end{aligned}`;
    else if (env === "gather") body = `\\begin{gathered}\n${body}\n\\end{gathered}`;
    else if (env === "multline") body = `\\begin{gathered}\n${body}\n\\end{gathered}`;
    return `$$${body}$$`;
  });
  s = s.replace(/(^|[^\\])\\\[([\s\S]+?)\\\]/g, (_, pre, m) => `${pre}$$${m}$$`);
  s = s.replace(/(^|[^\\])\\\(([\s\S]+?)\\\)/g, (_, pre, m) => `${pre}$${m}$`);
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => `$$${m.replace(/\\label\{[^}]*\}/g, "")}$$`);

  s = convertLists(s);

  s = outsideMath(s, (t) => {
    t = replaceCmd(t, "title", (x) => `# ${x}\n`);
    t = replaceCmd(t, "chapter", (x) => `\n# ${x}\n`);
    t = replaceCmd(t, "section", (x) => `\n## ${x}\n`);
    t = replaceCmd(t, "subsection", (x) => `\n### ${x}\n`);
    t = replaceCmd(t, "subsubsection", (x) => `\n#### ${x}\n`);
    t = replaceCmd(t, "paragraph", (x) => `\n**${x}** `);
    t = replaceCmd(t, "textbf", (x) => `**${x}**`);
    t = replaceCmd(t, "textit", (x) => `*${x}*`);
    t = replaceCmd(t, "emph", (x) => `*${x}*`);
    t = replaceCmd(t, "texttt", (x) => `\`${x}\``);
    t = replaceCmd(t, "underline", (x) => x);
    t = replaceCmd(t, "footnote", (x) => ` (${x})`);
    t = replaceCmd(t, "url", (x) => `<${x}>`);
    t = t.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, "[$2]($1)");
    t = t.replace(/\\(?:cite|citep|citet)(\[[^\]]*\])?\{[^}]*\}/g, "[ref]");
    t = t.replace(/\\(?:eq)?ref\{[^}]*\}/g, "(ref)");
    for (const [env, name] of Object.entries(THEOREMS)) {
      t = t.replace(new RegExp(`\\\\begin\\{${env}\\*?\\}(\\[([^\\]]*)\\])?`, "g"), (_, __, opt) => `\n**${name}${opt ? ` (${opt})` : ""}.** `);
      t = t.replace(new RegExp(`\\\\end\\{${env}\\*?\\}`, "g"), "\n");
    }
    t = t.replace(/\\begin\{abstract\}/g, "\n**Abstrak.** ").replace(/\\end\{abstract\}/g, "\n");
    // Layout-only environments and commands.
    t = t.replace(/\\(begin|end)\{(center|flushleft|flushright|quote|quotation|minipage|small|footnotesize|large|Large)\}(\{[^}]*\})?/g, "\n");
    t = t.replace(/\\(label|vspace\*?|hspace\*?|author|date|thanks)\{[^}]*\}/g, "");
    t = t.replace(/\\(maketitle|tableofcontents|newpage|clearpage|noindent|centering|medskip|smallskip|bigskip|hfill|vfill|par|indent|today|small|footnotesize|large|Large|normalsize)\b/g, "");
    t = t.replace(/\\\\(\[[^\]]*\])?/g, "\n");
    t = t.replace(/---/g, "—").replace(/--/g, "–").replace(/``|''/g, '"').replace(/~/g, " ");
    t = t.replace(/\\([%&])/g, "$1");
    return t;
  });

  return normalizeMath(s.replace(/[ \t]+\n/g, "\n"));
}
