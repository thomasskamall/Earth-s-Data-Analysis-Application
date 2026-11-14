// A small, HTML-safe Markdown renderer with KaTeX math for chat replies.
import katex from "katex";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text: string) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(source: string): string {
  const math: string[] = [];
  const keep = (latex: string, display: boolean) => {
    math.push(katex.renderToString(latex.trim(), { displayMode: display, throwOnError: false, strict: "ignore", trust: false, output: "html" }));
    return `\u0000${math.length - 1}\u0000`;
  };
  let text = source
    .replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => keep(a ?? b, true))
    .replace(/\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g, (_, a, b) => keep(a ?? b, false));
  text = escape(text);

  let html = "";
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flush = () => { if (para.length) { html += `<p>${inline(para.join(" "))}</p>`; para = []; } };
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) { flush(); close(); }
    else if (heading) { flush(); close(); html += `<h4>${inline(heading[1])}</h4>`; }
    else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) { close(); html += `<${kind}>`; list = kind; }
      html += `<li>${inline((bullet ?? numbered)![1])}</li>`;
    } else { close(); para.push(line.trim()); }
  }
  flush(); close();
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => math[Number(i)]);
}
