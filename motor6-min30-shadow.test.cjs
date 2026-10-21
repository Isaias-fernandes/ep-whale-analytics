const test = require('node:test');
const assert = require('node:assert/strict');
const shadow = require('./motor6-min30-shadow.js');

test('minimum-30d shadow accepts only fresh complete near-minimum confirmed signals', () => {
  const baseSignal = { dir: 'BUY', confirmedPattern: 'Bull Pennant', patternConfirmed: true, score: 72, timeframe:'1h', closedCandles:true, compression:true, patternObvConfirmed:true, patternVolumeRatio:1.3, buyerFlow:{ratio:.6} };
  const baseMinimum = { updatedAt: Date.now(), price: 100.3, windows: { '30d': { low: 100, distance: 0.3, candles: 720 } } };
  assert.equal(shadow.assess(baseSignal, baseMinimum).eligible, true);
  assert.equal(shadow.assess(baseSignal, baseMinimum, Date.now(), 100.8).eligible, false);
  assert.equal(shadow.assess(baseSignal, baseMinimum, Date.now(), 100.51).eligible, false);
  assert.equal(shadow.assess({ ...baseSignal, patternConfirmed: false }, baseMinimum).eligible, false);
  assert.equal(shadow.assess({ ...baseSignal, score: 49 }, baseMinimum).eligible, false);
  assert.equal(shadow.assess(baseSignal, { ...baseMinimum, updatedAt: Date.now() - 9 * 60 * 1000 }).eligible, false);
});

test('minimum-30d shadow gates candidates by direction-specific patterns', () => {
  const min = { updatedAt: Date.now(), price: 99.8, windows: { '30d': { low: 100, distance: -0.2, candles: 744 } } };
  assert.equal(shadow.assess({ dir: 'SELL', confirmedPattern: 'Bear Pennant', patternConfirmed: true, score: 55 }, min).eligible, false);
  assert.equal(shadow.assess({ dir: 'BUY', confirmedPattern: 'Bear Pennant', patternConfirmed: true, score: 80 }, min).eligible, false);
  assert.equal(shadow.assess({ dir: 'BUY', confirmedPattern: 'Rectangle / Trading Range', patternConfirmed: true, score: 80 }, min).eligible, false);
});
