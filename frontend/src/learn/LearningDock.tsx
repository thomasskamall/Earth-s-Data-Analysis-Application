import { useEffect, useMemo, useState } from "react";
import Equation from "../components/Equation";
import Chat, { type ChatMessage } from "./Chat";
import { chatContext, type LearnContext } from "./context";
import { buildFacts } from "./facts";
import { GLOSSARY } from "./glossary";
import { buildQuiz } from "./quiz";
import { TerraAvatar, type Mood } from "./Terra";
import Tour from "./Tour";
import "./learn.css";

export type View = "home" | "chat" | "glossary" | "quiz" | "facts" | "howto";
export type DockRequest = { view: View | "tour"; n: number };

type Props = {
  ctx: LearnContext;
  curious: boolean;
  onVideo: () => void;
  onPdf: () => void;
  pdfBusy: string | null;
  request: DockRequest | null;
};

const TITLES: Record<View, string> = { home: "Learning tools", chat: "Ask Terra", glossary: "Science words", quiz: "Quiz time", facts: "Did you know?", howto: "How to use the app" };

export default function LearningDock({ ctx, curious, onVideo, onPdf, pdfBusy, request }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [tour, setTour] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bubble, setBubble] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const hasData = !!ctx.result;
  const r = ctx.result;
  const tipKey = ctx.loading ? "loading" : ctx.error ? `error:${ctx.error}` : r ? `ready:${r.param}:${r.lat}:${r.lon}:${r.coverage}` : ctx.place ? "" : "welcome";

  useEffect(() => {
    if (!request) return;
    if (request.view === "tour") { setOpen(false); setTour(true); }
    else { setView(request.view); setOpen(true); }
  }, [request]);
  useEffect(() => {
    if (!tipKey || open || tour || seen.has(tipKey)) { setBubble(null); return; }
    setBubble(tipKey);
    if (tipKey === "loading") return;
    const timer = window.setTimeout(() => setBubble((b) => (b === tipKey ? null : b)), tipKey === "welcome" ? 20000 : 16000);
    return () => window.clearTimeout(timer);
  }, [tipKey, open, tour, seen]);

  function dismiss() {
    if (bubble) setSeen(new Set(seen).add(bubble));
    setBubble(null);
  }
  function go(next: View) { dismiss(); setView(next); setOpen(true); }
  function startTour() { dismiss(); setOpen(false); setTour(true); }

  const mood: Mood = ctx.loading ? "think" : ctx.error ? "wow" : bubble ? "talk" : "happy";
  const where = ctx.place || "this place";
  const tip = !bubble ? null
    : bubble === "welcome" ? { text: "Hi, I'm Terra! 🌍 Pick a place on the map or search a city, and I'll help you understand its climate.", actions: [{ label: "🧭 Show me around", run: startTour }, { label: "💬 Ask me", run: () => go("chat") }] }
    : bubble === "loading" ? { text: "Fetching NASA data for you… 🛰️", actions: [] }
    : bubble.startsWith("error:") ? { text: "Hmm, that data did not load. I can help you find out why.", actions: [{ label: "💬 Ask Terra", run: () => go("chat") }] }
    : { text: `Your ${ctx.quantity.toLowerCase()} story for ${where} is ready! 🎉`, actions: [{ label: "🎬 Watch the video", run: () => { dismiss(); onVideo(); } }, { label: "🧩 Quiz me", run: () => go("quiz") }] };

  return (
    <>
      {tip && !open && (
        <div className={`terra-bubble ${curious ? "fun" : ""}`} role="status">
          <button type="button" className="terra-bubble-x" onClick={dismiss} aria-label="Dismiss tip">×</button>
          <p>{tip.text}</p>
          {!!tip.actions.length && <div className="terra-bubble-actions">{tip.actions.map((a) => <button key={a.label} type="button" onClick={a.run}>{a.label}</button>)}</div>}
        </div>
      )}
      <button type="button" className={`terra-fab ${bubble && !open ? "has-tip" : ""}`} onClick={() => { dismiss(); setOpen(!open); setView(open ? view : "home"); }} aria-expanded={open} aria-label={open ? "Close Terra's learning tools" : "Open Terra, your learning guide"} title="Terra · learning tools, video, chat and help">
        <TerraAvatar size={64} mood={open ? "talk" : mood} />
        <span className="terra-tag">{open ? "Close" : "Terra"}</span>
      </button>
      {open && (
        <aside className={`hub ${curious ? "fun" : ""}`} aria-label="Terra learning tools">
          <header className="hub-head">
            {view !== "home" ? <button type="button" className="hub-back" onClick={() => setView("home")} aria-label="Back to all tools">←</button> : <TerraAvatar size={40} mood="talk" />}
            <div className="hub-title"><h2>{TITLES[view]}</h2><span>{hasData ? `${ctx.quantity} · ${where}` : "Terra · your learning guide"}</span></div>
            <button type="button" className="hub-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>
          <div className={`hub-body ${view === "chat" ? "is-chat" : ""}`}>
            {view === "home" && <Home hasData={hasData} quantity={ctx.quantity} where={where} pdfBusy={pdfBusy} onVideo={onVideo} onPdf={onPdf} go={go} onTour={startTour} />}
            {view === "chat" && <Chat messages={messages} setMessages={setMessages} context={() => chatContext(ctx)} hasData={hasData} />}
            {view === "glossary" && <Glossary />}
            {view === "quiz" && (r ? <Quiz key={tipKey} ctx={ctx} /> : <Empty text="Pick a place first, then I'll quiz you about its data." />)}
            {view === "facts" && <Facts ctx={ctx} />}
            {view === "howto" && <HowTo onTour={startTour} />}
          </div>
        </aside>
      )}
      {tour && <Tour simple={curious} onClose={() => setTour(false)} />}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="hub-empty"><TerraAvatar size={70} mood="think" /><p>{text}</p></div>;
}

