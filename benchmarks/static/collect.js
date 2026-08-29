#!/usr/bin/env node
/*
 * collect.js — B7: metryki statyczne kodu obu implementacji.
 *
 * Zbiera trzy grupy miar dla apps/functional i apps/oop:
 *   1. rozmiar    — liczba plikow, linie fizyczne, SLOC (bez pustych i komentarzy)
 *   2. zlozonosc  — cyklomatyczna per funkcja (regula ESLint `complexity`)
 *   3. zagniezdzenie — glebokosc blokow (regula ESLint `max-depth`)
 *
 * Kazdy plik jest przypisany do JEDNEJ warstwy porownawczej. Warstwy sa wspolne
 * dla obu implementacji, mimo ze katalogi maja rozne nazwy — dopiero to czyni
 * liczby porownywalnymi (np. functional `shell/db` odpowiada OOP `*Repository.ts`).
 *
 * Wyjscie:
 *   - stdout: tabele w formacie zgodnym z benchmarks/analysis/compare.py (ramka 70)
 *   - benchmarks/static/out/static_metrics.json: dane surowe, per plik i per funkcja
 *
 * OGRANICZENIE MIARY (istotne dla interpretacji, opisane w README.md):
 * zlozonosc cyklomatyczna liczy rozgalezienia sterowania w skladni jezyka.
 * Kod fp-ts przenosi rozgalezienia do kombinatorow (`chain`, `fold`, `orElse`),
 * ktore z punktu widzenia parsera sa zwyklymi wywolaniami funkcji. Miara
 * systematycznie ZANIZA zlozonosc implementacji funkcyjnej wzgledem obiektowej.
 * Nie wolno czytac jej jako "kod funkcyjny jest prostszy".
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ESLint } = require('eslint');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(__dirname, 'out');

const APPS = [
  { key: 'functional', label: 'Functional', dir: path.join(ROOT, 'apps/functional') },
  { key: 'oop', label: 'OOP', dir: path.join(ROOT, 'apps/oop') },
];

// Kolejnosc warstw = kolejnosc wierszy we wszystkich tabelach.
const LAYERS = [
  'Warstwa HTTP',
  'Logika domenowa',
  'Dostęp do danych',
  'Walidacja',
  'Typy i model',
  'Infrastruktura',
  'Bootstrap i serwer',
];
const TESTS = 'Testy';

// ─────────────────────────────────────────────────────────────────────────────
// Przypisanie plikow do warstw
// ─────────────────────────────────────────────────────────────────────────────

function classifyFunctional(rel) {
  if (rel.startsWith('__tests__/')) return TESTS;
  if (rel === 'src/index.ts' || rel === 'src/common/shell/server.ts') return 'Bootstrap i serwer';
  if (rel.startsWith('src/common/')) return 'Infrastruktura';
  if (rel.includes('/core/usecases/')) return 'Logika domenowa';
  if (rel.includes('/core/types/') || rel.includes('/core/effects/')) return 'Typy i model';
  if (rel.includes('/shell/dtos/')) return 'Typy i model';
  if (rel.includes('/shell/routes/') || rel.includes('/shell/factories/')) return 'Warstwa HTTP';
  if (rel.includes('/shell/db/')) return 'Dostęp do danych';
  if (rel.includes('/shell/validation/')) return 'Walidacja';
  return null;
}

function classifyOop(rel) {
  if (rel.startsWith('__tests__/')) return TESTS;
  if (rel === 'src/index.ts' || rel === 'src/app.ts') return 'Bootstrap i serwer';
  if (rel.startsWith('src/common/')) return 'Infrastruktura';
  if (rel.includes('/validators/')) return 'Walidacja';
  if (rel.includes('/dtos/') || /Types\.ts$/.test(rel)) return 'Typy i model';
  if (/Service\.ts$/.test(rel)) return 'Logika domenowa';
  if (/Repository\.ts$/.test(rel)) return 'Dostęp do danych';
  if (/Controller\.ts$/.test(rel)) return 'Warstwa HTTP';
  return null;
}

const CLASSIFIERS = { functional: classifyFunctional, oop: classifyOop };

// ─────────────────────────────────────────────────────────────────────────────
// Zliczanie linii
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Heurystyka w stylu cloc: blok komentarza rozpoznawany tylko wtedy, gdy linia
 * ZACZYNA sie od `/*`. Dzieki temu `/*` wewnatrz literalu tekstowego (np. w SQL)
 * nie przestawia licznika w tryb komentarza. Cena: komentarz blokowy dopisany
 * na koncu linii kodu jest liczony jako kod — takich linii w repozytorium nie ma.
 */
