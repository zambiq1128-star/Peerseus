"use client";
import "katex/dist/katex.min.css";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMath } from "@/lib/latex";

/*
 * Safety: react-markdown never renders raw HTML (no rehype-raw), drops unsafe link URLs
 * (javascript: etc.), and KaTeX runs with trust: false so \href / \htmlClass are disabled.
 * Broken formulas are shown as red source text instead of crashing the page.
 */
const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: [typeof rehypeKatex, Parameters<typeof rehypeKatex>[0]][] = [
  [rehypeKatex, { errorColor: "#dc2626", strict: "ignore", trust: false, maxSize: 20, maxExpand: 200 }],
];
const blockComponents: Components = {
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
  table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
};

/** Renders a material written in Markdown + LaTeX. */
export const MarkdownView = memo(function MarkdownView({ text, className = "" }: { text: string; className?: string }) {
  const src = useMemo(() => normalizeMath(text), [text]);
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={blockComponents} disallowedElements={["img"]} unwrapDisallowed skipHtml>
        {src}
      </ReactMarkdown>
    </div>
  );
});

const inlineComponents: Components = {
  p: ({ children }) => <>{children}</>,
  a: ({ children }) => <span className="underline">{children}</span>,
};

/** Short text with inline math, e.g. a quiz question or option. Safe inside buttons. */
export const MathText = memo(function MathText({ text }: { text: string }) {
  // Only pay for Markdown/KaTeX when the text actually has math or formatting.
  if (!/[$\\*_`]/.test(text)) return <>{text}</>;
  return (
    <span className="md-inline">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={inlineComponents} disallowedElements={["img"]} unwrapDisallowed skipHtml>
        {text}
      </ReactMarkdown>
    </span>
  );
});
