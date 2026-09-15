import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSeries,createNoaaService} from '../src/noaa.mjs';

test('NOAA parser preserves UTC/quality flags and skips empty or invalid readings',()=>{
 const result=parseSeries({data:[{t:'2026-01-01 00:00',v:'1.2',q:'p',f:'1,0,0,0'},{t:'2026-01-01 00:06',v:''},{t:'bad',v:'3'}]});
 assert.equal(result.length,1);assert.equal(result[0].time,'2026-01-01T00:00:00Z');assert.equal(result[0].quality,'p');assert.equal(result[0].flags,'1,0,0,0');
});
test('NOAA errors remain errors, not empty valid observations',()=>{assert.throws(()=>parseSeries({error:{message:'No data'}}),/No data/);});
test('feed cache coalesces concurrent requests; outage retains last observation as stale',async()=>{
 let clock=Date.parse('2026-01-01T00:06:00Z'),calls=0,offline=false;
 const service=createNoaaService({now:()=>clock,fetchImpl:async url=>{calls++;if(offline)throw new Error('offline');return{ok:true,json:async()=>url.includes('product=predictions')?{predictions:[{t:'2026-01-01 00:06',v:'1.1'}]}:{data:[{t:'2026-01-01 00:06',v:'1.2',q:'p'}]}};}});
 const [a,b]=await Promise.all([service.read(),service.read()]);assert.equal(calls,2);assert.equal(a.status,'live');assert.equal(b.latest.value,1.2);
 await service.read();assert.equal(calls,2);
 clock+=6*60_000;offline=true;const c=await service.read();assert.equal(c.status,'stale');assert.equal(c.latest.value,1.2);assert.ok(c.observationError);
});
test('an initial NOAA outage produces unavailable status with no invented numeric value',async()=>{
 const service=createNoaaService({fetchImpl:async()=>{throw new Error('offline');}});const r=await service.read();assert.equal(r.status,'unavailable');assert.equal(r.latest,null);assert.deepEqual(r.observations,[]);
});
test('old observations cannot be labeled live even after a successful fetch',async()=>{
 const service=createNoaaService({now:()=>Date.parse('2026-01-01T02:00:00Z'),fetchImpl:async url=>({ok:true,json:async()=>url.includes('product=predictions')?{predictions:[]}:{data:[{t:'2026-01-01 00:00',v:'1'}]}})});
 assert.equal((await service.read()).status,'stale');
});
