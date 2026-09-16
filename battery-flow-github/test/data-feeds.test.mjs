import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {locate,parseResult,normalizeDep,createDepService,readJsonBounded} from '../src/dep.mjs';
import {normalizeOutfalls,normalizeAdvisories,createSewerService,createAdvisoryService} from '../src/sewers.mjs';
import {createStevensService,validateStevensUrl} from '../src/stevens.mjs';
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const coordinate={sampling_location:'N5',sample_date:'2022-11-02T00:00:00',lat:'40.70488',long:'-74.02344'};
const sample={sampling_location:'N5',sample_date:'2025-12-01T00:00:00',sample_time:'9:51',top_enterococci_bacteria_cells_100ml:'22',top_fecal_coliform_bacteria_cells_100ml:'1',fecal_coliform_top_sample_less_than_or_greater_than_result:'<'};

test('DEP preserves detection bounds and opaque provider flags; missing values never become zero',()=>{
 assert.equal(parseResult('', '<'),null);assert.equal(parseResult(null),null);assert.equal(parseResult('not measured'),null);
 assert.equal(parseResult('0').value,0);assert.equal(parseResult('1','<').qualifier,'<');assert.equal(parseResult('> 2400').qualifier,'>');
 assert.equal(parseResult('12','E').providerFlag,'E');assert.equal(parseResult('-1'),null);
});
test('DEP only repairs coordinate columns when they resolve inside the NYC domain',()=>{
 const swapped=locate({...coordinate,lat:'-74.02344',long:'40.70488'});
 assert.equal(swapped.latitude,40.70488);assert.equal(swapped.coordinateColumnsSwapped,true);
 assert.equal(locate({...coordinate,lat:'0',long:'0'}),null);assert.equal(locate({...coordinate,lat:'',long:''}),null);
});
test('latest valid indicator values retain sample time, native units, and dated historical location',()=>{
 const newer={...sample,sample_date:'2025-12-02T00:00:00',top_enterococci_bacteria_cells_100ml:'',top_fecal_coliform_bacteria_cells_100ml:'3',fecal_coliform_top_sample_less_than_or_greater_than_result:''};
 const d=normalizeDep([sample,newer],[coordinate]);
 const e=d.samples.find(s=>s.target==='Enterococci'),f=d.samples.find(s=>s.target==='Fecal coliform');
 assert.equal(e.collectedDate,'2025-12-01');assert.equal(f.collectedDate,'2025-12-02');assert.equal(e.coordinateRecordDate,'2022-11-02');
 assert.equal(e.locationBasis,'historical_station_record');assert.equal(e.unit,'cells/100 mL');assert.equal(e.collectedTimeReported,'9:51');assert.match(e.timeZone,/Not specified/);
 assert.equal(normalizeDep([sample],[]).samples.length,0);
});
test('DEP coalesces requests and an outage retains authentic data with its original retrieval date',async()=>{
 let now=Date.parse('2026-09-16T00:00:00Z'),calls=0,fail=false;
 const service=createDepService({now:()=>now,fetchImpl:async url=>{calls++;if(fail)throw new Error('offline');return response(String(url).includes('5000')?[coordinate]:[sample]);}});
 const [a,b]=await Promise.all([service.read(),service.read()]);assert.equal(calls,2);assert.deepEqual(a.samples,b.samples);
 now+=7*3600_000;fail=true;const c=await service.read();assert.equal(c.sourceStatus,'cached');assert.equal(c.retrievedAt,a.retrievedAt);assert.equal(c.samples[0].collectedDate,'2025-12-01');
});
test('packaged DEP fallback is explicitly historical when the source is unavailable',async()=>{
 const d=await createDepService({fetchImpl:async()=>{throw new Error('offline');}}).read();
 assert.equal(d.sourceStatus,'saved_snapshot');assert.ok(d.samples.length>0);assert.match(d.measurementMode,/not live/);
});
test('bounded source reads reject oversized responses and HTTP errors',async()=>{
 await assert.rejects(()=>readJsonBounded(response({long:'1234567890'}),5),/too large/);
 await assert.rejects(()=>readJsonBounded(new Response('forbidden',{status:403})),/403/);
});

