import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis } from "../api/client";
import { buildStory, sceneAt } from "../video/story";
import { drawFrame, H, W } from "../video/draw";
import { chime } from "../video/sound";

type Props = { result: Analysis; place: string; quantity: string; onClose: () => void };
const FORMATS = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return english.find((v) => /natural|aria|jenny|guy|google/i.test(v.name)) ?? english[0] ?? voices[0] ?? null;
}

/** A one-minute animated, narrated video that explains the selected data. */
export default function ExplainerVideo({ result, place, quantity, onClose }: Props) {
  const story = useMemo(() => buildStory(result, place, quantity), [result, place, quantity]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const playingRef = useRef(false);
  const voiceRef = useRef("speechSynthesis" in window);
  const recordingRef = useRef(false);
  const speaking = useRef(false);
  const caption = useRef<number | undefined>(undefined);
  const token = useRef(0);
  const scene = useRef(-1);
  const held = useRef(0);
  const poster = useRef(true);
  const audio = useRef<AudioContext | null>(null);
  const recordOut = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(() => "speechSynthesis" in window);
  const [recording, setRecording] = useState(false);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<{ url: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canRecord = typeof MediaRecorder !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;

  function stopVoice() {
    token.current++;
    speaking.current = false;
    caption.current = undefined;
    window.speechSynthesis?.cancel();
  }
  function startScene(index: number) {
    scene.current = index;
    held.current = 0;
    const ctx = audio.current;
    if (ctx) chime(ctx, recordOut.current ? [ctx.destination, recordOut.current] : [ctx.destination], index);
    stopVoice();
    if (!voiceRef.current || recordingRef.current || !("speechSynthesis" in window)) return;
    const mine = token.current;
    const lines = story.scenes[index].speech;
    const chosen = pickVoice();
    speaking.current = true;
    caption.current = 0;
    lines.forEach((text, i) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (chosen) utterance.voice = chosen;
      utterance.rate = 0.98;
      utterance.pitch = 1.05;
      utterance.onstart = () => { if (token.current === mine) caption.current = i; };
      const done = () => { if (token.current === mine && i === lines.length - 1) speaking.current = false; };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });
  }

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let last = performance.now();
    let lastUi = 0;
    document.fonts?.load('800 40px "Cairo"').catch(() => undefined);
    const tick = (time: number) => {
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;
      if (playingRef.current) {
        const current = story.scenes[sceneAt(story, clock.current)];
        const end = current.start + current.duration;
        // While the narrator is still talking, hold the scene instead of cutting the voice off.
        const hold = speaking.current && !recordingRef.current && clock.current + dt >= end - 0.05 && held.current < 10;
        if (hold) held.current += dt;
        else clock.current = Math.min(story.total, clock.current + dt);
        const index = sceneAt(story, clock.current);
        if (index !== scene.current) startScene(index);
        if (clock.current >= story.total) finish();
      }
      if (poster.current && !playingRef.current) {
        // Paused at the start of a scene: show it fully drawn, like a video thumbnail.
        const item = story.scenes[sceneAt(story, clock.current)];
        drawFrame(ctx, story, item.start + item.duration * 0.85, 0);
      } else drawFrame(ctx, story, clock.current, voiceRef.current && !recordingRef.current ? caption.current : undefined);
      if (time - lastUi > 200) { lastUi = time; setNow(clock.current); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [story]);

  useEffect(() => () => {
    playingRef.current = false;
    window.speechSynthesis?.cancel();
    if (recorder.current?.state === "recording") recorder.current.stop();
    audio.current?.close().catch(() => undefined);
  }, []);
  useEffect(() => () => { if (saved) URL.revokeObjectURL(saved.url); }, [saved]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !recordingRef.current) onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  function ensureAudio() {
    if (!audio.current) {
      try { audio.current = new AudioContext(); } catch { audio.current = null; }
    }
    audio.current?.resume().catch(() => undefined);
  }
  function finish() {
    playingRef.current = false;
    setPlaying(false);
    if (recordingRef.current) {
      recordingRef.current = false;
      setRecording(false);
      if (recorder.current?.state === "recording") recorder.current.stop();
    }
  }
  function play() {
    ensureAudio();
    if (clock.current >= story.total - 0.01) { clock.current = 0; scene.current = -1; }
    poster.current = false;
    playingRef.current = true;
    setPlaying(true);
    if (window.speechSynthesis?.paused) window.speechSynthesis.resume();
    else if (scene.current === -1 || !speaking.current) startScene(sceneAt(story, clock.current));
  }
  function pause() {
    playingRef.current = false;
    setPlaying(false);
    if (speaking.current) window.speechSynthesis?.pause();
  }
  function seek(index: number) {
    if (recordingRef.current) return;
    window.speechSynthesis?.resume();
    stopVoice();
    clock.current = story.scenes[index].start;
    scene.current = -1;
    poster.current = !playingRef.current;
    if (playingRef.current) startScene(index);
    setNow(clock.current);
  }
  function toggleVoice() {
    const next = !voice;
    voiceRef.current = next;
    setVoice(next);
    if (!next) { window.speechSynthesis?.resume(); stopVoice(); }
    else if (playingRef.current) startScene(sceneAt(story, clock.current));
  }

  function record() {
    const element = canvas.current;
    if (!element || !canRecord) return;
    ensureAudio();
    window.speechSynthesis?.resume();
    stopVoice();
    const type = FORMATS.find((format) => MediaRecorder.isTypeSupported(format)) ?? "";
    const stream = element.captureStream(30);
    if (audio.current) {
      recordOut.current = audio.current.createMediaStreamDestination();
      recordOut.current.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined); }
    catch { setNotice("This browser cannot record video. Try Chrome or Edge."); return; }
    rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recordOut.current = null;
      const mime = rec.mimeType || type || "video/webm";
      const blob = new Blob(chunks, { type: mime });
      const name = `earthpulse-story-${result.param}-${place.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${mime.includes("mp4") ? "mp4" : "webm"}`;
      const url = URL.createObjectURL(blob);
      setSaved({ url, name });
      const link = document.createElement("a");
      link.href = url; link.download = name; link.click();
    };
    recorder.current = rec;
    poster.current = false;
    clock.current = 0;
    scene.current = -1;
    recordingRef.current = true;
    playingRef.current = true;
    setRecording(true);
    setPlaying(true);
    setSaved(null);
    setNotice(null);
    rec.start(1000);
  }
  function cancelRecording() {
    recordingRef.current = false;
    playingRef.current = false;
    setRecording(false);
    setPlaying(false);
    if (recorder.current?.state === "recording") { recorder.current.ondataavailable = null; recorder.current.onstop = null; recorder.current.stop(); }
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recordOut.current = null;
  }

  const active = sceneAt(story, now);
  const seconds = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  return (
    <div className="video-backdrop" role="dialog" aria-modal="true" aria-label="Data story video">
      <div className="video-panel">
        <header className="video-head">
          <h2>🎬 Data story video</h2>
          <span className="video-sub">{quantity} · {place}</span>
          <button type="button" className="video-close" onClick={onClose} disabled={recording} aria-label="Close video">×</button>
        </header>
        <div className="video-stage">
          <canvas ref={canvas} width={W} height={H} onClick={() => !recording && (playing ? pause() : play())} />
          {!playing && !recording && <button type="button" className="video-big-play" onClick={play} aria-label="Play video">▶</button>}
        </div>
        <div className="video-scenes" aria-label="Scenes">
          {story.scenes.map((item, i) => (
            <button key={item.kind} type="button" className={i === active ? "on" : ""} onClick={() => seek(i)} disabled={recording} title={item.title}>
              <span>{item.icon}</span>{item.title}
            </button>
          ))}
        </div>
        <div className="video-controls">
          <button type="button" className="video-btn primary" onClick={playing ? pause : play} disabled={recording}>{playing ? "⏸ Pause" : "▶ Play"}</button>
          <button type="button" className="video-btn" onClick={() => seek(0)} disabled={recording}>⏮ Restart</button>
          <label className="video-toggle"><input type="checkbox" checked={voice} onChange={toggleVoice} disabled={recording || !("speechSynthesis" in window)} />🔊 Narrator voice</label>
          <span className="video-time">{seconds(now)} / {seconds(story.total)}</span>
          {recording
            ? <button type="button" className="video-btn danger" onClick={cancelRecording}>■ Stop recording</button>
            : <button type="button" className="video-btn record" onClick={record} disabled={!canRecord}>⬇ Download video</button>}
        </div>
        <p className="video-note">
          {recording ? "🔴 Recording in real time… keep this tab open and visible until it finishes."
            : saved ? <>✅ Saved <a href={saved.url} download={saved.name}>{saved.name}</a>. The file has subtitles and sound effects; the narrator voice plays only inside the app.</>
            : notice ?? (canRecord ? "Tip: press Play to watch with narration, or Download video to save it with subtitles." : "Video download needs Chrome or Edge. You can still watch it here.")}
        </p>
      </div>
    </div>
  );
}
