import { readFile } from 'node:fs/promises';

export const DEP_DATASET = 'https://data.cityofnewyork.us/Environment/Harbor-Water-Quality/5uug-f49n';
export const DEP_API = 'https://data.cityofnewyork.us/resource/5uug-f49n.json';
export const DEP_FIELDS = ['sampling_location','duplicate_sample','sample_date','sample_time','long','lat','top_enterococci_bacteria_cells_100ml','bottom_enterococci_bacteria_cells_100ml','enterococcus_top_sample_less_than_or_greater_than_result','enterococcus_bottom_sample_less_than_or_greater_than_result','top_fecal_coliform_bacteria_cells_100ml','bottom_fecal_coliform_bacteria_cells_100ml','fecal_coliform_top_sample_less_than_or_greater_than_result','fecal_coliform_bottom_sample_less_than_or_greater_than_result','top_sample_depth_ft','bottom_sample_depth_ft','sampling_comment'];
export const DEP_SAMPLE_URL = `${DEP_API}?${new URLSearchParams({'$select':DEP_FIELDS.join(','),'$order':'sample_date DESC,sampling_location ASC','$limit':'1500'})}`;
export const DEP_COORDINATE_URL = `${DEP_API}?${new URLSearchParams({'$select':'sampling_location,long,lat,sample_date','$where':"long is not null AND lat is not null AND long != '0' AND lat != '0'",'$order':'sample_date DESC,sampling_location ASC','$limit':'5000'})}`;
const inArea=(lat,lon)=>lat>=40.58&&lat<=40.83&&lon>=-74.12&&lon<=-73.85;

