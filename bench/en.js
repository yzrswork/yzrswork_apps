import {
  calculate555Astable,
  calculateBatteryRuntime,
  calculateLedResistor,
  calculateOhm,
  resistorBandsToValue,
  resistorValueToBands,
  RESISTOR_COLORS,
} from './calculations.js';

const $ = (id) => document.getElementById(id);
const colorNames = Object.keys(RESISTOR_COLORS);
const digitColors = colorNames.filter((name) => RESISTOR_COLORS[name].d !== null);
const multiplierColors = colorNames.filter((name) => RESISTOR_COLORS[name].m !== null);
const toleranceColors = colorNames.filter((name) => RESISTOR_COLORS[name].t !== null);

function numericInput(id) {
  const value = $(id).value;
  return value === '' ? null : Number(value);
}

function precision(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return '—';
  return Number(value.toPrecision(digits)).toString();
}

function formatResistance(value) {
  if (value >= 1e6) return `${precision(value / 1e6)} MΩ`;
  if (value >= 1e3) return `${precision(value / 1e3)} kΩ`;
  return `${precision(value)} Ω`;
}

function formatVoltage(value) {
  if (Math.abs(value) < 0.001) return `${precision(value * 1e6)} µV`;
  if (Math.abs(value) < 1) return `${precision(value * 1000)} mV`;
  return `${precision(value, 5)} V`;
}

function formatCurrent(value) {
  if (Math.abs(value) < 0.001) return `${precision(value * 1e6)} µA`;
  if (Math.abs(value) < 1) return `${precision(value * 1000)} mA`;
  return `${precision(value)} A`;
}

function formatPower(value) {
  if (value < 0.001) return `${precision(value * 1e6)} µW`;
  if (value < 1) return `${precision(value * 1000)} mW`;
  return `${precision(value)} W`;
}

function formatFrequency(value) {
  if (value >= 1e6) return `${precision(value / 1e6)} MHz`;
  if (value >= 1e3) return `${precision(value / 1e3)} kHz`;
  return `${precision(value)} Hz`;
}

function formatTime(value) {
  if (value < 1e-3) return `${precision(value * 1e6)} µs`;
  if (value < 1) return `${precision(value * 1e3)} ms`;
  return `${precision(value)} s`;
}

function formatCapacitance(value) {
  if (value < 1e-9) return `${precision(value * 1e12)} pF`;
  if (value < 1e-6) return `${precision(value * 1e9)} nF`;
  if (value < 1e-3) return `${precision(value * 1e6)} µF`;
  return `${precision(value)} F`;
}

function resultBox(rows, error) {
  const box = document.createElement('div');
  box.className = error ? 'result-box error' : 'result-box';
  if (error) {
    const message = document.createElement('div');
    message.className = 'result-error';
    message.textContent = error;
    box.append(message);
    return box;
  }
  for (const [label, value, highlighted] of rows) {
    const row = document.createElement('div');
    row.className = 'result-row';
    const labelNode = document.createElement('span');
    labelNode.className = 'result-label';
    labelNode.textContent = label;
    const valueNode = document.createElement('span');
    valueNode.className = `result-value${highlighted ? ' highlight' : ''}`;
    valueNode.textContent = value;
    row.append(labelNode, valueNode);
    box.append(row);
  }
  return box;
}

function showRows(id, rows, error) {
  $(id).replaceChildren(resultBox(rows, error));
}

function appendColorPreview(box, bandNames) {
  const bands = document.createElement('div');
  bands.className = 'color-bands';
  for (const name of bandNames) {
    const chip = document.createElement('div');
    chip.className = 'color-chip';
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = RESISTOR_COLORS[name].hex;
    const label = document.createElement('div');
    label.className = 'clabel';
    label.textContent = name[0].toUpperCase() + name.slice(1);
    chip.append(swatch, label);
    bands.append(chip);
  }
  box.prepend(bands);
}

function trackResult(type) {
  if (window.yzrsTrackResult) window.yzrsTrackResult(type, 'electronics');
}

function calculateOhmFromForm() {
  const calculation = calculateOhm({
    V: numericInput('ohm-V'),
    I: numericInput('ohm-I'),
    R: numericInput('ohm-R'),
    P: numericInput('ohm-P'),
  });
  if (calculation.status === 'incomplete') { $('ohm-result').replaceChildren(); return; }
  if (calculation.status === 'error') {
    showRows('ohm-result', [], calculation.error === 'out-of-range'
      ? 'The result is outside the supported numeric range. Check the inputs.'
      : 'Use positive finite values, or clear a field.');
    return;
  }
  const { V, I, R, P } = calculation.values;
  showRows('ohm-result', [
    ['Voltage', formatVoltage(V)],
    ['Current', formatCurrent(I)],
    ['Resistance', formatResistance(R)],
    ['Power', formatPower(P), true],
  ]);
  trackResult('ohm');
}

