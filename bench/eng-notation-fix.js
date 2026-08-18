(() => {
  function parseFemto(input) {
    const normalized = input.trim().replace(/µ/g, 'u').replace(/\s+/g, '');
    const match = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([Ff])(\d*)$/);
    if (!match) return null;

    const [, integerPart, , fractionalPart] = match;
    if (fractionalPart && integerPart.includes('.')) return null;

    const significand = Number(
      fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart
    );
    return Number.isFinite(significand) ? significand * 1e-15 : null;
  }

  function fmtFarad(value) {
    if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return '—';
    if (value < 1e-9) return (value * 1e12).toPrecision(4).replace(/\.?0+$/, '') + ' pF';
    if (value < 1e-6) return (value * 1e9).toPrecision(4).replace(/\.?0+$/, '') + ' nF';
    if (value < 1e-3) return (value * 1e6).toPrecision(4).replace(/\.?0+$/, '') + ' µF';
    return value.toPrecision(4).replace(/\.?0+$/, '') + ' F';
  }

  function attachFemtoCategoryCorrection() {
    const input = document.getElementById('eng-input');
    const result = document.getElementById('eng-result');
    if (!input || !result) return;

    input.addEventListener('input', () => {
      const parsed = parseFemto(input.value);
      if (parsed == null) return;

      const rows = result.querySelectorAll('.result-row');
      if (rows.length < 2) return;
      const label = rows[1].querySelector('.result-label');
      const value = rows[1].querySelector('.result-value');
      if (label) label.textContent = '容量';
      if (value) value.textContent = fmtFarad(parsed);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachFemtoCategoryCorrection, { once: true });
  } else {
    attachFemtoCategoryCorrection();
  }
})();
