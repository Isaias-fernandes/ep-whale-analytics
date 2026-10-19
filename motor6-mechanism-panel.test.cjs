const test = require('node:test');
const assert = require('node:assert/strict');
const panel = require('./motor6-mechanism-panel.js');

function candlesFrom(closes, volume = 100) {
  return closes.map((c, i) => ({
    t: i * 3600000, o: i ? closes[i - 1] : c, h: c * 1.005,
    l: c * 0.995, c, v: typeof volume === 'function' ? volume(i) : volume
  }));
}

test('detects a narrow Bollinger width as a squeeze', () => {
  const closes = Array.from({ length: 96 }, (_, i) => 100 + Math.sin(i / 20) * (i < 70 ? 5 : 0.05));
  const result = panel.bollinger(candlesFrom(closes));
  assert.ok(result);
  assert.equal(result.squeezed, true);
});

test('flags possible OBV accumulation when price is flat/down and OBV rises', () => {
  const closes = [100];
  for (let i = 1; i < 60; i++) closes.push(closes[i - 1] + (i >= 40 ? (i % 2 ? 0.01 : -0.015) : (i % 2 ? 0.01 : -0.01)));
  const result = panel.obvReading(candlesFrom(closes, i => i >= 40 && i % 2 ? 300 : 100));
  assert.equal(result.divergence, true);
});

test('builds a price-volume profile proxy from existing candles', () => {
  const candles = candlesFrom(Array.from({ length: 96 }, (_, i) => 100 + (i % 12)), i => i % 12 === 5 ? 1000 : 10);
  const result = panel.volumeProfile(candles);
  assert.ok(result);
  assert.ok(result.poc >= 100 && result.poc <= 111);
  assert.equal(typeof result.lowNodeProxy, 'boolean');
});

test('marks external liquidation and on-chain sources as unavailable without imputing values', () => {
  const candles = candlesFrom(Array.from({ length: 60 }, (_, i) => 100 + i * 0.01));
  const result = panel.analyze({ candles, now: 100000000, observedAt: 99900000, early: { score: 60, dir: 'BUY' } });
  assert.equal(result.liquidation, null);
  assert.equal(result.onChain, null);
  assert.equal(result.fresh, true);
});
