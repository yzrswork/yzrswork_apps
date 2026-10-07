// Shared calculation authority for the Japanese Maker's Bench and its EN Pilot.
// Keep this module free of DOM and presentation code so both interfaces call the
// same functions and the same deterministic tests can exercise them directly.

export const E12_VALUES = Object.freeze([1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]);
export const E12_MIN_DECADE = -2;
export const E12_MAX_DECADE = 6;

export const RESISTOR_COLORS = Object.freeze({
  black:  Object.freeze({ hex: '#000000', d: 0, m: 1,    t: null }),
  brown:  Object.freeze({ hex: '#8B4513', d: 1, m: 10,   t: 1 }),
  red:    Object.freeze({ hex: '#CC0000', d: 2, m: 100,  t: 2 }),
  orange: Object.freeze({ hex: '#FF6600', d: 3, m: 1e3,   t: null }),
  yellow: Object.freeze({ hex: '#FFDD00', d: 4, m: 1e4,   t: null }),
  green:  Object.freeze({ hex: '#00AA00', d: 5, m: 1e5,   t: 0.5 }),
  blue:   Object.freeze({ hex: '#0044CC', d: 6, m: 1e6,   t: 0.25 }),
  violet: Object.freeze({ hex: '#8800CC', d: 7, m: 1e7,   t: 0.1 }),
  gray:   Object.freeze({ hex: '#888888', d: 8, m: 1e8,   t: null }),
  white:  Object.freeze({ hex: '#EEEEEE', d: 9, m: 1e9,   t: null }),
  gold:   Object.freeze({ hex: '#C8A000', d: null, m: 0.1, t: 5 }),
  silver: Object.freeze({ hex: '#AAAAAA', d: null, m: 0.01, t: 10 }),
});

const RESISTOR_COLOR_NAMES = Object.keys(RESISTOR_COLORS);
const DIGIT_COLORS = RESISTOR_COLOR_NAMES.filter((name) => RESISTOR_COLORS[name].d !== null);
const MULTIPLIER_COLORS = RESISTOR_COLOR_NAMES.filter((name) => RESISTOR_COLORS[name].m !== null);
const TOLERANCE_COLORS = RESISTOR_COLOR_NAMES.filter((name) => RESISTOR_COLORS[name].t !== null);
const POWER_RATINGS_W = Object.freeze([0.125, 0.25, 0.5, 1, 2, 5]);

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

