import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistoricSetups, findCvdMatches, getCvdValues } from '../trade-search.js';

test('searches the saved raw CVD exactly and by numeric substring without editing it',()=>{
  const trade={id:'trade-1',cvd:{raw:'12,345.6',bucket:'10–15k'},notes:{saw:'CVD was strong'}};
  const before=structuredClone(trade);
  assert.equal(findCvdMatches(trade,'12,345.6')[0].raw,'12,345.6');
  assert.equal(findCvdMatches(trade,'2345')[0].field,'cvd.raw');
  assert.deepEqual(trade,before);
});

test('finds and identifies separate nested CVD moments while collapsing the observation mirror',()=>{
  const trade={cvd:{raw:12000,readings:{'5m':11800,'15m':12500}},observation:{cvd:{raw:12000}}};
  const values=getCvdValues(trade);
  assert.equal(values.length,3);
  assert.deepEqual(findCvdMatches(trade,'12500').map(x=>x.field),['cvd.readings.15m']);
  assert.deepEqual(findCvdMatches(trade,'118').map(x=>x.field),['cvd.readings.5m']);
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

