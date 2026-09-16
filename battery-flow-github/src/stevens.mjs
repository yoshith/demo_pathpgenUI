import {validateField} from '../public/imports.js';
import {readJsonBounded} from './dep.mjs';
export const STEVENS_PAGE='https://hudson.dl.stevens-tech.edu/maritimeforecast/maincontrol.shtml';
export function validateStevensUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!['stevens.edu','stevens-tech.edu'].some(domain=>url.hostname===domain||url.hostname.endsWith(`.${domain}`)))throw new Error('Use an HTTPS endpoint on a Stevens domain without embedded credentials.');
  return url;
}
export function createStevensService({fetchImpl=fetch,now=()=>Date.now(),fieldUrl=process.env.SECOM_FIELD_URL||process.env.STEVENS_FIELD_URL||''}={}){
  let cache=null,pending=null,nextAttempt=0;
  const base={provider:'Stevens sECOM / NYHOPS',sourcePage:STEVENS_PAGE,requirement:'A provider-approved numerical velocity JSON endpoint or model output is required. Public forecast graphics cannot drive numerical transport.',accessCheckedOn:'2026-09-16',accessFinding:'The published PRESENT/data.shtml page returned HTTP 403 and the published Colossus THREDDS catalog returned HTTP 502 during integration; no Stevens numerical field was downloaded.'};
  function result(){
    if(!fieldUrl)return {...base,status:'not_configured',field:null,message:'Stevens sECOM numerical velocities are not connected. Ask the model team for an accessible feed or output file.'};
    if(!cache?.field)return {...base,status:'unavailable',field:null,message:cache?.error||'No numerical field available.'};
    const start=Date.parse(cache.field.times[0]),end=Date.parse(cache.field.times.at(-1));
    const status=cache.error?'stale':end<now()?'historical':start>now()?'future':'available';
    return {...base,status,field:cache.field,retrievedAt:cache.retrievedAt,validFrom:cache.field.times[0],validThrough:cache.field.times.at(-1),message:cache.error||'Configured provider-declared sECOM field loaded from Stevens. This is model output, not observed bacteria; accuracy has not been established by this application.'};
  }
  async function refresh(){
    try{
      const url=validateStevensUrl(fieldUrl);
      const raw=await readJsonBounded(await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}}),12*1024*1024);
      if(raw.modelFamily!=='sECOM'||typeof raw.provenance!=='string'||!raw.provenance.trim())throw new Error('The feed must declare modelFamily sECOM and provide model provenance.');
      const field=validateField(raw);
      cache={field,retrievedAt:new Date(now()).toISOString(),error:null};nextAttempt=now()+30*60_000;
    }catch(error){cache={...cache,error:`Stevens numerical feed unavailable: ${error.message}`};nextAttempt=now()+5*60_000;}
  }
  return{async read(){if(fieldUrl&&now()>=nextAttempt){if(!pending)pending=refresh().finally(()=>pending=null);await pending;}return result();}};
}
