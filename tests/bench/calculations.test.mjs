import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculate555Astable,
  calculateBatteryRuntime,
  calculateLedResistor,
  calculateOhm,
  recommendE12Ceiling,
  resistorBandsToValue,
  resistorValueToBands,
} from '../../bench/calculations.js';

function closeTo(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

test('Ohm\'s Law solves all six supported input pairs', () => {
  const cases = [
    [{ V: 12, I: 0.5 }, ['V', 'I']],
    [{ V: 12, R: 24 }, ['V', 'R']],
    [{ V: 12, P: 6 }, ['V', 'P']],
    [{ I: 0.5, R: 24 }, ['I', 'R']],
    [{ I: 0.5, P: 6 }, ['I', 'P']],
    [{ R: 24, P: 6 }, ['R', 'P']],
  ];
  for (const [input, pair] of cases) {
    const result = calculateOhm(input);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.pair, pair);
    closeTo(result.values.V, 12);
    closeTo(result.values.I, 0.5);
    closeTo(result.values.R, 24);
    closeTo(result.values.P, 6);
  }
});

test('Ohm\'s Law treats zero as cleared and rejects negative, nonfinite, and overflow inputs', () => {
  assert.equal(calculateOhm({ V: 0, I: 0.5 }).status, 'incomplete');
  assert.equal(calculateOhm({ V: 12, I: 0, R: 24 }).status, 'ok');
  assert.equal(calculateOhm({ V: -12, I: 0.5 }).error, 'invalid-input');
  assert.equal(calculateOhm({ V: Infinity, I: 0.5 }).error, 'invalid-input');
  assert.equal(calculateOhm({ V: 1e308, I: 1e-308 }).error, 'out-of-range');
});

test('LED resistor selection rounds up to the E12 ceiling, including exact values and decade edges', () => {
  const example = calculateLedResistor(5, 2, 10);
  assert.equal(example.requiredOhms, 300);
  assert.equal(example.recommendedOhms, 330);
  assert.ok(example.estimatedCurrentA <= 0.01);

  assert.equal(recommendE12Ceiling(330), 330);
  assert.equal(recommendE12Ceiling(82), 82);
  assert.equal(recommendE12Ceiling(82.01), 100);
  assert.equal(recommendE12Ceiling(99.9), 100);
  assert.equal(recommendE12Ceiling(999.9), 1000);
  assert.equal(recommendE12Ceiling(9999.9), 10000);
});

test('LED resistor dissipation uses the recommended resistor and the power ceiling fails closed above 5 W', () => {
  const ordinary = calculateLedResistor(5, 2, 10);
  closeTo(ordinary.resistorPowerW, 9 / 330);
  assert.equal(ordinary.powerRatingW, 0.125);

  const unsupported = calculateLedResistor(10, 0, 1000);
  assert.equal(unsupported.recommendedOhms, 10);
  assert.equal(unsupported.resistorPowerW, 10);
  assert.equal(unsupported.powerRatingW, null);
});

test('resistor color code supports value-to-bands and bands-to-value for four and five bands', () => {
  const fourBand = resistorValueToBands(4700, 5, 4);
  assert.equal(fourBand.status, 'ok');
  assert.deepEqual(fourBand.bands, ['yellow', 'violet', 'red', 'gold']);
  const fourBandValue = resistorBandsToValue(fourBand.bands, 4);
  assert.equal(fourBandValue.resistanceOhms, 4700);
  assert.equal(fourBandValue.tolerancePercent, 5);
  assert.equal(fourBandValue.minimumOhms, 4465);
  assert.equal(fourBandValue.maximumOhms, 4935);

  const fiveBand = resistorValueToBands(100000, 1, 5);
  assert.equal(fiveBand.status, 'ok');
  assert.deepEqual(fiveBand.bands, ['brown', 'black', 'black', 'orange', 'brown']);
  const fiveBandValue = resistorBandsToValue(fiveBand.bands, 5);
  assert.equal(fiveBandValue.resistanceOhms, 100000);
  assert.equal(fiveBandValue.tolerancePercent, 1);
  assert.equal(fiveBandValue.minimumOhms, 99000);
  assert.equal(fiveBandValue.maximumOhms, 101000);
  assert.equal(resistorValueToBands(0, 5, 4).status, 'error');
});

test('555 astable uses the TI frequency, period, duty-cycle, and microfarad conversion equations', () => {
  const result = calculate555Astable(1000, 1000, 1);
  assert.equal(result.status, 'ok');
  closeTo(result.capacitanceF, 1e-6);
  closeTo(result.frequencyHz, 480);
  closeTo(result.periodSeconds, 0.693 * (1000 + 2 * 1000) * 1e-6);
  closeTo(result.dutyCycle, 2 / 3);
  assert.equal(calculate555Astable(1000, 0, 1).error, 'invalid-input');
});

test('battery life remains the ideal capacity divided by average-current estimate', () => {
  const result = calculateBatteryRuntime(2000, 50);
  assert.equal(result.status, 'ok');
  assert.equal(result.runtimeHours, 40);
  assert.equal(result.totalMinutes, 2400);
  assert.equal(calculateBatteryRuntime(2000, 0).error, 'invalid-input');
});