for (const id of ['ohm-V', 'ohm-I', 'ohm-R', 'ohm-P']) $(id).addEventListener('input', calculateOhmFromForm);

function calculateLedFromForm() {
  const calculation = calculateLedResistor(
    numericInput('led-Vs'),
    numericInput('led-Vf'),
    numericInput('led-If'),
  );
  if (calculation.status === 'incomplete') { $('led-result').replaceChildren(); return; }
  if (calculation.status === 'error') {
    const message = calculation.error === 'supply-not-above-forward-voltage'
      ? 'Supply voltage must be greater than LED forward voltage.'
      : calculation.error === 'out-of-range'
        ? 'The result is outside the supported numeric range. Check the inputs.'
        : 'Use a positive supply voltage and target current; forward voltage must be zero or greater.';
    showRows('led-result', [], message);
    return;
  }

  const recommendation = calculation.recommendedOhms === null
    ? 'No supported E12 value at or above the calculated resistance'
    : formatResistance(calculation.recommendedOhms);
  const estimatedCurrent = calculation.estimatedCurrentA === null
    ? '—'
    : formatCurrent(calculation.estimatedCurrentA);
  const estimatedPower = calculation.resistorPowerW === null
    ? '—'
    : formatPower(calculation.resistorPowerW);
  const rating = calculation.recommendedOhms === null
    ? '— (no supported E12 value)'
    : calculation.powerRatingW === null
      ? 'No supported rating (required rating exceeds 5 W)'
      : `${calculation.powerRatingW} W or higher`;

  showRows('led-result', [
    ['Calculated resistance', formatResistance(calculation.requiredOhms), true],
    ['E12 recommendation', recommendation],
    ['Estimated current at E12 value', estimatedCurrent],
    ['Estimated resistor dissipation', estimatedPower],
    ['Power rating candidate (2×)', rating],
  ]);
  const note = $('led-note');
  note.textContent = calculation.recommendedOhms === null
    ? 'No value in the supported E12 range meets the target-current boundary. Select a resistor from the full part range and check its rating.'
    : calculation.powerRatingW === null
      ? 'The required rating is above the calculator’s 5 W candidate limit. It does not round down to a lower rating; select a suitable higher-power part and review its thermal conditions.'
      : 'The recommendation is the smallest supported E12 value at or above the calculated resistance. Confirm LED limits, resistor derating, ambient temperature, and mounting conditions from the component data sheets.';
  trackResult('led_resistor');
}

for (const id of ['led-Vs', 'led-Vf', 'led-If']) $(id).addEventListener('input', calculateLedFromForm);

let colorMode = 'value-to-bands';
let bandCount = 4;

function setColorMode(mode) {
  colorMode = mode;
  $('cc-v2c-panel').style.display = mode === 'value-to-bands' ? '' : 'none';
  $('cc-c2v-panel').style.display = mode === 'bands-to-value' ? '' : 'none';
  $('cc-mode-v2c').classList.toggle('active', mode === 'value-to-bands');
  $('cc-mode-c2v').classList.toggle('active', mode === 'bands-to-value');
  if (mode === 'bands-to-value') rebuildColorSelectors();
}

function setBandCount(count) {
  bandCount = count;
  $('cc-bands-4').classList.toggle('active', count === 4);
  $('cc-bands-5').classList.toggle('active', count === 5);
  if (colorMode === 'value-to-bands') calculateValueToBands();
  else rebuildColorSelectors();
}

function colorChoicesForBand(index, total) {
  if (index === total - 1) return toleranceColors;
  if (index === total - 2) return multiplierColors;
  return digitColors;
}

