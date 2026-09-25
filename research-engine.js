const resultOf=c=>c.outcome?.result??c.trade?.result??'';
const rOf=c=>c.outcome?.resultR??c.trade?.resultR;

export function summarize(cases) {
  const R=cases.filter(c=>['WIN','LOSS','BE'].includes(resultOf(c))).map(c=>Number(rOf(c))).filter(Number.isFinite).sort((a,b)=>a-b);
  const wins=cases.filter(c=>resultOf(c)==='WIN').length;
  const losses=cases.filter(c=>resultOf(c)==='LOSS').length;
  const be=cases.filter(c=>resultOf(c)==='BE').length;
  const noTrade=cases.filter(c=>resultOf(c)==='NO TRADE').length;
  const totalR=R.reduce((a,b)=>a+b,0);
  return {sampleSize:cases.length,wins,losses,be,noTrade,closed:wins+losses+be,
    winRate:wins+losses+be?100*wins/(wins+losses+be):null,totalR,
    averageR:R.length?totalR/R.length:null,
    medianR:R.length?(R.length%2?R[(R.length-1)/2]:(R[R.length/2-1]+R[R.length/2])/2):null};
}

const obs=c=>c.observation??c;
const val=(c,k)=>({
  location:obs(c).locations, direction:obs(c).direction, scenario:obs(c).scenario,
  relationship:obs(c).cvd?.relationship, session:obs(c).session,
  priceStructure:obs(c).structure?.price, cvdStructure:obs(c).structure?.cvd,
  trdTimeframe:obs(c).trd?.timeframe, trdDirection:obs(c).trd?.direction,
}[k]);
const patterns=[
  {id:'location-cvd-trd-scenario',title:'Location + CVD relationship + TRD + scenario',keys:['location','relationship','trdTimeframe','trdDirection','scenario']},
  {id:'location-structures-trd',title:'Location + 15m structures + TRD timeframe',keys:['location','priceStructure','cvdStructure','trdTimeframe']},
  {id:'location-direction-cvd-session',title:'Location + direction + CVD relationship + session',keys:['location','direction','relationship','session']},
];
function token(value){return Array.isArray(value)?[...value].sort().join('|'):value??''}
function labelFor(c,keys){return keys.map(k=>`${k}: ${token(val(c,k))||'Unknown'}`).join(' · ')}

export function discoverPatterns(cases, {minimumSample=5, thresholds={early:5,developing:10,established:20}}={}) {
  const output=[];
  for(const definition of patterns){
    const groups=new Map();
    for(const c of cases){const values=definition.keys.map(k=>val(c,k));if(values.some(v=>!v||Array.isArray(v)&&!v.length))continue;
      const key=values.map(token).join('\u001f');if(!groups.has(key))groups.set(key,{label:labelFor(c,definition.keys),cases:[]});groups.get(key).cases.push(c)}
    for(const group of groups.values())if(group.cases.length>=minimumSample){const n=group.cases.length;const maturity=n>=thresholds.established?'Established pattern':n>=thresholds.developing?'Developing pattern':'Early pattern';output.push({id:`${definition.id}:${group.label}`,combination:definition.title,label:group.label,maturity,cases:group.cases,summary:summarize(group.cases)})}
  }
  return output.sort((a,b)=>b.summary.sampleSize-a.summary.sampleSize||a.combination.localeCompare(b.combination));
}

export function runExperiment(cases, query) {
  const constraints=query?.constraints??{};
  const matched=cases.filter(c=>Object.entries(constraints).every(([key,wanted])=>{
    if(wanted===''||wanted==null)return true;
    const actual=val(c,key);
    return Array.isArray(actual)?actual.includes(wanted):actual===wanted;
  }));
  return {query:structuredClone(query),cases:matched,summary:summarize(matched)};
}

export function analyzeMistakes(cases) {
  const map=new Map();
  for(const c of cases)for(const mistake of c.mistakes??[]){if(!map.has(mistake))map.set(mistake,[]);map.get(mistake).push(c)}
  return [...map].map(([mistake,items])=>({mistake,cases:items,summary:summarize(items)})).sort((a,b)=>b.summary.sampleSize-a.summary.sampleSize||a.mistake.localeCompare(b.mistake));
}
