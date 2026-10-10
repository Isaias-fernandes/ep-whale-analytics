const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('./motor6-pattern-policy.js');

test('Three Rising Valleys is the primary early alert', () => {
  const result = policy.assess('Three Rising Valleys', 'BUY', {});
  assert.equal(result.rank, 1);
  assert.equal(result.points, 26);
  assert.equal(result.status, 'ALERTA PRINCIPAL');
  assert.equal(result.confirmed, false);
});

test('Pennant and Flag require both volume and OBV confirmation', () => {
  const noFlow = policy.assess('Bull Pennant', 'BUY', { volumeRatio: 1.4, obvConfirmed: false });
  const confirmed = policy.assess('Bull Flag', 'BUY', { volumeRatio: 1.25, obvConfirmed: true });
  assert.equal(noFlow.confirmed, false);
  assert.equal(noFlow.points, 13);
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.points, 22);
});

test('Rectangle and Double Bottom need a confirmed breakout', () => {
  const near = policy.assess('Rectangle Accumulation', 'BUY', { volumeRatio: 1.5, obvConfirmed: true, breakout: false });
  const broken = policy.assess('Double Bottom', 'BUY', { volumeRatio: 1.5, obvConfirmed: true, breakout: true });
  assert.equal(near.confirmed, false);
  assert.equal(near.status, 'AGUARDAR ROMPIMENTO');
  assert.equal(broken.confirmed, true);
});

test('sell patterns carry lower weight and require downside breakout', () => {
  const watching = policy.assess('Bear Pennant', 'SELL', { volumeRatio: 1.8, obvConfirmed: true, breakdown: false });
  const broken = policy.assess('Bear Pennant', 'SELL', { volumeRatio: 1.8, obvConfirmed: true, breakdown: true });
  assert.ok(watching.points < policy.assess('Bull Pennant', 'BUY', {}).points);
  assert.equal(watching.confirmed, false);
  assert.equal(broken.confirmed, true);
});

test('volume confirmation uses the EP Lab 1.2x threshold', () => {
  assert.equal(policy.assess('Bull Flag', 'BUY', { volumeRatio: 1.19, obvConfirmed: true }).confirmed, false);
  assert.equal(policy.assess('Bull Flag', 'BUY', { volumeRatio: 1.2, obvConfirmed: true }).confirmed, true);
});
