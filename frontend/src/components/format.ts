export function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 0.001 || abs >= 1e6) return value.toExponential(2);
  return String(Number(value.toPrecision(3)));
}
export function signed(value: number): string {
  return (value > 0 ? "+" : "") + fmt(value);
}
export function pText(p: number): string {
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}
export function latexNumber(value: number): string {
  const text = fmt(value);
  return text.includes("e") ? text.replace(/e([+-]?\d+)/, (_, exponent) => `\\times 10^{${Number(exponent)}}`) : text;
}
