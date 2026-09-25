import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistoricSetups, findCvdMatches, getCvdValues } from '../trade-search.js';

test('a numeric CVD search matches raw values in the selected 5k bucket without editing them',()=>{
  const trade={id:'trade-1',cvd:{raw:'12,345.6',bucket:'10–15k'},notes:{saw:'CVD was strong'}};
  const before=structuredClone(trade);
  assert.equal(findCvdMatches(trade,'12,345.6')[0].raw,'12,345.6');
  assert.equal(findCvdMatches(trade,'10,000')[0].field,'cvd.raw');
  assert.equal(findCvdMatches(trade,'10–15k')[0].bucket,'10–15k');
  assert.deepEqual(trade,before);
});

test('entering 4000 matches all trades in 0–5k and excludes the next bucket',()=>{
  const trades=[{cvd:{raw:0}},{cvd:{raw:2500}},{cvd:{raw:4999}},{cvd:{raw:5000}}];
  assert.deepEqual(trades.map(t=>findCvdMatches(t,'4000').length>0),[true,true,true,false]);
});

test('finds and identifies separate nested CVD moments while collapsing the observation mirror',()=>{
  const trade={cvd:{raw:12000,readings:{'5m':2800,'15m':15500}},observation:{cvd:{raw:12000}}};
  const values=getCvdValues(trade);
  assert.equal(values.length,3);
  assert.deepEqual(findCvdMatches(trade,'16000').map(x=>x.field),['cvd.readings.15m']);
  assert.deepEqual(findCvdMatches(trade,'4000').map(x=>x.field),['cvd.readings.5m']);
});

test('CVD search does not match trade notes or other non-CVD numbers',()=>{
  const trade={cvd:{raw:7500},trade:{entry:19875},notes:{saw:'CVD 19875'}};
  assert.deepEqual(findCvdMatches(trade,'19875'),[]);
  assert.deepEqual(findCvdMatches(trade,'7500').map(x=>x.field),['cvd.raw']);
});

test('CVD, text search and existing direction/scenario filters combine together',()=>{
  const trades=[
    {id:'one',caseId:'XAU-001',direction:'Long',scenario:'Reversal',session:'London',cvd:{raw:12500}},
    {id:'two',caseId:'XAU-002',direction:'Short',scenario:'Reversal',session:'London',cvd:{raw:12500}},
    {id:'three',caseId:'XAU-003',direction:'Long',scenario:'Continuation',session:'Asia',cvd:{raw:9000}},
  ];
  const matches=filterHistoricSetups(trades,{textQuery:'london',cvdQuery:'12,500',filter:'Long'});
  assert.deepEqual(matches.map(x=>x.setup.id),['one']);
  assert.equal(matches[0].cvdMatches[0].raw,'12500');
});

