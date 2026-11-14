// Tiny happy sounds made in the browser, so no audio files are needed.
export function chime(audio: AudioContext, outputs: AudioNode[], step: number) {
  const now = audio.currentTime + 0.02;
  const scale = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  [0, 1].forEach((i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = scale[(step + i * 2) % scale.length];
    gain.gain.setValueAtTime(0, now + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.12, now + i * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.6);
    osc.connect(gain);
    outputs.forEach((out) => gain.connect(out));
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.65);
  });
}
