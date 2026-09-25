export const CASE_SCHEMA_VERSION = 2;
export const APP_DATA_VERSION = 2;

export const FIELD_WEIGHTS = Object.freeze({
  locations: 25, direction: 14, scenario: 12, relationship: 12,
  priceStructure: 10, cvdStructure: 10, trdTimeframe: 5,
  trdDirection: 4, trdType: 3, session: 3, cvdBucket: 2,
});
export const DEFAULT_RESEARCH_CONFIG = Object.freeze({
  similarityWeights: FIELD_WEIGHTS,
  minimumPatternSample: 5,
  patternThresholds: { early: 5, developing: 10, established: 20 },
});

export function cvdBucket(raw) {
  if (raw === '' || raw == null || !Number.isFinite(Number(raw))) return '';
  const value = Number(raw), n = Math.abs(value);
  if (n === 0) return '0–5k';
  const sign = value > 0 ? '+' : '-';
  if (n >= 50000) return `${sign}50k+`;
  const lower=Math.floor(n/5000)*5;
  return `${sign}${lower}–${lower+5}k`;
}

export function caseIdFor(sequence) {
  return `XAU-${String(sequence).padStart(6, '0')}`;
}

function observationFromCase(c) {
  return {
    capturedAt: c.capturedAt ?? null, instrument: c.instrument ?? 'XAUUSD',
    session: c.session ?? '', direction: c.direction ?? '', scenario: c.scenario ?? '',
    locations: Array.isArray(c.locations) ? [...c.locations] : [], locationOther: c.locationOther ?? '',
    cvd: structuredClone(c.cvd ?? {}), structure: structuredClone(c.structure ?? {}),
    trd: structuredClone(c.trd ?? {}), entryQuality: structuredClone(c.entryQuality ?? {}),
    mistakes: Array.isArray(c.mistakes) ? [...c.mistakes] : [],
  };
}

// Additive normalization only: all source properties are retained.
export function normalizeCase(source, sequence = 1, now = new Date().toISOString()) {
  const c = structuredClone(source);
  c.caseId ??= caseIdFor(sequence);
  c.createdAt ??= c.capturedAt ?? now;
  c.modifiedAt ??= c.updatedAt ?? c.createdAt;
  c.dataVersion ??= CASE_SCHEMA_VERSION;
  c.observation ??= observationFromCase(c);
  c.originalSnapshot ??= { recordedAt: c.createdAt, observation: structuredClone(c.observation) };
  c.userInterpretation ??= structuredClone(c.notes ?? {});
  c.genieInterpretation ??= structuredClone(c.genie?.interpretation ?? null);
  c.userReview ??= structuredClone(c.genie?.userReview ?? null);
  c.entryQuality ??= { location: 'Unknown', confirmation: 'Unknown', type: 'Unknown' };
  c.mistakes ??= [];
  c.outcome ??= {
    result: c.trade?.result ?? '', resultR: c.trade?.resultR ?? null,
    plannedRR: c.trade?.plannedRR ?? '', mae: null, mfe: null, exitType: '',
    actualEntry: null, actualExit: null, actualStop: null, actualTarget: null,
  };
  c.revisions ??= [];
  return c;
}

export function nextCaseSequence(cases, savedNext = 1) {
  const greatest = cases.reduce((n, c) => {
    const match = /^XAU-(\d+)$/.exec(c.caseId ?? '');
    return match ? Math.max(n, Number(match[1]) + 1) : n;
  }, 1);
  return Math.max(1, Number(savedNext) || 1, greatest);
}

export function normalizeCases(cases, now=new Date().toISOString()) {
  const used=new Set(cases.map(c=>c.caseId).filter(Boolean));
  let sequence=nextCaseSequence(cases);
  return cases.map(source=>{
    if(source.caseId)return normalizeCase(source,sequence,now);
    while(used.has(caseIdFor(sequence)))sequence++;
    const normalized=normalizeCase(source,sequence,now);used.add(normalized.caseId);sequence++;
    return normalized;
  });
}

export function snapshotForRevision(c) {
  const snapshot = structuredClone(c);
  delete snapshot.screenshots;
  delete snapshot.originalSnapshot;
  delete snapshot.revisions;
  return snapshot;
}

