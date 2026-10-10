const test = require('node:test');
const assert = require('node:assert/strict');
const benchmark = require('./motor6-pattern-benchmark.js');

test('benchmark is pinned to the EP Lab H1 study configuration', () => {
  assert.equal(benchmark.study.version, 'structural-detectors-v1');
  assert.equal(benchmark.study.timeframe, 'H1');
  assert.equal(benchmark.study.contextCandles, 96);
  assert.equal(benchmark.study.horizonCandles, 96);
  assert.equal(benchmark.study.minimumScore, 80);
  assert.equal(benchmark.study.assetsTested, 50);
  assert.equal(benchmark.study.totalSignals, 3936);
});

test('benchmark preserves the sample sizes and target rates used in the review', () => {
  const byName = Object.fromEntries(benchmark.patterns.map(row => [row.name, row]));
  assert.equal(byName['Three Rising Valleys'].signals, 747);
  assert.equal(byName['Three Rising Valleys'].hit10, 46.3);
  assert.equal(byName['Rectangle / Trading Range'].signals, 459);
  assert.equal(byName['Double Bottom'].signals, 201);
  assert.equal(byName['Bull Pennant'].signals, 38);
  assert.equal(byName['Bull Flag'].retest, 8.8);
});

test('rendered reference states that results do not change Motor 6 scoring', () => {
  const html = benchmark.renderHtml();
  assert.match(html, /SEM ALTERAÇÃO DE SCORE/);
  assert.match(html, /não muda o score técnico/);
  assert.match(html, /não há walk-forward 70\/30/);
  assert.match(html, /Three Rising Valleys/);
});

test('mount adds one reference card under Motor 6 and is idempotent', () => {
  const nodes = {};
  const section = { id: 'motor6WatchSection', children: [], appendChild(node) {
    this.children.push(node);
    if (node.id) nodes[node.id] = node;
  } };
  const doc = {
    getElementById(id) { return id === 'motor6WatchSection' ? section : nodes[id] || null; },
    createElement(tag) {
      return {
        tag,
        innerHTML: '',
        firstElementChild: null,
        set html(value) { this.innerHTML = value; },
        get html() { return this.innerHTML; }
      };
    }
  };
  const card = doc.createElement('div');
  Object.defineProperty(card, 'innerHTML', {
    set(value) { this._html = value; this.firstElementChild = { id: 'm6PatternBacktestReference', html: value }; },
    get() { return this._html; }
  });
  const originalCreate = doc.createElement;
  doc.createElement = tag => tag === 'div' ? card : originalCreate(tag);
  assert.equal(benchmark.mount(doc), true);
  assert.equal(benchmark.mount(doc), false);
  assert.equal(section.children.length, 2);
  assert.match(nodes.m6PatternBacktestReference.html, /Rectangle \/ Trading Range/);
});
