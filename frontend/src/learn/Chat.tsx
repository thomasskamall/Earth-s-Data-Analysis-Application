import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./markdown";
import { TerraAvatar } from "./Terra";

export type ChatMessage = { role: "user" | "assistant"; content: string; mode?: "ai" | "offline"; notice?: string | null };

const STARTERS_DATA = ["Explain this chart to me", "Is the trend real or just luck?", "Why is one month the highest?", "What does the prediction mean?"];
const STARTERS_ANY = ["What is a p-value?", "How does NASA measure this from space?", "What is the greenhouse effect?", "Climate vs weather?"];

type Props = {
  messages: ChatMessage[];
  setMessages: (update: (current: ChatMessage[]) => ChatMessage[]) => void;
  context: () => object;
  hasData: boolean;
};

export default function Chat({ messages, setMessages, context, hasData }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, pending, problem]);

  async function send(question: string) {
    const content = question.trim();
    if (!content || pending) return;
    const history = [...messages, { role: "user" as const, content }];
    setMessages(() => history);
    setText("");
    setProblem(null);
    setPending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12).map(({ role, content: c }) => ({ role, content: c.slice(0, 4000) })), context: context() }),
      });
      if (!response.ok) {
        let detail = `The backend answered with error ${response.status}.`;
        try { const body = await response.json(); if (typeof body.detail === "string") detail = body.detail; } catch { /* keep message */ }
        if (response.status === 404) detail = "This backend has no chat yet. Restart the backend from the updated project folder.";
        throw new Error(detail);
      }
      const answer = await response.json();
      if (typeof answer.reply !== "string" || !answer.reply.trim()) throw new Error("Terra returned an empty answer. Please try again.");
      setMessages((current) => [...current, { role: "assistant", content: answer.reply, mode: answer.mode, notice: answer.notice }]);
    } catch (error) {
      setMessages(() => history.slice(0, -1));
      setText(content);
      setProblem(error instanceof TypeError ? "The backend is not answering. Keep the backend window running." : error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const starters = hasData ? STARTERS_DATA : STARTERS_ANY;
  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {!messages.length && (
          <div className="chat-welcome">
            <TerraAvatar size={54} mood="talk" />
            <p><strong>Ask me anything!</strong> I can explain the charts, the statistics, the equations and the science behind {hasData ? "this data" : "Earth's climate"}.</p>
          </div>
        )}
        {messages.map((message, i) => message.role === "user"
          ? <div key={i} className="chat-msg chat-user">{message.content}</div>
          : <div key={i} className="chat-row">
              <TerraAvatar size={30} />
              <div className="chat-msg chat-terra">
                <div className="chat-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
                {message.mode === "offline" && <small className="chat-notice">📴 {message.notice ?? "Offline tutor mode."}</small>}
              </div>
            </div>)}
        {pending && <div className="chat-row"><TerraAvatar size={30} mood="think" /><div className="chat-msg chat-terra chat-typing"><span /><span /><span /></div></div>}
        {problem && <p className="chat-problem" role="alert">⚠️ {problem} <button type="button" onClick={() => send(text)}>Try again</button></p>}
        <div ref={end} />
      </div>
      {!pending && <div className="chat-starters">{starters.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}</div>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea
          aria-label="Ask Terra a question"
          placeholder="Type your question…"
          rows={1}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
        />
        <button type="submit" disabled={pending || !text.trim()} aria-label="Send">➤</button>
      </form>
    </div>
  );
}
