import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export default function Equation({ latex, label }: { latex: string; label?: string }) {
  const html = useMemo(() => katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    strict: "warn",
    trust: false,
    output: "htmlAndMathml",
  }), [latex]);
  return (
    <div className="equation-block" role="group" aria-label={label ?? "Scientific equation"}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
