(() => {
  function attachFemtoCategoryCorrection() {
    const input = document.getElementById('eng-input');
    const result = document.getElementById('eng-result');
    if (!input || !result) return;

    input.addEventListener('input', () => {
      const normalized = input.value.replace(/µ/g, 'u').replace(/\s+/g, '');
      if (!/[f]/i.test(normalized) || /[rk]/i.test(normalized)) return;
      if (typeof window.parseEng !== 'function' || typeof window.fmtFarad !== 'function') return;

      const parsed = window.parseEng(input.value);
      if (!parsed || parsed.value == null || !Number.isFinite(parsed.value)) return;

      const rows = result.querySelectorAll('.result-row');
      if (rows.length < 2) return;
      const label = rows[1].querySelector('.result-label');
      const value = rows[1].querySelector('.result-value');
      if (label) label.textContent = '容量';
      if (value) value.textContent = window.fmtFarad(parsed.value);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachFemtoCategoryCorrection, { once: true });
  } else {
    attachFemtoCategoryCorrection();
  }
})();