function numericValue(value) {
  return isBlank(value) ? null : Number(value);
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function resistorPowerRating(powerW) {
  if (!finitePositive(powerW)) return null;
  const requiredRatingW = powerW * 2;
  if (!Number.isFinite(requiredRatingW)) return null;
  return POWER_RATINGS_W.find((rating) => rating >= requiredRatingW) ?? null;
}

/** Solve one supported Ohm's Law pair, prioritizing the same pair order as JP. */
export function calculateOhm(input = {}) {
  const keys = ['V', 'I', 'R', 'P'];
  const values = Object.fromEntries(keys.map((key) => [key, numericValue(input[key])]));
  if (Object.values(values).some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
    return { status: 'error', error: 'invalid-input' };
  }

  const pairs = [['V', 'I'], ['V', 'R'], ['V', 'P'], ['I', 'R'], ['I', 'P'], ['R', 'P']];
  const pair = pairs.find(([a, b]) => values[a] > 0 && values[b] > 0);
  if (!pair) return { status: 'incomplete' };

  let { V, I, R, P } = values;
  const [a, b] = pair;
  if (a === 'V' && b === 'I') { R = V / I; P = V * I; }
  else if (a === 'V' && b === 'R') { I = V / R; P = (V * V) / R; }
  else if (a === 'V' && b === 'P') { I = P / V; R = (V * V) / P; }
  else if (a === 'I' && b === 'R') { V = I * R; P = I * I * R; }
  else if (a === 'I' && b === 'P') { V = P / I; R = P / (I * I); }
  else if (a === 'R' && b === 'P') { V = Math.sqrt(P * R); I = Math.sqrt(P / R); }

  const solved = { V, I, R, P };
  if (Object.values(solved).some((value) => !finitePositive(value))) {
    return { status: 'error', error: 'out-of-range' };
  }
  return { status: 'ok', pair, values: solved };
}

/** Return the smallest supported E12 value at or above the requested resistance. */
export function recommendE12Ceiling(requiredOhms) {
  if (!finitePositive(requiredOhms)) return null;
  const supported = [];
  for (let decade = E12_MIN_DECADE; decade <= E12_MAX_DECADE; decade += 1) {
    for (const base of E12_VALUES) supported.push(base * (10 ** decade));
  }
  supported.sort((a, b) => a - b);
  return supported.find((value) => value >= requiredOhms) ?? null;
}

/** Calculate an LED series resistor and its power rating from the selected E12 part. */
export function calculateLedResistor(vsInput, vfInput, currentMilliampInput) {
  const vs = numericValue(vsInput);
  const vf = numericValue(vfInput);
  const currentMilliamp = numericValue(currentMilliampInput);
  if (vs === null || vf === null || currentMilliamp === null) return { status: 'incomplete' };
  if (![vs, vf, currentMilliamp].every(Number.isFinite) || vs <= 0 || vf < 0 || currentMilliamp <= 0) {
    return { status: 'error', error: 'invalid-input' };
  }
  if (vs <= vf) return { status: 'error', error: 'supply-not-above-forward-voltage' };

  const voltageAcrossResistor = vs - vf;
  const targetCurrentA = currentMilliamp / 1000;
  const requiredOhms = voltageAcrossResistor / targetCurrentA;
  if (!finitePositive(requiredOhms)) return { status: 'error', error: 'out-of-range' };

  const recommendedOhms = recommendE12Ceiling(requiredOhms);
  const estimatedCurrentA = recommendedOhms === null ? null : voltageAcrossResistor / recommendedOhms;
  const resistorPowerW = recommendedOhms === null
    ? null
    : (voltageAcrossResistor * voltageAcrossResistor) / recommendedOhms;
  const powerRatingW = resistorPowerRating(resistorPowerW);

  return {
    status: 'ok',
    requiredOhms,
    recommendedOhms,
    targetCurrentA,
    estimatedCurrentA,
    resistorPowerW: Number.isFinite(resistorPowerW) ? resistorPowerW : null,
    powerRatingW,
  };
}

/** Convert an ohmic value to standard four-band or five-band resistor colors. */
export function resistorValueToBands(valueInput, toleranceInput, bandCountInput) {
  const value = numericValue(valueInput);
  const tolerance = numericValue(toleranceInput);
  const bandCount = numericValue(bandCountInput);
  if (!finitePositive(value)) return { status: 'error', error: 'invalid-value' };
  if (![4, 5].includes(bandCount)) return { status: 'error', error: 'invalid-band-count' };
  if (!Number.isFinite(tolerance) || !TOLERANCE_COLORS.some((name) => RESISTOR_COLORS[name].t === tolerance)) {
    return { status: 'error', error: 'invalid-tolerance' };
  }

  const digitCount = bandCount === 4 ? 2 : 3;
  const exponent = Math.floor(Math.log10(value)) - (digitCount - 1);
  const multiplier = 10 ** exponent;
  const significantDigits = Math.round(value / multiplier);
  const minimumDigits = 10 ** (digitCount - 1);
  const maximumDigits = (10 ** digitCount) - 1;
  if (!Number.isFinite(significantDigits) || significantDigits < minimumDigits || significantDigits > maximumDigits) {
    return { status: 'error', error: 'outside-significant-digit-range' };
  }

  const digits = String(significantDigits).padStart(digitCount, '0').split('').map(Number);
  const multiplierColor = MULTIPLIER_COLORS.find((name) => Math.abs(RESISTOR_COLORS[name].m - multiplier) / multiplier < 0.001);
  const digitColors = digits.map((digit) => DIGIT_COLORS.find((name) => RESISTOR_COLORS[name].d === digit));
  const toleranceColor = TOLERANCE_COLORS.find((name) => RESISTOR_COLORS[name].t === tolerance);
  if (!multiplierColor || digitColors.some((name) => !name) || !toleranceColor) {
    return { status: 'error', error: 'not-representable' };
  }
  return {
    status: 'ok',
    bands: [...digitColors, multiplierColor, toleranceColor],
    significantDigits,
    multiplier,
    resistanceOhms: significantDigits * multiplier,
    tolerancePercent: tolerance,
  };
}

/** Decode four-band or five-band resistor colors into nominal value and tolerance range. */
export function resistorBandsToValue(bandNames, bandCountInput) {
  const bandCount = numericValue(bandCountInput);
  if (![4, 5].includes(bandCount) || !Array.isArray(bandNames) || bandNames.length !== bandCount) {
    return { status: 'error', error: 'invalid-band-count' };
  }
  if (bandNames.some((name) => !Object.hasOwn(RESISTOR_COLORS, name))) {
    return { status: 'error', error: 'invalid-color' };
  }

  const digitCount = bandCount - 2;
  const digitNames = bandNames.slice(0, digitCount);
  const multiplierName = bandNames[digitCount];
  const toleranceName = bandNames[digitCount + 1];
  if (digitNames.some((name) => RESISTOR_COLORS[name].d === null)) {
    return { status: 'error', error: 'invalid-digit-color' };
  }
  if (RESISTOR_COLORS[multiplierName].m === null || RESISTOR_COLORS[toleranceName].t === null) {
    return { status: 'error', error: 'invalid-band-role' };
  }

  const significantDigits = Number(digitNames.map((name) => RESISTOR_COLORS[name].d).join(''));
  const resistanceOhms = significantDigits * RESISTOR_COLORS[multiplierName].m;
  const tolerancePercent = RESISTOR_COLORS[toleranceName].t;
  return {
    status: 'ok',
    resistanceOhms,
    tolerancePercent,
    minimumOhms: resistanceOhms * (1 - tolerancePercent / 100),
    maximumOhms: resistanceOhms * (1 + tolerancePercent / 100),
  };
}

/** Ideal 555 astable estimate using the classic RA/RB/C equations in the TI data sheet. */
export function calculate555Astable(r1Input, r2Input, capacitanceMicrofaradsInput) {
  const r1 = numericValue(r1Input);
  const r2 = numericValue(r2Input);
  const capacitanceMicrofarads = numericValue(capacitanceMicrofaradsInput);
  if (r1 === null || r2 === null || capacitanceMicrofarads === null) return { status: 'incomplete' };
  if (![r1, r2, capacitanceMicrofarads].every(finitePositive)) return { status: 'error', error: 'invalid-input' };

  const capacitanceF = capacitanceMicrofarads * 1e-6;
  const timingResistanceOhms = r1 + (2 * r2);
  const timingProduct = timingResistanceOhms * capacitanceF;
  const frequencyHz = 1.44 / timingProduct;
  const periodSeconds = 0.693 * timingProduct;
  const dutyCycle = (r1 + r2) / timingResistanceOhms;
  if (![capacitanceF, frequencyHz, periodSeconds, dutyCycle].every(finitePositive)) {
    return { status: 'error', error: 'out-of-range' };
  }
  return { status: 'ok', capacitanceF, frequencyHz, periodSeconds, dutyCycle };
}

/** Ideal battery runtime estimate: capacity divided by average current, with no correction factor. */
export function calculateBatteryRuntime(capacityMilliampHoursInput, averageCurrentMilliampInput) {
  const capacityMilliampHours = numericValue(capacityMilliampHoursInput);
  const averageCurrentMilliamp = numericValue(averageCurrentMilliampInput);
  if (capacityMilliampHours === null || averageCurrentMilliamp === null) return { status: 'incomplete' };
  if (![capacityMilliampHours, averageCurrentMilliamp].every(finitePositive)) {
    return { status: 'error', error: 'invalid-input' };
  }
  const runtimeHours = capacityMilliampHours / averageCurrentMilliamp;
  const totalMinutes = Math.round(runtimeHours * 60);
  if (!finitePositive(runtimeHours) || !Number.isFinite(totalMinutes)) return { status: 'error', error: 'out-of-range' };
  return { status: 'ok', runtimeHours, totalMinutes };
}