function Home({ hasData, quantity, where, pdfBusy, onVideo, onPdf, go, onTour }: { hasData: boolean; quantity: string; where: string; pdfBusy: string | null; onVideo: () => void; onPdf: () => void; go: (v: View) => void; onTour: () => void }) {
  const tiles: { icon: string; title: string; text: string; run: () => void; off?: boolean; color: string }[] = [
    { icon: "💬", title: "Ask Terra", text: "Chat about the data, science or math", run: () => go("chat"), color: "violet" },
    { icon: "🧭", title: "Guided tour", text: "A quick walk through the app", run: onTour, color: "teal" },
    { icon: "🧩", title: "Quiz", text: hasData ? "Test yourself on this data" : "Pick a place first", run: () => go("quiz"), off: !hasData, color: "orange" },
    { icon: "📖", title: "Science words", text: "Simple meanings and equations", run: () => go("glossary"), color: "blue" },
    { icon: "💡", title: "Did you know?", text: "Fun facts and data highlights", run: () => go("facts"), color: "yellow" },
    { icon: "📄", title: "PDF report", text: pdfBusy ?? (hasData ? "Save everything you see" : "Pick a place first"), run: onPdf, off: !hasData || !!pdfBusy, color: "pink" },
    { icon: "❓", title: "How to use", text: "Step-by-step help", run: () => go("howto"), color: "green" },
  ];
  return (
    <>
      <button type="button" className="hub-hero" disabled={!hasData} onClick={onVideo}>
        <span className="hub-hero-icon">🎬</span>
        <span className="hub-hero-text"><strong>Watch the data story</strong><span>{hasData ? `A narrated video about ${quantity.toLowerCase()} in ${where}` : "Pick a place first, then I'll make a video for you"}</span></span>
        <span className="hub-hero-play">▶</span>
      </button>
      <div className="hub-grid">
        {tiles.map((t) => <button key={t.title} type="button" className={`hub-tile tile-${t.color}`} onClick={t.run} disabled={t.off}><span className="hub-tile-icon">{t.icon}</span><strong>{t.title}</strong><span>{t.text}</span></button>)}
      </div>
    </>
  );
}

function Glossary() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const list = GLOSSARY.filter((t) => !q || t.term.toLowerCase().includes(q) || t.simple.toLowerCase().includes(q));
  return (
    <div className="glossary">
      <input className="hub-search" placeholder="🔍 Search a word, e.g. p-value" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the glossary" />
      {list.map((t) => (
        <button key={t.term} type="button" className={`term ${open === t.term ? "open" : ""}`} onClick={() => setOpen(open === t.term ? null : t.term)} aria-expanded={open === t.term}>
          <span className="term-head"><span className="term-icon">{t.icon}</span><strong>{t.term}</strong><span className="term-caret">{open === t.term ? "−" : "+"}</span></span>
          {open === t.term && <span className="term-body">
            <span>{t.simple}</span>
            {t.more && <span className="term-more">{t.more}</span>}
            {t.latex && <Equation latex={t.latex} label={t.term} />}
            {t.where && <span className="term-where">📍 In the app: {t.where}</span>}
          </span>}
        </button>
      ))}
      {!list.length && <p className="hub-note">No word matches “{query}”. Try asking Terra in the chat.</p>}
    </div>
  );
}