function rebuildColorSelectors() {
  const container = $('cc-selects');
  container.replaceChildren();
  for (let index = 0; index < bandCount; index += 1) {
    const field = document.createElement('div');
    field.className = 'field';
    field.style.minWidth = '70px';
    const label = document.createElement('label');
    label.htmlFor = `cc-s-${index}`;
    label.textContent = index === bandCount - 1
      ? 'Tolerance band'
      : index === bandCount - 2 ? 'Multiplier band' : `Band ${index + 1}`;
    const select = document.createElement('select');
    select.id = `cc-s-${index}`;
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Select';
    select.append(empty);
    for (const name of colorChoicesForBand(index, bandCount)) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name[0].toUpperCase() + name.slice(1);
      option.style.backgroundColor = RESISTOR_COLORS[name].hex;
      option.style.color = ['white', 'yellow', 'gray'].includes(name) ? '#333' : '#fff';
      select.append(option);
    }
    select.addEventListener('change', calculateBandsToValue);
    field.append(label, select);
    container.append(field);
  }
  calculateBandsToValue();
}

function calculateValueToBands() {
  const value = numericInput('cc-val');
  if (value === null || value === 0) { $('cc-v2c-result').replaceChildren(); return; }
  const result = resistorValueToBands(value, numericInput('cc-tol'), bandCount);
  if (result.status === 'error') {
    showRows('cc-v2c-result', [], 'This value cannot be represented by the selected standard color code.');
    return;
  }
  const box = resultBox([
    [`${bandCount}-band colors`, result.bands.map((name) => name[0].toUpperCase() + name.slice(1)).join(' / '), true],
    ['Nominal value represented', formatResistance(result.resistanceOhms)],
    ['Tolerance', `±${result.tolerancePercent}%`],
  ]);
  appendColorPreview(box, result.bands);
  $('cc-v2c-result').replaceChildren(box);
  trackResult('color_code');
}

function calculateBandsToValue() {
  const selected = Array.from({ length: bandCount }, (_, index) => $(`cc-s-${index}`)?.value ?? '');
  if (selected.some((name) => !name)) { $('cc-c2v-result').replaceChildren(); return; }
  const result = resistorBandsToValue(selected, bandCount);
  if (result.status === 'error') {
    showRows('cc-c2v-result', [], 'Check the selected color bands.');
    return;
  }
  showRows('cc-c2v-result', [
    ['Nominal resistance', formatResistance(result.resistanceOhms), true],
    ['Tolerance', `±${result.tolerancePercent}%`],
    ['Possible range', `${formatResistance(result.minimumOhms)} – ${formatResistance(result.maximumOhms)}`],
  ]);
  trackResult('color_code');
}

$('cc-mode-v2c').addEventListener('click', () => setColorMode('value-to-bands'));
$('cc-mode-c2v').addEventListener('click', () => setColorMode('bands-to-value'));
$('cc-bands-4').addEventListener('click', () => setBandCount(4));
$('cc-bands-5').addEventListener('click', () => setBandCount(5));
$('cc-val').addEventListener('input', calculateValueToBands);
$('cc-tol').addEventListener('change', calculateValueToBands);

function calculate555FromForm() {
  const calculation = calculate555Astable(
    numericInput('t555-R1'),
    numericInput('t555-R2'),
    numericInput('t555-C'),
  );
  if (calculation.status === 'incomplete') { $('t555-result').replaceChildren(); return; }
  if (calculation.status === 'error') {
    showRows('t555-result', [], 'Enter positive finite values for R1, R2, and C.');
    return;
  }
  showRows('t555-result', [
    ['Frequency', formatFrequency(calculation.frequencyHz), true],
    ['Period', formatTime(calculation.periodSeconds)],
    ['Output duty cycle', `${(calculation.dutyCycle * 100).toFixed(2)}%`],
    ['Capacitance', formatCapacitance(calculation.capacitanceF)],
  ]);
  trackResult('timer_555');
}

for (const id of ['t555-R1', 't555-R2', 't555-C']) $(id).addEventListener('input', calculate555FromForm);

function calculateBatteryFromForm() {
  const calculation = calculateBatteryRuntime(numericInput('bat-cap'), numericInput('bat-cur'));
  if (calculation.status === 'incomplete') { $('bat-result').replaceChildren(); return; }
  if (calculation.status === 'error') {
    showRows('bat-result', [], 'Enter positive finite values for capacity and average current.');
    return;
  }
  const hours = Math.floor(calculation.totalMinutes / 60);
  const minutes = calculation.totalMinutes % 60;
  showRows('bat-result', [['Theoretical runtime', `${hours} h ${minutes} min`, true]]);
  trackResult('battery_runtime');
}

for (const id of ['bat-cap', 'bat-cur']) $(id).addEventListener('input', calculateBatteryFromForm);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch((error) => console.warn('Service Worker registration failed:', error));
  });
}