function countLines(source) {
  const lines = source.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let code = 0, comment = 0, blank = 0, inBlock = false;

  for (const line of lines) {
    const t = line.trim();
    if (inBlock) {
      comment++;
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t === '') { blank++; continue; }
    if (t.startsWith('//')) { comment++; continue; }
    if (t.startsWith('/*')) {
      comment++;
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    code++;
  }
  return { total: lines.length, code, comment, blank };
}

/*
 * Liczba tras Express zarejestrowanych w pliku. Sluzy do normalizacji rozmiaru
 * warstwy HTTP: functional trzyma jeden endpoint w jednym pliku, OOP grupuje po
 * kilka w kontrolerze, wiec sam SLOC per plik nie jest porownywalny.
 */
function countEndpoints(source) {
  const m = source.match(/(?:app|router|this\.router)\.(?:get|post|put|patch|delete)\(/g);
  return m ? m.length : 0;
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
      walk(p, acc);
    } else if (entry.name.endsWith('.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESLint jako zrodlo zlozonosci
// ─────────────────────────────────────────────────────────────────────────────

/*
 * Progi ustawione na 0, wiec kazda funkcja i kazdy blok LAMIE regule — komunikat
 * naruszenia niesie zmierzona wartosc. To standardowy sposob wyciagniecia metryki
 * z ESLinta, ktory nie ma trybu raportowania.
 */
async function lintAll(files) {
  const eslint = new ESLint({
    useEslintrc: false,
    overrideConfig: {
      parser: require.resolve('@typescript-eslint/parser'),
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
      rules: { complexity: ['error', 0], 'max-depth': ['error', 0] },
    },
  });
  const results = await eslint.lintFiles(files);
  const byFile = new Map();

  for (const r of results) {
    const functions = [];
    const depths = [];
    for (const m of r.messages) {
      if (m.ruleId === 'complexity') {
        const cc = /has a complexity of (\d+)/.exec(m.message);
        const name = /^(.*?) has a complexity of/.exec(m.message);
        if (cc) functions.push({ name: name ? name[1] : 'function', line: m.line, cc: Number(cc[1]) });
      } else if (m.ruleId === 'max-depth') {
        const d = /nested too deeply \((\d+)\)/.exec(m.message);
        if (d) depths.push(Number(d[1]));
      }
    }
    byFile.set(r.filePath, { functions, depths });
  }
  return byFile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zebranie danych jednej implementacji
// ─────────────────────────────────────────────────────────────────────────────

async function collectApp(app) {
  const files = [...walk(path.join(app.dir, 'src')), ...walk(path.join(app.dir, '__tests__'))].sort();
  const lint = await lintAll(files);
  const records = [];
  const unclassified = [];

  for (const abs of files) {
    const rel = path.relative(app.dir, abs);
    const layer = CLASSIFIERS[app.key](rel);
    if (!layer) { unclassified.push(rel); continue; }
    const source = fs.readFileSync(abs, 'utf8');
    const lines = countLines(source);
    const l = lint.get(abs) || { functions: [], depths: [] };
    records.push({
      file: rel,
      layer,
      declarationOnly: rel.endsWith('.d.ts'),
      endpoints: countEndpoints(source),
      ...lines,
      functions: l.functions,
      depths: l.depths,
    });
  }
  return { ...app, records, unclassified };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agregacje
// ─────────────────────────────────────────────────────────────────────────────

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function aggregate(records) {
  const ccs = records.flatMap((r) => r.functions.map((f) => f.cc));
  const depths = records.flatMap((r) => r.depths);
  const sloc = sum(records.map((r) => r.code));
  return {
    files: records.length,
    endpoints: sum(records.map((r) => r.endpoints)),
    declarationFiles: records.filter((r) => r.declarationOnly).length,
    total: sum(records.map((r) => r.total)),
    sloc,
    comment: sum(records.map((r) => r.comment)),
    blank: sum(records.map((r) => r.blank)),
    slocPerFile: records.length ? sloc / records.length : 0,
    functions: ccs.length,
    ccSum: sum(ccs),
    ccMean: ccs.length ? sum(ccs) / ccs.length : 0,
    ccMedian: median(ccs),
    ccMax: ccs.length ? Math.max(...ccs) : 0,
    ccOver10: ccs.filter((c) => c > 10).length,
    ccDensity: sloc ? (sum(ccs) / sloc) * 100 : 0,
    cc1: ccs.filter((c) => c === 1).length,
    cc2to4: ccs.filter((c) => c >= 2 && c <= 4).length,
    cc5to10: ccs.filter((c) => c >= 5 && c <= 10).length,
    depthMax: depths.length ? Math.max(...depths) : 0,
    depth2: depths.filter((d) => d >= 2).length,
    depth3: depths.filter((d) => d >= 3).length,
  };
}

const production = (app) => app.records.filter((r) => r.layer !== TESTS);
const byLayer = (app, layer) => app.records.filter((r) => r.layer === layer);

// ─────────────────────────────────────────────────────────────────────────────
// Tabele — format zgodny z compare.py (_W = 70)
// ─────────────────────────────────────────────────────────────────────────────

const W = 70;

function row(label, fv, ov, fmt = 0, withDelta = true) {
  const f = fv === null ? '—' : Number(fv).toFixed(fmt);
  const o = ov === null ? '—' : Number(ov).toFixed(fmt);
  let d = '';
  if (withDelta && fv !== null && ov !== null && ov !== 0) {
    d = `${((fv - ov) / Math.abs(ov)) * 100 >= 0 ? '+' : ''}${(((fv - ov) / Math.abs(ov)) * 100).toFixed(1)}%`;
  }
  console.log(`│  ${label.padEnd(27)} ${f.padStart(14)} ${o.padStart(14)} ${d.padStart(8)}  │`);
}

const sep = () => console.log(`├${'─'.repeat(W)}┤`);

function open(title) {
  console.log(`\n┌${'─'.repeat(W)}┐`);
  console.log(`│  ${title}`.padEnd(W + 1) + '│');
  sep();
  console.log(`│  ${'Metryka'.padEnd(27)} ${'Functional'.padStart(14)} ${'OOP'.padStart(14)} ${'Δ'.padStart(8)}  │`);
  sep();
}

const close = () => console.log(`└${'─'.repeat(W)}┘\n`);

function layerTable(title, f, o, pick, fmt = 0) {
  open(title);
  for (const layer of LAYERS) {
    row(layer, pick(aggregate(byLayer(f, layer))), pick(aggregate(byLayer(o, layer))), fmt);
  }
  sep();
  row('RAZEM (bez testów)', pick(aggregate(production(f))), pick(aggregate(production(o))), fmt);
  close();
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const [f, o] = await Promise.all(APPS.map(collectApp));

  for (const app of [f, o]) {
    if (app.unclassified.length) {
      console.log(`\n⚠ ${app.label}: pliki bez przypisanej warstwy (${app.unclassified.length}):`);
      app.unclassified.forEach((r) => console.log(`   ${r}`));
      console.log('   Uzupełnij klasyfikator w benchmarks/static/collect.js.\n');
    }
  }

  const fp = aggregate(production(f));
  const op = aggregate(production(o));
  const ft = aggregate(byLayer(f, TESTS));
  const ot = aggregate(byLayer(o, TESTS));

  open('PODSUMOWANIE — kod produkcyjny (bez testów)');
  row('pliki .ts', fp.files, op.files);
  row('w tym pliki .d.ts', fp.declarationFiles, op.declarationFiles);
  row('linie fizyczne', fp.total, op.total);
  row('SLOC (kod)', fp.sloc, op.sloc);
  row('linie komentarza', fp.comment, op.comment);
  row('linie puste', fp.blank, op.blank);
  row('śr. SLOC / plik', fp.slocPerFile, op.slocPerFile, 1);
  sep();
  row('funkcje (jednostki CC)', fp.functions, op.functions);
  row('suma CC', fp.ccSum, op.ccSum);
  row('śr. CC / funkcję', fp.ccMean, op.ccMean, 2);
  row('mediana CC', fp.ccMedian, op.ccMedian, 1);
  row('max CC', fp.ccMax, op.ccMax);
  row('funkcje o CC > 10', fp.ccOver10, op.ccOver10);
  row('CC na 100 SLOC', fp.ccDensity, op.ccDensity, 2);
  sep();
  const fh = aggregate(byLayer(f, 'Warstwa HTTP'));
  const oh = aggregate(byLayer(o, 'Warstwa HTTP'));
  row('punkty końcowe API', fp.endpoints, op.endpoints);
  row('w warstwie HTTP', fh.endpoints, oh.endpoints);
  row('SLOC HTTP / punkt końcowy', fh.endpoints ? fh.sloc / fh.endpoints : null,
    oh.endpoints ? oh.sloc / oh.endpoints : null, 1);
  sep();
  row('max głębokość bloków', fp.depthMax, op.depthMax);
  row('bloki na głębokości ≥ 2', fp.depth2, op.depth2);
  row('bloki na głębokości ≥ 3', fp.depth3, op.depth3);
  close();

  layerTable('SLOC (kod) według warstwy porównawczej', f, o, (a) => a.sloc);
  layerTable('Liczba plików według warstwy porównawczej', f, o, (a) => a.files);
  layerTable('Suma złożoności cyklomatycznej według warstwy', f, o, (a) => a.ccSum);
  layerTable('Średnie CC funkcji według warstwy', f, o, (a) => (a.functions ? a.ccMean : null), 2);
  layerTable('Maksymalne CC funkcji według warstwy', f, o, (a) => (a.functions ? a.ccMax : null));

  open('Rozkład złożoności cyklomatycznej (kod produkcyjny)');
  row('funkcje o CC = 1', fp.cc1, op.cc1);
  row('funkcje o CC 2–4', fp.cc2to4, op.cc2to4);
  row('funkcje o CC 5–10', fp.cc5to10, op.cc5to10);
  row('funkcje o CC > 10', fp.ccOver10, op.ccOver10);
  sep();
  row('udział CC = 1 (%)', fp.functions ? (fp.cc1 / fp.functions) * 100 : null,
    op.functions ? (op.cc1 / op.functions) * 100 : null, 1);
  row('udział CC > 4 (%)', fp.functions ? ((fp.cc5to10 + fp.ccOver10) / fp.functions) * 100 : null,
    op.functions ? ((op.cc5to10 + op.ccOver10) / op.functions) * 100 : null, 1);
  close();

  open('Kod testowy');
  row('pliki testów', ft.files, ot.files);
  row('SLOC testów', ft.sloc, ot.sloc);
  row('śr. SLOC / plik testu', ft.slocPerFile, ot.slocPerFile, 1);
  row('SLOC testów / SLOC kodu', fp.sloc ? ft.sloc / fp.sloc : null, op.sloc ? ot.sloc / op.sloc : null, 2);
  row('funkcje w testach', ft.functions, ot.functions);
  close();

  for (const [app, agg] of [[f, fp], [o, op]]) {
    const top = production(app)
      .flatMap((r) => r.functions.map((fn) => ({ ...fn, file: r.file })))
      .sort((a, b) => b.cc - a.cc)
      .slice(0, 10);
    console.log(`► Dziesięć najbardziej złożonych funkcji — ${app.label} (suma CC = ${agg.ccSum})`);
    top.forEach((t, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. CC ${String(t.cc).padStart(2)}  ${t.file}:${t.line}  ${t.name}`);
    });
    console.log('');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    layers: LAYERS,
    apps: Object.fromEntries([f, o].map((app) => [app.key, {
      label: app.label,
      production: aggregate(production(app)),
      tests: aggregate(byLayer(app, TESTS)),
      byLayer: Object.fromEntries(LAYERS.map((l) => [l, aggregate(byLayer(app, l))])),
      files: app.records,
    }])),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'static_metrics.json');
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`Dane surowe: ${path.relative(ROOT, outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
