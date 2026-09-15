import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, modelVelocity, DEFAULT_SOURCE } from '../public/model.js';
import { parseSamples, validateField } from '../public/imports.js';

const config={source:DEFAULT_SOURCE,speed:0,diffusion:0,halfLife:1,phase:'outbound',releaseMinutes:0,target:'test'};
const field=()=>({schemaVersion:1,kind:'hydrodynamic-field',name:'test',crs:'EPSG:4326',velocityUnits:'m/s',times:['2026-01-01T00:00:00Z','2026-01-01T01:00:00Z'],grid:{longitude:[-74.04,-74.02],latitude:[40.68,40.70],wetMask:[1,1,1,1]},u:[[0,2,0,2],[2,4,2,4]],v:[[0,0,2,2],[2,2,4,4]]});
test('zero flow/dispersion retains position; one-hour half-life halves total relative mass',()=>{
 const result=simulate(config),frame=result.frames.find(f=>f.seconds===3600);
 assert.ok(Math.abs(frame.massFraction-.5)<1e-10);
 assert.ok(frame.particles.every(p=>p.longitude===DEFAULT_SOURCE.longitude&&p.latitude===DEFAULT_SOURCE.latitude));
 assert.equal(result.frames.at(-1).seconds,21600);
});
test('seeded stochastic transport is repeatable and released mass never exceeds planned mass',()=>{
 const a=simulate({...config,speed:.25,diffusion:2,releaseMinutes:60,halfLife:12});
 const b=simulate({...config,speed:.25,diffusion:2,releaseMinutes:60,halfLife:12});
 assert.deepEqual(a.frames,b.frames);
 assert.ok(a.frames.every(f=>f.massFraction>=0&&f.massFraction<=1+1e-9));
});
test('space/time interpolation respects components and does not extrapolate',()=>{
 const f=validateField(field()),v=modelVelocity(f,-74.03,40.69,1800);
 assert.ok(Math.abs(v.u-2)<1e-9);assert.ok(Math.abs(v.v-2)<1e-9);
 assert.equal(modelVelocity(f,-74.03,40.69,3601),null);
 assert.equal(modelVelocity(f,-74.05,40.69,1800),null);
});
test('dry interpolation corners are excluded',()=>{const f=field();f.grid.wetMask[0]=0;assert.equal(modelVelocity(validateField(f),-74.03,40.69,0),null);});
test('velocity import rejects unknown units, nonnumeric fields and reversed times',()=>{
 let f=field();f.velocityUnits='cm/s';assert.throws(()=>validateField(f),/m\/s/);
 f=field();f.u[0][0]=null;assert.throws(()=>validateField(f),/finite/);
 f=field();f.times.reverse();assert.throws(()=>validateField(f),/increasing/);
});
test('uploaded validation claims cannot change the application validation status',()=>{const f=field();f.validationStatus='certified';assert.match(validateField(f).validationStatus,/Not verified/);});
const header='id,latitude,longitude,collected_at,target,value,unit,qualifier,method\n';
test('sample import preserves detection limits, quoted commas, units and UTC timestamp',()=>{
 const rows=parseSamples(header+'x,40.70,-74.025,2026-01-01T12:00:00Z,"Enterococcus, indicator",12,MPN/100 mL,<,test\n');
 assert.equal(rows[0].value,12);assert.equal(rows[0].qualifier,'<');assert.equal(rows[0].target,'Enterococcus, indicator');assert.equal(rows[0].unit,'MPN/100 mL');
});
test('missing lab value is not silently converted to zero; timestamps and coordinates are checked',()=>{
 assert.throws(()=>parseSamples(header+'x,40.70,-74.025,2026-01-01T12:00:00Z,Enterococcus,,MPN/100 mL,=,test'),/nonnegative/);
 assert.throws(()=>parseSamples(header+'x,40.70,-74.025,2026-01-01 12:00,Enterococcus,0,MPN/100 mL,=,test'),/timestamp/);
 assert.throws(()=>parseSamples(header+'x,45,-74.025,2026-01-01T12:00:00Z,Enterococcus,0,MPN/100 mL,=,test'),/outside/);
});
