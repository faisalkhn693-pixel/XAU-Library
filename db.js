import { caseIdFor, DEFAULT_RESEARCH_CONFIG, normalizeCase, normalizeCases, nextCaseSequence, snapshotForRevision } from './case-model.js';

const DB_NAME='xau-library';
const DB_VERSION=3;
const request=indexedDB.open(DB_NAME,DB_VERSION);
request.onupgradeneeded=event=>{
  const db=request.result,tx=request.transaction;
  if(!db.objectStoreNames.contains('setups'))db.createObjectStore('setups',{keyPath:'id'});
  if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'key'});
  if(!db.objectStoreNames.contains('experiments'))db.createObjectStore('experiments',{keyPath:'id'});
  if(!db.objectStoreNames.contains('metadata'))db.createObjectStore('metadata',{keyPath:'key'});
  if(!db.objectStoreNames.contains('tombstones'))db.createObjectStore('tombstones',{keyPath:'caseId'});
  const setupStore=tx.objectStore('setups');
  const all=setupStore.getAll();
  all.onsuccess=()=>{
    const old=all.result.sort((a,b)=>String(a.capturedAt||'').localeCompare(String(b.capturedAt||'')));
    normalizeCases(old).forEach(c=>setupStore.put(c));
    const meta=tx.objectStore('metadata'),sequenceReq=meta.get('caseSequence'),configReq=meta.get('researchConfig'),backupReq=meta.get('backupInfo');
    sequenceReq.onsuccess=()=>meta.put({key:'caseSequence',value:nextCaseSequence(old,sequenceReq.result?.value)});
    configReq.onsuccess=()=>{if(!configReq.result)meta.put({key:'researchConfig',value:structuredClone(DEFAULT_RESEARCH_CONFIG)})};
    backupReq.onsuccess=()=>{if(!backupReq.result)meta.put({key:'backupInfo',value:{lastBackupAt:null}})};
  };
};
export const database=new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});

function getAllFrom(storeName){return database.then(db=>new Promise((resolve,reject)=>{const req=db.transaction(storeName).objectStore(storeName).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}))}
function getMeta(key){return database.then(db=>new Promise((resolve,reject)=>{const req=db.transaction('metadata').objectStore('metadata').get(key);req.onsuccess=()=>resolve(req.result?.value);req.onerror=()=>reject(req.error)}))}
export async function allSetups(){return (await getAllFrom('setups')).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))}
export async function allExperiments(){return (await getAllFrom('experiments')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
export const getResearchConfig=async()=>structuredClone((await getMeta('researchConfig'))||DEFAULT_RESEARCH_CONFIG);
export async function saveResearchConfig(config){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:'researchConfig',value:structuredClone(config)});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
export async function saveSetup(input){
  const db=await database,now=new Date().toISOString();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['setups','metadata'],'readwrite'),store=tx.objectStore('setups'),meta=tx.objectStore('metadata');
    const oldReq=store.get(input.id),seqReq=meta.get('caseSequence');let result;
    const finish=()=>{
      if(oldReq.readyState!=='done'||seqReq.readyState!=='done')return;
      const old=oldReq.result,seq=Number(seqReq.result?.value)||1;
      if(old){
        result={...old,...input,caseId:old.caseId,createdAt:old.createdAt,dataVersion:old.dataVersion,originalSnapshot:old.originalSnapshot,
          genieInterpretation:old.genieInterpretation,userReview:input.userReview??old.userReview,
          revisions:[...(old.revisions||[]),{at:now,snapshot:snapshotForRevision(old)}],modifiedAt:now};
      }else{
        result=normalizeCase({...input,caseId:caseIdFor(seq),createdAt:now,modifiedAt:now,dataVersion:2},seq,now);
        meta.put({key:'caseSequence',value:seq+1});
      }
      store.put(result);
    };
    oldReq.onsuccess=finish;seqReq.onsuccess=finish;oldReq.onerror=()=>tx.abort();seqReq.onerror=()=>tx.abort();
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Case save failed'));
  });
}
export async function removeSetup(id){
  const db=await database;
  return new Promise((resolve,reject)=>{const tx=db.transaction(['setups','tombstones'],'readwrite'),setups=tx.objectStore('setups'),tombs=tx.objectStore('tombstones');const req=setups.get(id);req.onsuccess=()=>{const c=req.result;if(c?.caseId)tombs.put({caseId:c.caseId,deletedAt:new Date().toISOString()});setups.delete(id)};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
}
export async function saveExperiment(experiment){const db=await database;const item={...experiment,id:experiment.id||crypto.randomUUID(),createdAt:experiment.createdAt||new Date().toISOString(),modifiedAt:new Date().toISOString()};return new Promise((resolve,reject)=>{const tx=db.transaction('experiments','readwrite');tx.objectStore('experiments').put(item);tx.oncomplete=()=>resolve(item);tx.onerror=()=>reject(tx.error)})}
export async function deleteExperiment(id){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('experiments','readwrite');tx.objectStore('experiments').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}

export async function exportDatabase(){const [cases,experiments,metadata,tombstones]=await Promise.all([allSetups(),allExperiments(),getAllFrom('metadata'),getAllFrom('tombstones')]);return {format:'xau-library-research-backup',version:2,appVersion:'1.2.0',schemaVersion:2,exportedAt:new Date().toISOString(),timezone:'Asia/Karachi',cases,experiments,metadata,tombstones}}
export async function markBackup(at){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('metadata','readwrite');tx.objectStore('metadata').put({key:'backupInfo',value:{lastBackupAt:at}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
export const lastBackupAt=()=>getMeta('backupInfo').then(x=>x?.lastBackupAt||null);

export async function replaceDatabase(payload){
  const db=await database,[currentCases,currentSeq,currentTombs]=await Promise.all([allSetups(),getMeta('caseSequence'),getAllFrom('tombstones')]);
  const cases=payload.cases||[],metadata=payload.metadata||[],backupSeq=metadata.find(x=>x.key==='caseSequence')?.value;
  const tombstones=[...currentTombs,...(payload.tombstones||[])],knownIds=new Set(tombstones.map(x=>x.caseId));
  const floor=Math.max(nextCaseSequence(currentCases,currentSeq),nextCaseSequence(cases,backupSeq));
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['setups','experiments','metadata','tombstones'],'readwrite');
    const s=tx.objectStore('setups'),e=tx.objectStore('experiments'),m=tx.objectStore('metadata'),t=tx.objectStore('tombstones');
    s.clear();e.clear();m.clear();t.clear();
    normalizeCases(cases).forEach(c=>s.put(c));
    (payload.experiments||[]).forEach(x=>e.put(x));
    metadata.forEach(x=>m.put(x));
    tombstones.forEach(x=>t.put(x));
    m.put({key:'caseSequence',value:Math.max(floor,...[...knownIds].map(id=>{const n=/^XAU-(\d+)$/.exec(id);return n?Number(n[1])+1:1}))});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Restore failed'));
  });
}
export async function replaceAll(setups){return replaceDatabase({cases:setups,experiments:[],metadata:[],tombstones:[]})}

export async function readDraft(){const db=await database;return new Promise((resolve,reject)=>{const req=db.transaction('drafts').objectStore('drafts').get('current');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
export async function saveDraft(draft){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({...draft,key:'current',savedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
export async function clearDraft(){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete('current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
