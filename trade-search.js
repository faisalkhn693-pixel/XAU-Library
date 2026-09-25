
import { cvdBucket } from './case-model.js';

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
  if (!needle) return [];
  let targetBucket = '';
  const range = /^(\d+)[–-](\d+)k?$/i.exec(needle);
  if (range) targetBucket = `${Number(range[1])}–${Number(range[2])}k`;
  else if (/^50k\+$/i.test(needle)) targetBucket = '50k+';
  else {
    const thousands = /k$/i.test(needle);
    const numeric = thousands ? needle.slice(0, -1) : needle;
    if (!isNumeric(numeric)) return [];
    targetBucket = cvdBucket(Number(numeric) * (thousands ? 1000 : 1));
  }
  if (!targetBucket) return [];
  return getCvdValues(setup).filter(({ raw }) => cvdBucket(numericText(raw)) === targetBucket)
    .map(value => ({ ...value, bucket: targetBucket }));
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