const outfall={features:[{attributes:{OBJECTID:1,OUTFALL_NUMBER:'TEST-001',SPDES_PERMIT_NUMBER:'TEST',RECEIVING_WATERBODY_NAME:'Test harbor'},geometry:{x:-74.02,y:40.70}}]};
test('outfall inventory creates no inferred discharge or microbial load and rejects truncated results',()=>{
 const d=normalizeOutfalls(outfall);assert.equal(d.features[0].properties.dischargeRate,null);assert.equal(d.features[0].properties.pathogenLoad,null);assert.match(d.features[0].properties.dischargeStatus,/Unknown/);
 assert.throws(()=>normalizeOutfalls({...outfall,exceededTransferLimit:true}),/Incomplete/);
});
test('outfall outage falls back to the actual packaged inventory with source date',async()=>{
 const d=await createSewerService({fetchImpl:async()=>{throw new Error('offline');}}).read();assert.equal(d.sourceStatus,'saved_snapshot');assert.ok(d.count>0);assert.ok(d.sourceDataEditedAt);assert.ok(d.features.every(f=>f.properties.dischargeRate===null));
});
const advisory={waterbody:{id:19,name:'Upper New York Bay',class:'I'},occurredOn:'2026-09-16T12:00:00',duration:0,message:'No Advisory',volume:0};
test('advisory records preserve provider time and do not interpret volume as measured discharge',()=>{
 const [d]=normalizeAdvisories([advisory],'CSO');assert.equal(d.providerAdvisory,false);assert.equal(d.occurredOnReported,advisory.occurredOn);assert.match(d.volumeUnit,/Not specified/);
 assert.throws(()=>normalizeAdvisories([{...advisory,duration:null}],'CSO'),/Unrecognized/);
 assert.throws(()=>normalizeAdvisories([],'WQ'),/Invalid/);
});
test('advisory outages never become no-advisory observations',async()=>{
 let now=Date.parse('2026-09-16T13:00:00Z'),fail=false;
 const service=createAdvisoryService({now:()=>now,fetchImpl:async()=>{if(fail)throw new Error('offline');return response([advisory]);}});
 const good=await service.read();assert.equal(good.status,'retrieved');assert.equal(good.records.length,2);
 fail=true;now+=11*60_000;const old=await service.read();assert.equal(old.status,'stale');assert.equal(old.retrievedAt,good.retrievedAt);
 const absent=await createAdvisoryService({fetchImpl:async()=>{throw new Error('offline');}}).read();assert.equal(absent.status,'unavailable');assert.deepEqual(absent.records,[]);
});
test('old advisory dates are not presented as current even after successful retrieval',async()=>{
 const d=await createAdvisoryService({now:()=>Date.parse('2026-09-20T12:00:00Z'),fetchImpl:async()=>response([advisory])}).read();assert.equal(d.status,'outdated');
});
test('bundled advisory boundaries match provider waterbody identifiers and contain no advisory state',async()=>{
 const d=JSON.parse(await readFile(new URL('../public/waterbody-boundaries.geojson',import.meta.url)));
 assert.equal(d.features.find(f=>f.properties.waterbodyId===19).properties.name,'Upper New York Bay');
 assert.ok(d.features.every(f=>!('Advisory' in f.properties)));
});

const field=()=>({schemaVersion:1,kind:'hydrodynamic-field',name:'Synthetic unit-test field',modelFamily:'sECOM',provenance:'Synthetic test fixture; not downloaded from Stevens',crs:'EPSG:4326',velocityUnits:'m/s',times:['2026-09-16T12:00:00Z','2026-09-16T14:00:00Z'],grid:{longitude:[-74.04,-74.02],latitude:[40.68,40.70],wetMask:[1,1,1,1]},u:[[.2,.2,.2,.2],[.2,.2,.2,.2]],v:[[0,0,0,0],[0,0,0,0]]});
test('unconfigured sECOM makes no request and has no invented numerical field',async()=>{
 let calls=0;const d=await createStevensService({fieldUrl:'',fetchImpl:async()=>{calls++;throw new Error('must not fetch');}}).read();assert.equal(calls,0);assert.equal(d.status,'not_configured');assert.equal(d.field,null);
});
test('sECOM configuration accepts only the documented Stevens HTTPS endpoints',()=>{
 assert.equal(validateStevensUrl('https://hudson.dl.stevens-tech.edu/example.json').hostname,'hudson.dl.stevens-tech.edu');
 for(const u of ['http://hudson.dl.stevens-tech.edu/example.json','https://stevens.edu.evil.invalid/file','https://user:pass@stevens.edu/file','https://127.0.0.1/file'])assert.throws(()=>validateStevensUrl(u));
});
test('configured model time coverage is explicit; provider-declared model remains scientifically unverified',async()=>{
 for(const [when,status] of [['2026-09-16T11:00:00Z','future'],['2026-09-16T13:00:00Z','available'],['2026-09-16T15:00:00Z','historical']]){
  const d=await createStevensService({fieldUrl:'https://stevens.edu/test.json',now:()=>Date.parse(when),fetchImpl:async()=>response(field())}).read();assert.equal(d.status,status);assert.match(d.field.validationStatus,/Not verified/);
 }
});
test('generic or malformed fields are not silently labeled sECOM',async()=>{
 const f=field();delete f.modelFamily;
 const d=await createStevensService({fieldUrl:'https://stevens.edu/test.json',fetchImpl:async()=>response(f)}).read();assert.equal(d.status,'unavailable');assert.equal(d.field,null);assert.match(d.message,/modelFamily/);
});
