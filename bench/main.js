import {
  calculate555Astable,
  calculateBatteryRuntime,
  calculateLedResistor,
  calculateOhm,
  resistorBandsToValue,
  resistorValueToBands,
  RESISTOR_COLORS,
} from './calculations.js';

/* =========================================================
   Maker's Bench — Electronics Calculator
   Dependency-free, offline-capable, data stays on device.
   ========================================================= */

/* ── Utility: format values with SI prefixes ─────────── */
function fmtOhm(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (v >= 1e6) return (v / 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' MΩ';
  if (v >= 1e3) return (v / 1e3).toPrecision(4).replace(/\.?0+$/, '') + ' kΩ';
  return v.toPrecision(4).replace(/\.?0+$/, '') + ' Ω';
}
function fmtVolt(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (Math.abs(v) < 0.001) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' µV';
  if (Math.abs(v) < 1) return (v * 1000).toPrecision(4).replace(/\.?0+$/, '') + ' mV';
  return v.toPrecision(5).replace(/\.?0+$/, '') + ' V';
}
function fmtAmp(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (Math.abs(v) < 0.001) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' µA';
  if (Math.abs(v) < 1) return (v * 1000).toPrecision(4).replace(/\.?0+$/, '') + ' mA';
  return v.toPrecision(4).replace(/\.?0+$/, '') + ' A';
}
function fmtWatt(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (Math.abs(v) < 0.001) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' µW';
  if (Math.abs(v) < 1) return (v * 1000).toPrecision(4).replace(/\.?0+$/, '') + ' mW';
  return v.toPrecision(4).replace(/\.?0+$/, '') + ' W';
}
function fmtFreq(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (v >= 1e6) return (v / 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' MHz';
  if (v >= 1e3) return (v / 1e3).toPrecision(4).replace(/\.?0+$/, '') + ' kHz';
  return v.toPrecision(4).replace(/\.?0+$/, '') + ' Hz';
}
function fmtTime(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (v < 1e-3) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' µs';
  if (v < 1) return (v * 1e3).toPrecision(4).replace(/\.?0+$/, '') + ' ms';
  return v.toPrecision(4).replace(/\.?0+$/, '') + ' s';
}
function fmtFarad(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  if (v < 1e-9) return (v * 1e12).toPrecision(4).replace(/\.?0+$/, '') + ' pF';
  if (v < 1e-6) return (v * 1e9).toPrecision(4).replace(/\.?0+$/, '') + ' nF';
  if (v < 1e-3) return (v * 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' µF';
  return v.toPrecision(4).replace(/\.?0+$/, '') + ' F';
}
function n(v) { return v == null || v === '' ? null : parseFloat(v); }

function resultBox(rows, error) {
  if (error) {
    return `<div class="result-box error"><div class="result-error">${escHtml(error)}</div></div>`;
  }
  const inner = rows.map(([lbl, val, hi]) =>
    `<div class="result-row">
      <span class="result-label">${escHtml(lbl)}</span>
      <span class="result-value${hi ? ' highlight' : ''}">${escHtml(val)}</span>
    </div>`
  ).join('');
  return `<div class="result-box">${inner}</div>`;
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Affiliate link helper ───────────────────────────── */
const AMAZON_ITEM_KEYS = Object.freeze({
  'led-amz': 'bench-led-parts',
  'color-amz': 'bench-color-code-resistor',
  'vdiv-amz': 'bench-voltage-divider',
  't555-amz': 'bench-ne555',
  'bat-amz': 'bench-aa-rechargeable'
});
function amazonLink(keyword) {
  return window.yzrsAffiliate.searchUrl(keyword);
}
function showAmzLink(elId, keyword) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.href = amazonLink(keyword);
  el.setAttribute('data-track-label', keyword);
  const itemKey = AMAZON_ITEM_KEYS[elId];
  if (itemKey) el.setAttribute('data-item-key', itemKey);
  el.style.display = 'inline-flex';
}

/* =========================================================
   1. Ohm's Law
   V=IR, P=VI=I²R=V²/R
   ========================================================= */
(function() {
  const ids = ['ohm-V', 'ohm-I', 'ohm-R', 'ohm-P'];
  ids.forEach(id => {
    document.getElementById(id).addEventListener('input', calc);
  });
  function calc() {
    const V = n(document.getElementById('ohm-V').value);
    const I = n(document.getElementById('ohm-I').value);
    const R = n(document.getElementById('ohm-R').value);
    const P = n(document.getElementById('ohm-P').value);
    const el = document.getElementById('ohm-result');

    const calculation = calculateOhm({ V, I, R, P });
    if (calculation.status === 'incomplete') { el.innerHTML = ''; return; }
    if (calculation.status === 'error') {
      el.innerHTML = resultBox([], calculation.error === 'out-of-range'
        ? '計算範囲を超えています。入力値を確認してください。'
        : '値が不正です（正の数値を入力してください）');
      return;
    }
    const solved = calculation.values;
    el.innerHTML = resultBox([
      ['V 電圧', fmtVolt(solved.V)],
      ['I 電流', fmtAmp(solved.I)],
      ['R 抵抗', fmtOhm(solved.R)],
      ['P 電力', fmtWatt(solved.P), true],
    ]);
    if (window.yzrsTrackResult) window.yzrsTrackResult('ohm', 'electronics');
  }
})();

/* =========================================================
   2. LED Series Resistor
   R = (Vs - Vf) / (If / 1000)
   ========================================================= */
(function() {
  ['led-Vs','led-Vf','led-If'].forEach(id => {
    document.getElementById(id).addEventListener('input', calc);
  });
  function calc() {
    const Vs = n(document.getElementById('led-Vs').value);
    const Vf = n(document.getElementById('led-Vf').value);
    const If_mA = n(document.getElementById('led-If').value);
    const el = document.getElementById('led-result');
    const amz = document.getElementById('led-amz');

    const calculation = calculateLedResistor(Vs, Vf, If_mA);

    if (calculation.status === 'incomplete') { el.innerHTML = ''; amz.style.display='none'; return; }
    if (calculation.status === 'error') {
      const message = calculation.error === 'supply-not-above-forward-voltage'
        ? 'Vs は Vf より大きくしてください（Vs > Vf）'
        : calculation.error === 'out-of-range'
          ? '計算範囲を超えています。入力値を確認してください。'
          : '電圧と電流には正の有限値を入力してください';
      el.innerHTML = resultBox([], message);
      amz.style.display='none';
      return;
    }

    const resistanceLabel = calculation.recommendedOhms === null
      ? '対応範囲に推奨E12値がありません'
      : fmtOhm(calculation.recommendedOhms);
    const resistorPowerLabel = calculation.resistorPowerW === null
      ? '—'
      : fmtWatt(calculation.resistorPowerW);
    const wattRecommendation = calculation.recommendedOhms === null
      ? '—（対応するE12値なし）'
      : calculation.powerRatingW === null
        ? '該当なし（必要定格は5 W超）'
        : calculation.powerRatingW + ' W以上';
    const note = calculation.recommendedOhms === null
      ? '対応範囲内に目標電流以下となるE12値がありません。抵抗値を個別に選定し、部品の定格を確認してください。'
      : calculation.powerRatingW === null
        ? '必要定格の2倍が5 Wを超えます。候補にない低い定格へは丸めません。放熱条件とデータシートを確認し、5 W超の抵抗を個別に選定してください。'
        : '推奨E12値での電流・消費電力の推定です。候補定格は 0.125 / 0.25 / 0.5 / 1 / 2 / 5 W。連続運転、周囲温度、実装時の放熱条件は別途確認してください。';

    el.innerHTML = resultBox([
      ['R 必要抵抗', fmtOhm(calculation.requiredOhms), true],
      ['E12値（目標電流以下）', resistanceLabel],
      ['推奨E12値での消費電力', resistorPowerLabel],
      ['候補定格（2倍以上）', wattRecommendation],
    ]) + `<p class="note-small" style="margin-top:8px;">${escHtml(note)}</p>`;
    if (window.yzrsTrackResult) window.yzrsTrackResult('led_resistor', 'electronics');
    showAmzLink('led-amz', 'LED 5mm 詰め合わせ');
    amz.style.display = 'inline-flex';
  }
})();

/* =========================================================
   3. Resistor Color Code (4-band / 5-band, bidirectional)
   ========================================================= */
(function() {
  const COLORS = RESISTOR_COLORS;
  const COLOR_NAMES = Object.keys(COLORS);
  const DIGIT_COLORS = COLOR_NAMES.filter(c => COLORS[c].d !== null);
  const MULT_COLORS  = COLOR_NAMES.filter(c => COLORS[c].m !== null);
  const TOL_COLORS   = COLOR_NAMES.filter(c => COLORS[c].t !== null);
  const COLOR_JP = {
    black:'黒',brown:'茶',red:'赤',orange:'橙',yellow:'黄',
    green:'緑',blue:'青',violet:'紫',gray:'灰',white:'白',
    gold:'金',silver:'銀'
  };

  let mode = 'v2c';
  let bands = 4;

  window.ccSetMode = function(m) {
    mode = m;
    document.getElementById('cc-v2c-panel').style.display = m === 'v2c' ? '' : 'none';
    document.getElementById('cc-c2v-panel').style.display = m === 'c2v' ? '' : 'none';
    document.getElementById('cc-mode-v2c').classList.toggle('active', m === 'v2c');
    document.getElementById('cc-mode-c2v').classList.toggle('active', m === 'c2v');
    if (m === 'c2v') rebuildSelects();
  };

  window.ccSetBands = function(b) {
    bands = b;
    document.getElementById('cc-bands-4').classList.toggle('active', b === 4);
    document.getElementById('cc-bands-5').classList.toggle('active', b === 5);
    if (mode === 'v2c') calcV2C();
    else rebuildSelects();
  };

  function makeChip(name) {
    const c = COLORS[name];
    const textColor = (name === 'white' || name === 'yellow' || name === 'gray') ? '#333' : '#fff';
    return `<div class="color-chip">
      <div class="swatch" style="background:${c.hex};"></div>
      <div class="clabel" style="color:var(--muted);">${COLOR_JP[name]||name}</div>
    </div>`;
  }

  // Value -> Color bands
  function calcV2C() {
    const val = n(document.getElementById('cc-val').value);
    const tolVal = parseFloat(document.getElementById('cc-tol').value);
    const el = document.getElementById('cc-v2c-result');
    const amz = document.getElementById('color-amz');
    if (val == null || val <= 0) { el.innerHTML=''; amz.style.display='none'; return; }

    const calculation = resistorValueToBands(val, tolVal, bands);
    if (calculation.status === 'error') {
      const message = calculation.error === 'outside-significant-digit-range'
        ? (bands === 4 ? '4帯では2桁の有効数字で表せる値を入力してください' : '5帯では3桁の有効数字で表せる値を入力してください')
        : 'この値は標準カラーコードで表現できません';
      el.innerHTML = resultBox([], message);
      amz.style.display='none'; return;
    }

    const allBands = calculation.bands;
    el.innerHTML = `<div class="result-box" style="padding-top:14px;">
      <div class="color-bands">${allBands.map(makeChip).join('')}</div>
      <div style="margin-top:12px;">${resultBox([
        ['帯の色 (' + bands + '帯)', allBands.map(c=>COLOR_JP[c]||c).join(' / ')],
        ['誤差', '±' + tolVal + '%'],
      ]).replace('<div class="result-box">','').replace('</div>','')}</div>
    </div>`;
    showAmzLink('color-amz', 'カーボン抵抗 1/4W セット');
    amz.style.display = 'inline-flex';
    if (window.yzrsTrackResult) window.yzrsTrackResult('color_code', 'electronics');
  }

  document.getElementById('cc-val').addEventListener('input', calcV2C);
  document.getElementById('cc-tol').addEventListener('change', calcV2C);

  // Color -> Value
  function rebuildSelects() {
    const container = document.getElementById('cc-selects');
    const n4 = bands === 4 ? ['帯1','帯2','乗数','誤差'] : ['帯1','帯2','帯3','乗数','誤差'];
    container.innerHTML = n4.map((label, i) => {
      const isLast = i === n4.length - 1;
      const colors = isLast ? TOL_COLORS : (i === n4.length - 2 ? MULT_COLORS : DIGIT_COLORS);
      const opts = colors.map(c =>
        `<option value="${c}" style="background:${COLORS[c].hex};color:${c==='white'||c==='yellow'?'#333':'#fff'};">${COLOR_JP[c]||c}</option>`
      ).join('');
      return `<div class="field" style="min-width:70px;">
        <label style="font-size:10px;">${label}</label>
        <select id="cc-s-${i}" onchange="calcC2V()" style="font-size:13px;padding:8px 28px 8px 10px;">
          <option value="">—</option>${opts}
        </select>
      </div>`;
    }).join('');
    calcC2V();
  }

  window.calcC2V = function() {
    const el = document.getElementById('cc-c2v-result');
    const amz = document.getElementById('color-amz');
    const n4 = bands === 4 ? 4 : 5;
    const vals = Array.from({length: n4}, (_,i) => {
      const s = document.getElementById('cc-s-'+i);
      return s ? s.value : '';
    });
    if (vals.some(v=>!v)) { el.innerHTML=''; amz.style.display='none'; return; }

    const calculation = resistorBandsToValue(vals, bands);
    if (calculation.status === 'error') {
      el.innerHTML = resultBox([], '帯の色を選び直してください');
      amz.style.display='none';
      return;
    }
    el.innerHTML = resultBox([
      ['抵抗値', fmtOhm(calculation.resistanceOhms), true],
      ['誤差', '±' + calculation.tolerancePercent + '%'],
      ['範囲', fmtOhm(calculation.minimumOhms) + ' ～ ' + fmtOhm(calculation.maximumOhms)],
    ]);
    showAmzLink('color-amz', 'カーボン抵抗 1/4W セット');
    amz.style.display = 'inline-flex';
    if (window.yzrsTrackResult) window.yzrsTrackResult('color_code', 'electronics');
  };
  window.calcC2V = window.calcC2V; // expose
})();

/* =========================================================
   4. Voltage Divider
   Vout = Vin * R2 / (R1 + R2)
   ========================================================= */
(function() {
  ['vd-Vin','vd-R1','vd-R2'].forEach(id => {
    document.getElementById(id).addEventListener('input', calc);
  });
  function calc() {
    const Vin = n(document.getElementById('vd-Vin').value);
    const R1  = n(document.getElementById('vd-R1').value);
    const R2  = n(document.getElementById('vd-R2').value);
    const el  = document.getElementById('vdiv-result');
    const amz = document.getElementById('vdiv-amz');

    if (Vin == null || R1 == null || R2 == null) { el.innerHTML=''; amz.style.display='none'; return; }
    if (R1 <= 0 || R2 <= 0) { el.innerHTML = resultBox([], 'R1, R2 は正の値を入力してください'); amz.style.display='none'; return; }

    const Vout = Vin * R2 / (R1 + R2);
    const ratio = R2 / (R1 + R2);

    el.innerHTML = resultBox([
      ['Vout 出力電圧', fmtVolt(Vout), true],
      ['分圧比 R2/(R1+R2)', (ratio * 100).toFixed(2) + ' %'],
      ['R1 + R2', fmtOhm(R1 + R2)],
    ]);
    if (window.yzrsTrackResult) window.yzrsTrackResult('voltage_divider', 'electronics');
    showAmzLink('vdiv-amz', 'カーボン抵抗 1/4W セット');
    amz.style.display = 'inline-flex';
  }
})();

/* =========================================================
   5. 555 Timer Astable
   f = 1.44 / ((R1 + 2*R2) * C)
   D = (R1 + R2) / (R1 + 2*R2)
   ========================================================= */
(function() {
  ['t555-R1','t555-R2','t555-C'].forEach(id => {
    document.getElementById(id).addEventListener('input', calc);
  });
  function calc() {
    const R1 = n(document.getElementById('t555-R1').value);
    const R2 = n(document.getElementById('t555-R2').value);
    const C_uF = n(document.getElementById('t555-C').value);
    const el  = document.getElementById('t555-result');
    const amz = document.getElementById('t555-amz');

    if (R1 == null || R2 == null || C_uF == null) { el.innerHTML=''; amz.style.display='none'; return; }
    if (R1 <= 0 || R2 <= 0 || C_uF <= 0) { el.innerHTML = resultBox([], 'R1, R2, C は正の値を入力してください'); amz.style.display='none'; return; }

    const calculation = calculate555Astable(R1, R2, C_uF);
    if (calculation.status !== 'ok') {
      el.innerHTML = resultBox([], '計算範囲を超えています。正の有限値を入力してください');
      amz.style.display='none';
      return;
    }

    el.innerHTML = resultBox([
      ['f 周波数', fmtFreq(calculation.frequencyHz), true],
      ['T 周期', fmtTime(calculation.periodSeconds)],
      ['D デューティ比', (calculation.dutyCycle * 100).toFixed(2) + ' %'],
      ['C 容量', fmtFarad(calculation.capacitanceF)],
    ]);
    if (window.yzrsTrackResult) window.yzrsTrackResult('timer_555', 'electronics');
    showAmzLink('t555-amz', 'NE555 タイマーIC');
    amz.style.display = 'inline-flex';
  }
})();

/* =========================================================
   6. Battery Life
   hours = capacity / current
   ========================================================= */
(function() {
  ['bat-cap','bat-cur'].forEach(id => {
    document.getElementById(id).addEventListener('input', calc);
  });
  function calc() {
    const cap = n(document.getElementById('bat-cap').value);
    const cur = n(document.getElementById('bat-cur').value);
    const el  = document.getElementById('bat-result');
    const amz = document.getElementById('bat-amz');

    if (cap == null || cur == null) { el.innerHTML=''; amz.style.display='none'; return; }
    if (cap <= 0 || cur <= 0) { el.innerHTML = resultBox([], '正の値を入力してください'); amz.style.display='none'; return; }

    const calculation = calculateBatteryRuntime(cap, cur);
    if (calculation.status !== 'ok') {
      el.innerHTML = resultBox([], '計算範囲を超えています。正の有限値を入力してください');
      amz.style.display='none';
      return;
    }
    const wholeHours = Math.floor(calculation.totalMinutes / 60);
    const remainingMinutes = calculation.totalMinutes % 60;

    el.innerHTML = resultBox([
      ['理論駆動時間', wholeHours + ' 時間 ' + remainingMinutes + ' 分', true],
    ]) + '<p class="note-small" style="margin-top:8px;">これは容量[mAh]÷平均消費電流[mA]の理論値です。実際の時間は負荷、放電特性、温度、劣化、変換回路の効率、終止電圧で変わるため、固定係数では補正しません。</p>';
    if (window.yzrsTrackResult) window.yzrsTrackResult('battery_runtime', 'electronics');
    showAmzLink('bat-amz', '単3 充電池');
    amz.style.display = 'inline-flex';
  }
})();

/* =========================================================
   7. Engineering Notation Parser
   Parses: 10k, 4k7, 1M5, 100R, 4u7, 100n, 2p2, 1m
   ========================================================= */
(function() {
  document.getElementById('eng-input').addEventListener('input', calc);
  function calc() {
    const raw = document.getElementById('eng-input').value.trim();
    const el  = document.getElementById('eng-result');
    if (!raw) { el.innerHTML=''; return; }

    const val = parseEng(raw);
    if (val == null || isNaN(val)) {
      el.innerHTML = resultBox([], '認識できない形式です（例: 4k7, 1M5, 1m, 4u7, 100n, 2p2, 100R）');
      return;
    }

    // Determine category from suffix
    const normalized = raw.replace(/µ/g, 'u').replace(/\s+/g, '');
    let category = 'resistance'; // default
    if (/[pnu]/i.test(normalized) && !/[rk]/i.test(normalized)) category = 'capacitance';
    if (/(?:hz|h|z)$/i.test(normalized)) category = 'frequency';

    let rows = [['数値', val.toPrecision(6).replace(/\.?0+$/, '')]];
    if (category === 'resistance') {
      rows.push(['抵抗値', fmtOhm(val)]);
    } else if (category === 'capacitance') {
      rows.push(['容量', fmtFarad(val)]);
    } else {
      rows.push(['周波数', fmtFreq(val)]);
    }
    // Reverse: best prefix notation
    rows.push(['接頭辞表記（M/mを区別）', toEngNotation(val)]);
    el.innerHTML = resultBox(rows);
    if (window.yzrsTrackResult) window.yzrsTrackResult('engineering_notation', 'electronics');
  }

  function parseEng(s) {
    // M（mega）とm（milli）は大文字・小文字を区別する。
    const normalized = s.trim().replace(/µ/g, 'u').replace(/\s+/g, '');
    // 部品表記の小数点置換: 4k7, 1M5, 4u7, 2p2, 100R。
    // 従来どおり周波数の Hz / H / Z 接尾辞も受け付ける。
    const match = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))((?:[Mm][Ee][Gg])|[RrKkMmUuNnPpFfGgTt]?)(\d*)(?:Hz|HZ|hz|h|H|z|Z)?$/);
    if (!match) return null;

    const [, integerPart, prefix, fractionalPart] = match;
    if (fractionalPart && (!prefix || integerPart.includes('.'))) return null;

    const factors = {
      '': 1,
      R: 1, r: 1,
      K: 1e3, k: 1e3,
      M: 1e6,
      meg: 1e6,
      m: 1e-3,
      U: 1e-6, u: 1e-6,
      N: 1e-9, n: 1e-9,
      P: 1e-12, p: 1e-12,
      F: 1e-15, f: 1e-15,
      G: 1e9, g: 1e9,
      T: 1e12, t: 1e12,
    };
    const significand = Number(fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart);
    const factor = factors[prefix.toLowerCase() === 'meg' ? 'meg' : prefix];
    return Number.isFinite(significand) && factor !== undefined ? significand * factor : null;
  }

  function toEngNotation(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    const prefixes = [
      [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'],
      [1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']
    ];
    for (const [factor, label] of prefixes) {
      if (abs >= factor) {
        const val = v / factor;
        const s = val.toPrecision(3).replace(/\.?0+$/, '');
        return s + label;
      }
    }
    return v.toExponential(3);
  }
})();

/* =========================================================
   Service Worker Registration
   ========================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js')
      .catch(function(err) { console.warn('SW registration failed:', err); });
  });
}
