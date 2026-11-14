const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const katex = require('katex');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  cache.set(filename, module.exports);
  function localRequire(name) {
    if (name.endsWith('.css')) return {};
    if (name === './Plot') return { __esModule: true, default: () => React.createElement('div'), savePng: () => {} };
    if (!name.startsWith('.')) return require(name);
    const candidate = path.resolve(path.dirname(filename), name);
    const resolved = ['.ts', '.tsx', '.js'].map(ext => candidate + ext).find(p => fs.existsSync(p));
    if (!resolved) throw new Error('Cannot resolve ' + candidate);
    return load(resolved);
  }
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  cache.set(filename, module.exports);
  return module.exports;
}
const { getScience } = load(path.join(root, 'src/data/science.ts'));
const { PARAMS } = load(path.join(root, 'src/roles.ts'));
let count = 0;
for (const param of PARAMS) for (const equation of getScience(param.code).equations) {
  katex.renderToString(equation.latex, { throwOnError: true, displayMode: true, strict: 'error', trust: false });
  count++;
}
if (process.argv[2]) {
  const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const TrendPane = load(path.join(root, 'src/components/TrendPane.tsx')).default;
  const DeepAnalysis = load(path.join(root, 'src/components/DeepAnalysis.tsx')).default;
  for (const element of [React.createElement(TrendPane, { result, horizon: 5, onHorizon: () => {} }), React.createElement(DeepAnalysis, { result })]) {
    const html = renderToStaticMarkup(element);
    if (html.includes('katex-error')) throw new Error('Data-dependent equation rendering failed');
    count += (html.match(/class="katex"/g) || []).length;
  }
}
console.log(`${count} rendered equations checked without syntax errors.`);