function Quiz({ ctx }: { ctx: LearnContext }) {
  const questions = useMemo(() => buildQuiz(ctx.result!, ctx.place || "this place", ctx.quantity, ctx.alpha), [ctx.result, ctx.place, ctx.quantity, ctx.alpha]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const done = index >= questions.length;
  if (done) {
    const ratio = score / questions.length;
    return (
      <div className="quiz-done">
        <div className="quiz-medal">{ratio >= 0.8 ? "🏆" : ratio >= 0.5 ? "🌟" : "🌱"}</div>
        <h3>{score} / {questions.length} correct</h3>
        <p>{ratio >= 0.8 ? "Amazing! You read climate data like a scientist." : ratio >= 0.5 ? "Great job! Check the glossary for the tricky ones." : "Good start! Every scientist learns step by step."}</p>
        <button type="button" className="hub-primary" onClick={() => { setIndex(0); setPicked(null); setScore(0); }}>Play again</button>
      </div>
    );
  }
  const q = questions[index];
  return (
    <div className="quiz">
      <div className="quiz-progress"><span style={{ width: `${(index / questions.length) * 100}%` }} /></div>
      <p className="quiz-count">Question {index + 1} of {questions.length} · ⭐ {score}</p>
      <h3>{q.q}</h3>
      <div className="quiz-options">
        {q.options.map((option, i) => {
          const state = picked === null ? "" : i === q.answer ? "right" : i === picked ? "wrong" : "dim";
          return <button key={option} type="button" className={`quiz-option ${state}`} disabled={picked !== null} onClick={() => { setPicked(i); if (i === q.answer) setScore(score + 1); }}>{state === "right" ? "✅ " : state === "wrong" ? "❌ " : ""}{option}</button>;
        })}
      </div>
      {picked !== null && <div className={`quiz-explain ${picked === q.answer ? "good" : "bad"}`}><strong>{picked === q.answer ? "Correct! 🎉" : "Not quite."}</strong> {q.explain}</div>}
      {picked !== null && <button type="button" className="hub-primary" onClick={() => { setIndex(index + 1); setPicked(null); }}>{index + 1 < questions.length ? "Next question →" : "See my score"}</button>}
    </div>
  );
}

function Facts({ ctx }: { ctx: LearnContext }) {
  const facts = useMemo(() => buildFacts(ctx.result, ctx.place || "this place", ctx.quantity), [ctx.result, ctx.place, ctx.quantity]);
  return (
    <div className="facts">
      {facts.map((f) => <div key={f.text} className={`fact ${f.fromData ? "from-data" : ""}`}><span className="fact-icon">{f.icon}</span><p>{f.text}{f.fromData && <em> · from your data</em>}</p></div>)}
    </div>
  );
}

function HowTo({ onTour }: { onTour: () => void }) {
  const steps = [
    ["📍", "Pick a place", "Search a city in the toolbar or click anywhere on the map."],
    ["🔍", "Choose what to explore", "Temperature, humidity, rainfall… or add any NASA POWER parameter from Data > Add a NASA POWER parameter."],
    ["📅", "Choose the years", "Use the year boxes or Analysis > Last 30 / 20 / 10 years."],
    ["📈", "Read the four panels", "Time series (top-left), map (top-right), trend and future (bottom-left), what it means (bottom-right). Click □ to enlarge a panel."],
    ["🎬", "Watch the data story", "Open Terra and press “Watch the data story”. You can download the video too."],
    ["💬", "Ask Terra", "Ask any question about the data, the math or the science."],
    ["📄", "Save your work", "PDF report from Terra or File menu; CSV data and PNG charts from the File menu."],
  ];
  return (
    <div className="howto">
      <ol>{steps.map(([icon, title, text]) => <li key={title}><span className="howto-icon">{icon}</span><span><strong>{title}</strong><br />{text}</span></li>)}</ol>
      <button type="button" className="hub-primary" onClick={onTour}>🧭 Start the guided tour</button>
    </div>
  );
}
