import {readFile} from 'node:fs/promises';
import {readJsonBounded} from './dep.mjs';

export const CSO_SOURCE='https://data.gis.ny.gov/datasets/nysdec::combined-sewer-overflow-cso-outfalls/about';
export const CSO_LAYER='https://services6.arcgis.com/DZHaqZm9cxOD4CWM/arcgis/rest/services/Combined_Sewer_Overflow__CSO__Outfalls/FeatureServer/20';
export const CSO_QUERY=`${CSO_LAYER}/query?${new URLSearchParams({where:'1=1',geometry:'-74.12,40.58,-73.85,40.83',geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outSR:'4326',outFields:'OBJECTID,SPDES_PERMIT_NUMBER,OUTFALL_NUMBER,RECEIVING_WATERBODY_NAME,TREATMENT',returnGeometry:'true',resultRecordCount:'2000',f:'json'})}`;
export const ADVISORY_SOURCE='https://www.nyc.gov/site/dep/water/waterbody-advisories.page';
export const ADVISORY_DASHBOARD='https://nycwaterbodyadvisory.azurewebsites.net/';
export const ADVISORY_API=`${ADVISORY_DASHBOARD}api/advisory`;
const finite=n=>typeof n==='number'&&Number.isFinite(n);

export function normalizeOutfalls(data,metadata={}){
  if(data?.error||!Array.isArray(data?.features)||data.exceededTransferLimit)throw new Error('Incomplete or invalid DEC outfall response');
  const features=[];
  for(const f of data.features){
    const a=f.attributes||{},g=f.geometry||{};
    if(!a.OUTFALL_NUMBER||!finite(g.x)||!finite(g.y)||g.x< -74.12||g.x> -73.85||g.y<40.58||g.y>40.83)continue;
    features.push({type:'Feature',geometry:{type:'Point',coordinates:[g.x,g.y]},properties:{id:a.OBJECTID,outfall:a.OUTFALL_NUMBER,permit:a.SPDES_PERMIT_NUMBER||null,receivingWater:a.RECEIVING_WATERBODY_NAME||null,treatmentReported:a.TREATMENT||null,recordType:'CSO outfall inventory',dischargeStatus:'Unknown; this inventory has no live discharge observations',dischargeRate:null,pathogenLoad:null}});
  }
  if(data.features.length&&!features.length)throw new Error('No usable outfall coordinates returned');
  const edited=metadata.editingInfo?.dataLastEditDate;
  return {type:'FeatureCollection',features,count:features.length,source:CSO_SOURCE,queryUrl:CSO_QUERY,sourceDataEditedAt:finite(edited)?new Date(edited).toISOString():null,coverage:'NYS DEC CSO inventory within the NYC pilot bounds. Excludes New Jersey outfalls, sanitary sewer overflows, and the underground pipe network.',interpretation:'An outfall location is a potential source, not evidence of a discharge. No measured discharge rate or bacterial load is supplied.'};
}

export function createSewerService({fetchImpl=fetch,now=()=>Date.now(),snapshotUrl=new URL('../data/cso-snapshot.json',import.meta.url)}={}){
  let cache=null,pending=null,nextAttempt=0;
  async function refresh(){
    try{
      const [rows,meta]=await Promise.all([CSO_QUERY,`${CSO_LAYER}?f=json`].map(async url=>readJsonBounded(await fetchImpl(url,{signal:AbortSignal.timeout(18000)}))));
      cache={...normalizeOutfalls(rows,meta),retrievedAt:new Date(now()).toISOString(),sourceStatus:'refreshed',error:null};nextAttempt=now()+24*3600_000;
    }catch(error){
      if(!cache)try{cache={...JSON.parse(await readFile(snapshotUrl,'utf8')),sourceStatus:'saved_snapshot'};}catch{cache={type:'FeatureCollection',features:[],count:0,source:CSO_SOURCE,sourceStatus:'unavailable',retrievedAt:null};}
      else cache={...cache,sourceStatus:cache.sourceStatus==='saved_snapshot'?'saved_snapshot':'cached'};
      cache.error=`Outfall inventory refresh failed: ${error.message}`;nextAttempt=now()+5*60_000;
    }
  }
  return{async read(){if(now()>=nextAttempt){if(!pending)pending=refresh().finally(()=>pending=null);await pending;}return{...cache,servedAt:new Date(now()).toISOString()};}};
}

export function normalizeAdvisories(data,type){
  if(!Array.isArray(data)||!data.length||data.length>100)throw new Error('Invalid DEP advisory response');
  return data.map(r=>{
    if(!r.waterbody?.name||!Number.isInteger(r.waterbody.id)||!finite(r.duration)||r.duration<0||typeof r.message!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(r.occurredOn||''))throw new Error('Unrecognized DEP advisory record');
    return {waterbodyId:r.waterbody.id,waterbody:r.waterbody.name.trim(),waterClass:r.waterbody.class||null,rainGauge:r.waterbody.rainGauge||null,type,providerAdvisory:r.duration>0,message:r.message,durationHoursReported:r.duration,occurredOnReported:r.occurredOn,timeZone:'Provider timestamp has no UTC offset; preserved without conversion',volumeReported:finite(r.volume)?r.volume:null,volumeUnit:'Not specified by this API; not used as discharge or pathogen loading',source:ADVISORY_SOURCE};
  });
}

export function createAdvisoryService({fetchImpl=fetch,now=()=>Date.now()}={}){
  let cache=null,pending=null,nextAttempt=0;
  async function refresh(){
    try{
      const queriedAt=new Date(now()).toISOString();
      const urls=['WQ','CSO'].map(type=>`${ADVISORY_API}?${new URLSearchParams({advisoryType:type,occurredOn:queriedAt})}`);
      const records=await Promise.all(urls.map(async(url,i)=>normalizeAdvisories(await readJsonBounded(await fetchImpl(url,{signal:AbortSignal.timeout(18000)})),['WQ','CSO'][i])));
      cache={records:records.flat(),retrievedAt:queriedAt,queryUrls:urls,error:null};nextAttempt=now()+10*60_000;
    }catch(error){cache={...cache,error:`DEP advisory refresh failed: ${error.message}`};nextAttempt=now()+2*60_000;}
  }
  return{async read(){
    if(now()>=nextAttempt){if(!pending)pending=refresh().finally(()=>pending=null);await pending;}
    const records=cache?.records||[],latestReported=records.reduce((max,r)=>r.occurredOnReported>max?r.occurredOnReported:max,'');
    // A two-day tolerance avoids assuming a timezone for the provider's wall-clock dates.
    const outdated=latestReported&&now()-Date.parse(`${latestReported.slice(0,10)}T00:00:00Z`)>2*86400_000;
    const status=!records.length?'unavailable':cache.error?'stale':outdated?'outdated':'retrieved';
    return{...cache,records,status,latestReported,source:ADVISORY_SOURCE,dashboard:ADVISORY_DASHBOARD,servedAt:new Date(now()).toISOString(),interpretation:'Official DEP advisories based on rainfall and modeling. Not direct bacterial measurements, observed outfall discharge, or a determination of safety. No advisory does not mean no pathogens.',timeNote:'Issued times are shown literally because the provider API omits a UTC offset. Refresh time is a separate UTC timestamp.'};
  }};
}
