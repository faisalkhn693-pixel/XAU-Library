import test from 'node:test';
import assert from 'node:assert/strict';
import { caseIdFor, normalizeCase, nextCaseSequence } from '../case-model.js';
import { findSimilarCases, similarityScore } from '../similarity.js';
import { analyzeMistakes, discoverPatterns, runExperiment, summarize } from '../research-engine.js';

const sample=(id,patch={})=>({id,caseId:`XAU-${String(Number(id)).padStart(6,'0')}`,capturedAt:`2026-01-${String(id).padStart(2,'0')}T10:00:00Z`,direction:'Long',scenario:'Reversal',session:'London',locations:['VWAP','Band 1'],cvd:{raw:12000,bucket:'10–20k',relationship:'Price ↑ / CVD ↓'},structure:{price:'HL',cvd:'LL'},trd:{timeframe:'3m',direction:'Up',type:'Sweep + reaction'},trade:{result:id%2?'WIN':'LOSS',resultR:id%2?2:-1},...patch});

test('permanent case IDs are sequential and sequence advances past existing IDs',()=>{
  assert.equal(caseIdFor(1),'XAU-000001');
  assert.equal(nextCaseSequence([{caseId:'XAU-000009'}],4),10);
  assert.equal(nextCaseSequence([],12),12);
});

test('normalization adds research fields without mutating or dropping original fields',()=>{
  const old=sample(1);old.notes={saw:'held VWAP'};old.genie={interpretation:{scenario:'Reversal'}};
  const before=structuredClone(old);const normalized=normalizeCase(old,7,'2026-03-01T00:00:00Z');
  assert.deepEqual(old,before);assert.equal(normalized.caseId,'XAU-000001');
  assert.equal(normalized.notes.saw,'held VWAP');assert.deepEqual(normalized.genieInterpretation,{scenario:'Reversal'});
  assert.equal(normalized.userInterpretation.saw,'held VWAP');assert.equal(normalized.originalSnapshot.observation.locations[0],'VWAP');
});

test('similarity is transparent, scores multi-location overlap, and ignores missing features',()=>{
  const a=sample(1),b=sample(2,{locations:['VWAP']});
  const result=similarityScore(a,b,{locations:20,direction:10,session:5});
  assert.equal(result.score,100*(20*.5+10+5)/35);
  const missing=sample(3,{direction:'Unknown',session:''});
  const reduced=similarityScore(a,missing,{locations:20,direction:10,session:5});
  assert.equal(reduced.consideredWeight,20);
  assert.equal(reduced.score,100);
});

test('similar historical retrieval includes winners and losers, excludes current case and sorts by score',()=>{
  const current=sample(1);const exact=sample(2);const partial=sample(3,{direction:'Short'});
  const found=findSimilarCases(current,[current,partial,exact],{weights:{locations:50,direction:50}});
  assert.deepEqual(found.map(x=>x.case.id),[2,3]);
  assert.equal(found[0].score,100);assert.equal(found[1].score,50);
  assert.ok(found.some(x=>x.case.trade.result==='LOSS'));
});

test('summary reports explicit sample size, outcomes, total, average and median R',()=>{
  const cases=[sample(1,{trade:{result:'WIN',resultR:2}}),sample(2,{trade:{result:'LOSS',resultR:-1}}),sample(3,{trade:{result:'BE',resultR:0}}),sample(4,{trade:{result:'NO TRADE',resultR:null}})];
  assert.deepEqual(summarize(cases),{sampleSize:4,wins:1,losses:1,be:1,noTrade:1,closed:3,winRate:100/3,totalR:1,averageR:1/3,medianR:0});
});

test('patterns require configured sample sizes and maturity describes sample count only',()=>{
  const cases=Array.from({length:5},(_,i)=>sample(i+1));
  const none=discoverPatterns(cases,{minimumSample:10});assert.equal(none.length,0);
  const found=discoverPatterns(cases,{minimumSample:5});assert.ok(found.length>=1);
  assert.ok(found.every(x=>x.maturity==='Early pattern'&&x.summary.sampleSize===5));
});

test('experiments return matching cases without ranking them; mistakes aggregate real cases',()=>{
  const cases=[sample(1),sample(2,{direction:'Short'}),sample(3,{mistakes:['Late entry','Ignored CVD']}),sample(4,{mistakes:['Late entry']})];
  const result=runExperiment(cases,{title:'London longs',constraints:{direction:'Long',session:'London'}});
  assert.equal(result.summary.sampleSize,3);assert.equal(result.query.title,'London longs');assert.equal('rank' in result,false);
  const mistakes=analyzeMistakes(cases);assert.equal(mistakes[0].mistake,'Late entry');assert.equal(mistakes[0].summary.sampleSize,2);
});
