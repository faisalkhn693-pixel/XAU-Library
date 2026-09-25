import { FIELD_WEIGHTS } from './case-model.js';

const unknown = new Set(['', null, undefined, 'Unknown', 'Unclear', 'None']);
const available = v => Array.isArray(v) ? v.filter(x => !unknown.has(x)) : unknown.has(v) ? null : v;
function featureMap(c) {
  return {
    locations: c.observation?.locations ?? c.locations,
    direction: c.observation?.direction ?? c.direction,
    scenario: c.observation?.scenario ?? c.scenario,
    relationship: c.observation?.cvd?.relationship ?? c.cvd?.relationship,
    priceStructure: c.observation?.structure?.price ?? c.structure?.price,
    cvdStructure: c.observation?.structure?.cvd ?? c.structure?.cvd,
    trdTimeframe: c.observation?.trd?.timeframe ?? c.trd?.timeframe,
    trdDirection: c.observation?.trd?.direction ?? c.trd?.direction,
    trdType: c.observation?.trd?.type ?? c.trd?.type,
    session: c.observation?.session ?? c.session,
    cvdBucket: c.observation?.cvd?.bucket ?? c.cvd?.bucket,
  };
}
function compare(a, b, key) {
  const left=available(a), right=available(b);
  if (!left || !right) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    const A=new Set(Array.isArray(left)?left:[left]), B=new Set(Array.isArray(right)?right:[right]);
    const union=new Set([...A,...B]);
    return union.size ? [...A].filter(x=>B.has(x)).length/union.size : null;
  }
  return left===right?1:0;
}

export function similarityScore(target, candidate, weights=FIELD_WEIGHTS) {
  const A=featureMap(target), B=featureMap(candidate);
  let matched=0, considered=0; const breakdown={};
  for (const [key,weight] of Object.entries(weights)) {
    const score=compare(A[key],B[key],key);
    if (score===null || !Number.isFinite(weight) || weight<=0) continue;
    considered+=weight; matched+=score*weight; breakdown[key]={score,weight};
  }
  return {score:considered?100*matched/considered:0, consideredWeight:considered, breakdown};
}

export function findSimilarCases(target, cases, {weights=FIELD_WEIGHTS, limit=50, minimumScore=0}={}) {
  return cases.filter(c=>c.id!==target.id && c.caseId!==target.caseId)
    .map(c=>({case:c,...similarityScore(target,c,weights)}))
    .filter(x=>x.consideredWeight>0&&x.score>=minimumScore)
    .sort((a,b)=>b.score-a.score || String(b.case.capturedAt).localeCompare(String(a.case.capturedAt)))
    .slice(0,limit);
}
