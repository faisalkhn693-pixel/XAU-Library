const numericText = value => String(value ?? '').trim().replace(/[,_\s]/g, '');
const isNumeric = value => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value);

// The current model stores CVD at cvd.raw and mirrors it in observation.cvd.raw.
// Walking CVD-named branches also supports older/future per-timeframe readings.
export function getCvdValues(setup) {
  const found = new Map();
  const visit = (value, path = [], inCvdBranch = false) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)], inCvdBranch));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        visit(child, [...path, key], inCvdBranch || /cvd/i.test(key));
      }
      return;
    }
    if (!inCvdBranch || (typeof value !== 'number' && typeof value !== 'string')) return;
    const raw = String(value);
    const normalized = numericText(raw);
    if (!isNumeric(normalized)) return;
    const fullPath = path.join('.');
    const canonicalPath = fullPath.replace(/^observation\.cvd(?=\.|$)/i, 'cvd');
    found.set(`${canonicalPath}\u0000${normalized}`, { field: canonicalPath, raw });
  };
  visit(setup?.cvd, ['cvd'], true);
  visit(setup?.observation?.cvd, ['observation', 'cvd'], true);
  return [...found.values()];
}

export function findCvdMatches(setup, query) {
  const needle = numericText(query).toLowerCase();
  if (!needle || !/[\d]/.test(needle)) return [];
  const numericNeedle = isNumeric(needle) ? Number(needle) : NaN;
  const digitNeedle = needle.replace(/\D/g, '');
  return getCvdValues(setup).filter(({ raw }) => {
    const normalized = numericText(raw).toLowerCase();
    if (normalized === needle) return true;
    if (Number.isFinite(numericNeedle) && Number(raw) === numericNeedle) return true;
    if (normalized.includes(needle)) return true;
    const digits = normalized.replace(/\D/g, '');
    return digitNeedle.length > 0 && digits.includes(digitNeedle);
  });
}

export function filterHistoricSetups(setups, { textQuery = '', cvdQuery = '', filter = 'All' } = {}) {
  const text = textQuery.trim().toLowerCase();
  const cvd = cvdQuery.trim();
  return setups.map(setup => ({ setup, cvdMatches: cvd ? findCvdMatches(setup, cvd) : [] }))
    .filter(({ setup, cvdMatches }) => {
      const matchesFilter = filter === 'All' || setup.direction === filter || setup.scenario === filter;
      const searchable = [setup.caseId, setup.instrument, setup.session, setup.direction, setup.scenario,
        ...(setup.locations || []), setup.locationOther, setup.cvd?.relationship,
        setup.notes?.saw, setup.notes?.why, setup.notes?.happened, setup.notes?.learned,
        ...(setup.mistakes || [])].join(' ').toLowerCase();
      return matchesFilter && (!text || searchable.includes(text)) && (!cvd || cvdMatches.length > 0);
    });
}

export function formatCvdField(field) {
  return field.replace(/^observation\./, '').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
}