export async function readJsonBounded(response,maxBytes=3*1024*1024){
  if(!response.ok)throw new Error(`Source HTTP ${response.status}`);
  const declared=Number(response.headers.get('content-length'));
  if(declared>maxBytes)throw new Error('Source response is too large');
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error('Source response is too large');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function locate(row){
  if(row.lat==null||row.long==null||String(row.lat).trim()===''||String(row.long).trim()==='')return null;
  let lat=Number(row.lat),lon=Number(row.long),swapped=false;
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  if(!inArea(lat,lon)){if(inArea(lon,lat)){[lat,lon]=[lon,lat];swapped=true;}else return null;}
  return {latitude:lat,longitude:lon,coordinateRecordDate:row.sample_date?.slice(0,10)||null,coordinateColumnsSwapped:swapped};
}

export function parseResult(raw,flag=''){
  if(raw==null||String(raw).trim()==='')return null;
  const match=String(raw).trim().match(/^([<>]=?)?\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/);
  if(!match)return null;
  const value=Number(match[2]);if(!Number.isFinite(value)||value<0)return null;
  const sourceFlag=String(flag||'').trim();
  const qualifier=match[1]||(['<','>','<=','>=','='].includes(sourceFlag)?sourceFlag:'=');
  return {value,qualifier,providerFlag:sourceFlag,rawValue:String(raw)};
}

function sampleOrder(row){
  const date=String(row.sample_date||'').slice(0,10);
  const m=String(row.sample_time||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  let minutes=-1;
  if(m){let hour=Number(m[1]);if(m[3])hour=hour%12+(/PM/i.test(m[3])?12:0);if(hour<24&&Number(m[2])<60)minutes=hour*60+Number(m[2]);}
  return `${date}|${String(minutes+1).padStart(4,'0')}`;
}

export function normalizeDep(rows,coordinateRows){
  if(!Array.isArray(rows)||!Array.isArray(coordinateRows))throw new Error('DEP returned an unexpected schema');
  const coordinates=new Map();
  for(const row of [...coordinateRows].sort((a,b)=>sampleOrder(b).localeCompare(sampleOrder(a)))){
    const loc=locate(row);if(loc&&row.sampling_location&&!coordinates.has(row.sampling_location))coordinates.set(row.sampling_location,loc);
  }
  const selected=new Map();let rowsWithoutMappedLocation=0;
  for(const row of [...rows].sort((a,b)=>sampleOrder(b).localeCompare(sampleOrder(a)))){
    if(!row.sampling_location||!/^\d{4}-\d{2}-\d{2}/.test(row.sample_date||''))continue;
    const originalLocation=locate(row),location=originalLocation||coordinates.get(row.sampling_location);
    if(!location){rowsWithoutMappedLocation++;continue;}
    for(const layer of ['top','bottom'])for(const organism of ['enterococci','fecal_coliform']){
      const flagKey=`${organism==='enterococci'?'enterococcus':'fecal_coliform'}_${layer}_sample_less_than_or_greater_than_result`;
      const result=parseResult(row[`${layer}_${organism}_bacteria_cells_100ml`],row[flagKey]);if(!result)continue;
      const key=`${row.sampling_location}|${organism}|${layer}`;if(selected.has(key))continue;
      selected.set(key,{id:`DEP|${key}|${row.sample_date}|${row.sample_time||''}`,station:row.sampling_location,...location,locationBasis:originalLocation?'same_sample_record':'historical_station_record',collectedDate:row.sample_date.slice(0,10),collectedTimeReported:row.sample_time||null,timeZone:'Not specified in dataset fields; source wall-clock time retained',target:organism==='enterococci'?'Enterococci':'Fecal coliform',endpointType:'Fecal indicator',layer,depthFtReported:row[`${layer}_sample_depth_ft`]||null,...result,unit:'cells/100 mL',unitBasis:'DEP dataset column title; not converted to CFU or MPN',method:'Not specified per result in this dataset',duplicateSampleReported:row.duplicate_sample||null,comment:row.sampling_comment||null,source:DEP_DATASET});
    }
  }
  const samples=[...selected.values()].sort((a,b)=>a.station.localeCompare(b.station)||a.target.localeCompare(b.target)||a.layer.localeCompare(b.layer));
  return {samples,latestPublishedSampleDate:rows.reduce((max,r)=>String(r.sample_date||'').slice(0,10)>max?String(r.sample_date).slice(0,10):max,''),latestMappedSampleDate:samples.reduce((max,r)=>r.collectedDate>max?r.collectedDate:max,''),stationCount:new Set(samples.map(s=>s.station)).size,queryRowCount:rows.length,rowsWithoutMappedLocation,coordinateRecordCount:coordinateRows.length,coverage:'Most recent available result per station, indicator and sampled layer within the Battery pilot bounds, from the latest 1,500 published rows. Not all pathogens, all stations, or real-time measurements.',locationNote:'Where recent records lack coordinates, the latest usable station-coordinate record in a bounded 5,000-row lookup is used and dated explicitly. Unmatched/out-of-area rows are not plotted. Some provider latitude/longitude columns are reversed; a swap is applied only when the corrected point falls within the NYC pilot bounds.'};
}

export function createDepService({fetchImpl=fetch,now=()=>Date.now(),snapshotUrl=new URL('../data/dep-snapshot.json',import.meta.url)}={}){
  let cache=null,inFlight=null,nextAttempt=0;
  const stamp=()=>new Date(now()).toISOString();
  async function refresh(){
    try{
      const results=await Promise.all([DEP_SAMPLE_URL,DEP_COORDINATE_URL].map(async url=>readJsonBounded(await fetchImpl(url,{signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}}))));
      cache={...normalizeDep(...results),retrievedAt:stamp(),sourceStatus:'refreshed',error:null};nextAttempt=now()+6*3600_000;
    }catch(error){
      if(!cache)try{const snapshot=JSON.parse(await readFile(snapshotUrl,'utf8'));if(!Array.isArray(snapshot.samples))throw new Error('Invalid snapshot');cache={...snapshot,sourceStatus:'saved_snapshot'};}catch{cache={samples:[],stationCount:0,sourceStatus:'unavailable',retrievedAt:null};}
      else cache={...cache,sourceStatus:cache.sourceStatus==='saved_snapshot'?'saved_snapshot':'cached'};
      cache.error=`DEP refresh unavailable (${error.message}). Collection dates remain unchanged.`;nextAttempt=now()+5*60_000;
    }
  }
  return {async read(){if(now()>=nextAttempt){if(!inFlight)inFlight=refresh().finally(()=>inFlight=null);await inFlight;}return {...cache,servedAt:stamp(),source:DEP_DATASET,queryUrls:{samples:DEP_SAMPLE_URL,coordinates:DEP_COORDINATE_URL},measurementMode:'Published historical laboratory observations; not live pathogen detection'};}};
}
