import { DEFAULT_SOURCE, velocityAt, plumeBins } from './model.js';
import { validateField, parseSamples } from './imports.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const localTime = (value, options = {}) => new Date(value).toLocaleString('en-US', { timeZone:'America/New_York', month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',...options });
const state = {source:{...DEFAULT_SOURCE},field:null,samples:[],result:null,config:null,frame:18,playing:false,placing:false,requestId:0,noaa:null,fetching:false,mode:'observations',dep:null,stevens:null,loadingDep:false,sewers:null,advisories:null,boundaries:null,fieldOrigin:null,suppressAutoModel:false};
let toastTimer, playbackTimer, lastDraw=0;
function toast(message) { $('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000); }

const map = L.map('map',{zoomControl:false,preferCanvas:true,minZoom:11,maxZoom:17,maxBounds:[[40.58,-74.12],[40.83,-73.85]],maxBoundsViscosity:0.7}).setView([40.701,-74.016],13);
map.attributionControl.setPrefix(false);
const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',subdomains:'abcd',maxZoom:19}).addTo(map);
let tileFailures=0;
tiles.on('tileerror',()=>{if(++tileFailures>3)$('tileError').classList.remove('hidden');});
tiles.on('tileload',()=>{tileFailures=0;$('tileError').classList.add('hidden');});
$('retryTiles').onclick=()=>{tileFailures=0;tiles.redraw();};
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const station=L.marker([40.7006,-74.0142],{icon:L.divIcon({className:'custom-station',html:'<div class="station-marker"></div>',iconSize:[13,13],iconAnchor:[6,6]}),title:'NOAA Battery station 8518750'}).addTo(map);
station.bindTooltip('THE BATTERY · NOAA 8518750',{direction:'right',offset:[12,0]});
station.bindPopup('<strong>The Battery · 8518750</strong><p>NOAA tide gauge. Water-level observations only; no pathogen sensor or current field.</p>');
const release=L.marker([state.source.latitude,state.source.longitude],{icon:L.divIcon({className:'custom-station',html:'<div class="release-marker"></div>',iconSize:[13,13],iconAnchor:[6,6]}),title:'Hypothetical tracer release'}).addTo(map);
release.bindTooltip('HYPOTHETICAL RELEASE',{direction:'left',offset:[-10,0]});
const samplesLayer=L.layerGroup().addTo(map);
const depLayer=L.layerGroup().addTo(map);
const sewerLayer=L.layerGroup().addTo(map);
map.createPane('advisoryPane');map.getPane('advisoryPane').style.zIndex='350';
const advisoryLayer=L.layerGroup().addTo(map);
map.removeLayer(release);

const canvas=L.DomUtil.create('canvas','flow-canvas');
map.getPanes().overlayPane.appendChild(canvas);
const ctx=canvas.getContext('2d');
let size={x:1,y:1};
function resizeCanvas(){size=map.getSize();const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=size.x*ratio;canvas.height=size.y*ratio;canvas.style.width=`${size.x}px`;canvas.style.height=`${size.y}px`;ctx.setTransform(ratio,0,0,ratio,0,0);L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));draw(performance.now());}
map.on('move resize zoomend',resizeCanvas);
new ResizeObserver(()=>{map.invalidateSize();resizeCanvas();}).observe($('map'));

function configFromControls(){
  const halfLife=Number($('halfLife').value);
  if(!Number.isFinite(halfLife)||halfLife<.5||halfLife>120)throw new Error('Choose a half-life from 0.5 to 120 hours.');
  return {source:{...state.source},field:state.field,speed:Number($('speed').value),diffusion:Number($('diffusion').value),halfLife,phase:$('phase').value,releaseMinutes:Number($('releaseMinutes').value),target:$('target').value};
}
const worker=new Worker('/worker.js',{type:'module'});
function setMessage(message,error=false){$('scenarioMessage').textContent=message;$('scenarioMessage').classList.toggle('error',error);}
function runScenario(){
  pause();
  try{const config=configFromControls();state.pendingConfig=config;$('runButton').disabled=true;setMessage('Computing tracer paths…');worker.postMessage({id:++state.requestId,config});}
  catch(error){setMessage(error.message,true);}
}
worker.onmessage=({data})=>{
  if(data.id!==state.requestId)return;
  $('runButton').disabled=false;
  if(data.error){state.result=null;state.config=null;setMessage(data.error,true);$('frameDetails').textContent='No scenario available';draw(performance.now());return;}
  state.result=data.result;state.config=state.pendingConfig;
  state.frame=Math.min(state.frame,data.result.frames.length-1);
  $('timeSlider').max=data.result.frames.length-1;$('timeSlider').value=state.frame;
  $('timeTicks').innerHTML=Array.from({length:7},(_,i)=>`<span>${i===0?'Release':`+${(data.result.duration/3600*i/6).toFixed(1).replace('.0','')} h`}</span>`).join('');
  setMessage('Scenario ready · illustrative microbial parameters');renderFrame();
};
worker.onerror=()=>{$('runButton').disabled=false;setMessage('The simulation could not run. Refresh and try again.',true);};

function renderFrame(){
  if(!state.result)return;
  const frame=state.result.frames[state.frame];
  const h=Math.floor(frame.seconds/3600),m=Math.floor(frame.seconds%3600/60);
  $('timeLabel').innerHTML=`+${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} <small>AFTER RELEASE</small>`;
  $('timeSlider').value=state.frame;
  $('frameDetails').textContent=`${frame.particles.length} tracer particles · ${(frame.massFraction*100).toFixed(1)}% of total planned release mass active`;
  $('timeContext').textContent=state.config.field?`Model time: ${localTime(Date.parse(state.config.field.times[0])+frame.seconds*1000)}`:'Elapsed scenario time, not a real-time pathogen forecast';
  draw(performance.now());
}

function draw(now){
  ctx.clearRect(0,0,size.x,size.y);
  const monitoring=state.mode==='observations';
  if(!monitoring&&(!state.result||!state.config))return;
  if(monitoring&&!state.field)return;
  const flowConfig=monitoring?{field:state.field}:state.config;
  const frame=monitoring?{seconds:(Date.now()-Date.parse(state.field.times[0]))/1000,particles:[]}:state.result.frames[state.frame];
  if(monitoring&&(frame.seconds<0||Date.now()>Date.parse(state.field.times.at(-1))))return;
  if(!monitoring&&$('plumeToggle').checked){
    const bins=plumeBins(frame);
    const meterPx=Math.abs(map.latLngToContainerPoint([40.701,-74.024]).y-map.latLngToContainerPoint([40.700,-74.024]).y)/111.32;
    const radius=Math.max(4,Math.min(150,125*meterPx));
    for(const bin of bins){
      const point=map.latLngToContainerPoint([bin.latitude,bin.longitude]);
      const intensity=Math.min(1,bin.mass/.055);
      const c=intensity>.60?'249,165,97':intensity>.22?'207,209,127':'90,193,180';
      const gradient=ctx.createRadialGradient(point.x,point.y,0,point.x,point.y,radius);
      gradient.addColorStop(0,`rgba(${c},${Math.min(.8,.15+intensity*.65)})`);gradient.addColorStop(.35,`rgba(${c},${intensity*.45})`);gradient.addColorStop(1,`rgba(${c},0)`);
      ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='rgba(235,218,163,.63)';
    for(const p of frame.particles){const point=map.latLngToContainerPoint([p.latitude,p.longitude]);ctx.beginPath();ctx.arc(point.x,point.y,1.1,0,Math.PI*2);ctx.fill();}
  }
  if($('arrowsToggle').checked){
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress=reduced?0:(now%5000)/5000;
    for(let y=32;y<size.y;y+=59)for(let x=32;x<size.x;x+=65){
      const ll=map.containerPointToLatLng([x,y]);const v=velocityAt(flowConfig,ll.lng,ll.lat,frame.seconds);
      if(!v)continue;const speed=Math.hypot(v.u,v.v);if(speed<.001)continue;
      const dx=v.u/speed,dy=-v.v/speed,length=10+Math.min(speed,.8)*30;
      const offset=progress*length;
      const ax=x+dx*offset,ay=y+dy*offset,bx=ax+dx*length,by=ay+dy*length;
      ctx.strokeStyle='rgba(114,194,199,.48)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
      ctx.strokeStyle='rgba(153,225,217,.76)';ctx.beginPath();ctx.moveTo(bx-dx*4-dy*3,by-dy*4+dx*3);ctx.lineTo(bx,by);ctx.lineTo(bx-dx*4+dy*3,by-dy*4-dx*3);ctx.stroke();
    }
  }
}
function animate(now){if(now-lastDraw>100&&!document.hidden){draw(now);lastDraw=now;}requestAnimationFrame(animate);}
requestAnimationFrame(animate);

function pause(){state.playing=false;clearInterval(playbackTimer);$('playButton').textContent='▶';$('playButton').setAttribute('aria-label','Play scenario');}
function play(){if(!state.result)return;state.playing=true;$('playButton').textContent='Ⅱ';$('playButton').setAttribute('aria-label','Pause scenario');if(state.frame>=state.result.frames.length-1)state.frame=0;clearInterval(playbackTimer);playbackTimer=setInterval(()=>{if(state.frame>=state.result.frames.length-1){pause();return;}state.frame++;renderFrame();},1000/Number($('playRate').value));}
$('playButton').onclick=()=>state.playing?pause():play();
$('playRate').onchange=()=>{if(state.playing)play();};
$('timeSlider').oninput=()=>{pause();state.frame=Number($('timeSlider').value);renderFrame();};
$('runButton').onclick=runScenario;
for(const id of ['speed','diffusion'])$(id).oninput=()=>{$(`${id}Value`).textContent=`${Number($(id).value).toFixed(id==='speed'?2:1).replace(id==='diffusion'?/\.0$/:/$^/,'')} ${id==='speed'?'m/s':'m²/s'}`;setMessage('Parameters changed · update scenario to apply');};
for(const id of ['phase','target','halfLife','releaseMinutes'])$(id).onchange=()=>setMessage('Parameters changed · update scenario to apply');
for(const id of ['arrowsToggle','plumeToggle'])$(id).onchange=()=>draw(performance.now());
$('samplesToggle').onchange=()=>{$('samplesToggle').checked?samplesLayer.addTo(map):map.removeLayer(samplesLayer);};
$('recenter').onclick=()=>map.setView([40.701,-74.016],13);
$('zoomIn').onclick=()=>map.zoomIn();$('zoomOut').onclick=()=>map.zoomOut();

function placement(on){state.placing=on;$('placeSource').textContent=on?'Cancel':'Move';document.querySelector('.map-area').classList.toggle('placing',on);$('placementHelp').textContent=on?'Click a water location inside the available flow domain.':'A test location in the harbor, not a documented outfall.';if(on)toast('Click the map to place the hypothetical release.');}
$('placeSource').onclick=()=>placement(!state.placing);
function updateSource(){release.setLatLng([state.source.latitude,state.source.longitude]);$('sourceCoordinates').textContent=`${state.source.latitude.toFixed(4)}, ${state.source.longitude.toFixed(4)}`;}
map.on('click',event=>{
  if(!state.placing)return;
  const candidate={latitude:event.latlng.lat,longitude:event.latlng.lng};
  let config;try{config=configFromControls();}catch(e){toast(e.message);return;}
  if(!velocityAt(config,candidate.longitude,candidate.latitude,0)){toast('That point is outside the available water-flow domain. Choose another location.');return;}
  state.source=candidate;updateSource();placement(false);runScenario();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')placement(false);});

function showInfo(){$('infoDialog').showModal();}
$('methodButton').onclick=showInfo;$('dataInfoButton').onclick=showInfo;
$('importButton').onclick=()=>{$('importMessage').textContent='';$('importDialog').showModal();};
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>button.closest('dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}}));

function syncModelUI(){
  const imported=Boolean(state.field);
  $('modelBadge').textContent=imported?'IMPORTED':'DEMO';
  $('mapMode').textContent=imported?'IMPORTED FLOW · ILLUSTRATIVE TRACER':'ILLUSTRATIVE TRANSPORT';
  $('mapSubtitle').textContent=imported?state.field.name:'Explore a hypothetical release near the Battery.';
  $('truthText').textContent=imported?'NOAA water levels · Imported flow · Uncalibrated tracer simulation':'Live water levels · Illustrative transport · No live pathogen measurements';
  $('modelNote').innerHTML=imported?'Imported flow field<br><strong>Validation not established by this app</strong>':'Demonstration flow field<br><strong>No measured pathogen locations</strong>';
  for(const id of ['phase','speed'])$(id).disabled=imported;
  $('clearModel').classList.toggle('hidden',!imported);
  $('clearSamples').classList.toggle('hidden',!state.samples.length);
  $('importSummary').textContent=`${imported?state.field.name:'No flow model loaded'} · ${state.samples.length} sample${state.samples.length===1?'':'s'} in this tab.`;
  if(state.mode==='observations'){
    $('truthText').textContent='NOAA water levels · Published DEP lab samples · No live pathogen detection';
    const flowCoversNow=state.field&&Date.now()>=Date.parse(state.field.times[0])&&Date.now()<=Date.parse(state.field.times.at(-1));
    $('mapMode').textContent=flowCoversNow?'LAB OBSERVATIONS + MODELED FLOW':'PUBLISHED LABORATORY OBSERVATIONS';
    $('mapSubtitle').textContent=state.dep?.samples?.length?`${state.dep.stationCount} mapped DEP stations · click a point for its collection date.`:(state.dep?'No published samples are available in this area.':'Loading dated NYC DEP indicator samples.');
    $('modelNote').innerHTML=flowCoversNow?'Numerical model flow<br><strong>Dated lab data; no pathogen forecast</strong>':state.field?'Flow file is outside the current time<br><strong>Use scenario playback to explore it</strong>':'Dated indicator measurements<br><strong>No live pathogen map</strong>';
  }
}
function importedMessage(message,error=false){$('importMessage').textContent=message;$('importMessage').classList.toggle('error',error);}
$('modelFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>12*1024*1024)throw new Error('Velocity JSON must be 12 MB or smaller.');
    const field=validateField(JSON.parse(await file.text()));
    const config={...configFromControls(),field};
    let source=state.source;
    if(!velocityAt(config,source.longitude,source.latitude,0)){
      let found=false;
      for(let j=0;j<field.grid.latitude.length-1&&!found;j++)for(let i=0;i<field.grid.longitude.length-1&&!found;i++){
        const lon=(field.grid.longitude[i]+field.grid.longitude[i+1])/2,lat=(field.grid.latitude[j]+field.grid.latitude[j+1])/2;
        if(velocityAt(config,lon,lat,0)){source={latitude:lat,longitude:lon};found=true;}
      }
      if(!found)throw new Error('No contiguous wet grid cell is available for interpolation.');
    }
    state.field=field;state.fieldOrigin='manual';state.source=source;updateSource();syncModelUI();if(state.mode==='scenario')runScenario();
    map.fitBounds([[field.grid.latitude[0],field.grid.longitude[0]],[field.grid.latitude.at(-1),field.grid.longitude.at(-1)]],{padding:[40,40],maxZoom:15});
    importedMessage(`Loaded ${field.name}. These velocities are available in the map and optional scenario. The app has not verified model accuracy.`);
  }catch(error){importedMessage(error.message,true);}finally{event.target.value='';}
};
function drawSamples(){
  samplesLayer.clearLayers();$('sampleCount').textContent=state.samples.length;
  for(const sample of state.samples){
    const marker=L.circleMarker([sample.latitude,sample.longitude],{radius:6,color:'#b9cdff',weight:2,fillColor:'#6589ca',fillOpacity:.8});
    marker.bindPopup(`<strong>${escape(sample.target)}</strong><p>${escape(sample.qualifier)} ${escape(sample.value)} ${escape(sample.unit)}</p><small>${escape(localTime(sample.collected_at))}<br>Sample: ${escape(sample.id)}<br>Method: ${escape(sample.method)}<br>User-imported result; not verified by this app.</small>`).addTo(samplesLayer);
  }
  syncModelUI();
}
$('sampleFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>2*1024*1024)throw new Error('Sample CSV must be 2 MB or smaller.');state.samples=parseSamples(await file.text());drawSamples();importedMessage(`Loaded ${state.samples.length} sample points. Collection times, units, and detection-limit qualifiers are preserved. These do not calibrate the plume.`);}
  catch(error){importedMessage(error.message,true);}finally{event.target.value='';}
};
$('clearModel').onclick=()=>{state.field=null;state.fieldOrigin=null;state.suppressAutoModel=true;state.source={...DEFAULT_SOURCE};updateSource();syncModelUI();if(state.mode==='scenario')runScenario();};
$('clearSamples').onclick=()=>{state.samples=[];drawSamples();toast('Sample points cleared from this tab.');};

function renderChart(data){
  const now=Date.now(),start=now-12*3600_000,end=now+12*3600_000;
  const obs=data.observations.filter(p=>Date.parse(p.time)>=start&&Date.parse(p.time)<=end),pred=data.predictions.filter(p=>Date.parse(p.time)>=start&&Date.parse(p.time)<=end);
  const all=[...obs,...pred];
  if(!all.length){$('tideChart').textContent='No chart data available';return;}
  const values=all.map(p=>p.value),low=Math.min(...values)-.12,high=Math.max(...values)+.12;
  const x=t=>((Date.parse(t)-start)/(end-start)*210+3),y=v=>56-(v-low)/(high-low)*48;
  const path=series=>series.map((p,i)=>`${i?'L':'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const observedPaths=[];let segment=[];
  for(const point of obs){if(segment.length&&Date.parse(point.time)-Date.parse(segment.at(-1).time)>15*60_000){observedPaths.push(segment);segment=[];}segment.push(point);}if(segment.length)observedPaths.push(segment);
  $('tideChart').innerHTML=`<svg viewBox="0 0 216 70" aria-hidden="true"><path d="M3 56H213 M3 8H213" stroke="#253c48" stroke-width=".6"/><path d="M108 3V58" stroke="#415463" stroke-dasharray="2 3"/><path d="${path(pred)}" fill="none" stroke="#7b95aa" stroke-width="1.2" stroke-dasharray="3 3"/>${observedPaths.map(s=>`<path d="${path(s)}" fill="none" stroke="#61e8ce" stroke-width="1.8"/>`).join('')}${obs.map(p=>`<circle cx="${x(p.time)}" cy="${y(p.value)}" r="1.4" fill="#61e8ce"/>`).join('')}<text x="3" y="69" fill="#849baa" font-size="11">−12 h</text><text x="101" y="69" fill="#b2c5cf" font-size="11">Now</text><text x="192" y="69" fill="#849baa" font-size="11">+12 h</text></svg>`;
}
async function refreshNoaa(){
  if(state.fetching)return;state.fetching=true;$('refreshNoaa').disabled=true;
  try{
    const response=await fetch('/api/station',{signal:AbortSignal.timeout(18000)});if(!response.ok)throw new Error('Station service unavailable');
    const data=await response.json();state.noaa=data;
    const labels={live:'NOAA gauge connected',stale:'NOAA observations stale',unavailable:'NOAA unavailable'};
    $('headerStatus').className=`status ${data.status}`;$('headerStatus').innerHTML=`<i></i>${labels[data.status]||'NOAA status unknown'}`;
    $('gaugeDot').className=data.status;
    $('waterLevel').textContent=data.latest?data.latest.value.toFixed(3):'—';
    $('gaugeStatus').textContent=data.latest?`${localTime(data.latest.time)} · ${data.latest.quality==='p'?'preliminary':data.latest.quality==='v'?'verified':'quality unverified'}${data.status==='stale'?' · stale':''}${data.latest.flags?.split(',').some(v=>Number(v)!==0)?' · NOAA flags present':''}`:'No recent observation available';
    renderChart(data);
    station.setPopupContent(`<strong>The Battery · 8518750</strong><p>${data.latest?`${escape(data.latest.value.toFixed(3))} m MLLW<br>${escape(localTime(data.latest.time))}`:'No recent observation'}</p><small>${escape(data.status)} · Water levels only, no pathogen measurement.<br>NOAA quality flags: ${escape(data.latest?.flags||'not supplied')}</small>`);
  }catch(error){$('headerStatus').className='status stale';$('headerStatus').innerHTML='<i></i>NOAA connection unavailable';$('gaugeDot').className='stale';$('gaugeStatus').textContent=state.noaa?.latest?`Last known: ${localTime(state.noaa.latest.time)} · refresh failed`:'No observation available · retry to reconnect';}
  finally{state.fetching=false;$('refreshNoaa').disabled=false;}
}
$('refreshNoaa').onclick=refreshNoaa;
setInterval(refreshNoaa,5*60_000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else refreshNoaa();});

$('exportButton').onclick=()=>{
  if(!state.result){toast('Run a scenario before exporting.');return;}
  const frame=state.result.frames[state.frame];
  const exportData={application:'Battery Flow',version:'0.2.0',exportedAt:new Date().toISOString(),scientificStatus:'Uncalibrated research scenario; not a live pathogen forecast',target:state.config.target,scenarioParameters:{...state.config,field:undefined},flowProvenance:state.config.field?{name:state.config.field.name,provenance:state.config.field.provenance,validationStatus:state.config.field.validationStatus,modelStart:state.config.field.times[0]}:{name:'Schematic demonstration flow; independent of NOAA gauge'},elapsedSeconds:frame.seconds,method:state.result.method,boundaryHolds:state.result.boundaryHolds,noaaSnapshot:state.noaa?{station:state.noaa.station,status:state.noaa.status,latest:state.noaa.latest,sourceUrls:state.noaa.sourceUrls}:null,importedSamples:state.samples,particles:{type:'FeatureCollection',features:frame.particles.map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.longitude,p.latitude]},properties:{relativeMass:p.weight}}))},limitations:['Normalized tracer mass, not measured or calibrated concentration.','Imported sample results are not verified by this app.','No uncertainty coverage guarantee, safety classification, or pluvial inundation model.','Grid boundary handling is illustrative; validate numerical transport before scientific use.']};
  const url=URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`battery-flow-scenario-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Scenario and provenance exported.');
};

function setMode(mode){
  state.mode=mode;pause();placement(false);
  const observing=mode==='observations';
  $('observationsView').classList.toggle('active',observing);$('observationsView').setAttribute('aria-pressed',String(observing));
  $('scenarioView').classList.toggle('active',!observing);$('scenarioView').setAttribute('aria-pressed',String(!observing));
  $('scenarioControls').classList.toggle('hidden',observing);$('observationControls').classList.toggle('hidden',!observing);
  $('scenarioTimeline').classList.toggle('hidden',observing);$('observationBar').classList.toggle('hidden',!observing);
  $('mapHeadline').textContent=observing?'See the measurements.':'Follow the flow.';
  $('mapLegend').innerHTML=observing?'<span class="legend-title">PUBLISHED LAB SAMPLES</span><div class="observed-legend"><span><i class="observed-marker"></i>Lab sample station</span><span><i class="layer-outfall"></i>CSO location · status unknown</span><span><i class="layer-advisory"></i>DEP advisory area</span></div><p>Click a point for values and dates.</p>':'<span class="legend-title">RELATIVE TRACER DENSITY</span><div class="color-scale"></div><div class="legend-labels"><span>Lower</span><span>Higher</span></div><p>Fixed scale · no concentration units</p>';
  observing?map.removeLayer(release):release.addTo(map);
  syncModelUI();if(!observing)runScenario();draw(performance.now());
}
$('observationsView').onclick=()=>setMode('observations');$('scenarioView').onclick=()=>setMode('scenario');

function displayedDep(){return(state.dep?.samples||[]).filter(s=>($('depTarget').value==='all'||s.target===$('depTarget').value)&&($('depLayer').value==='all'||s.layer===$('depLayer').value));}
function resultText(sample){return`${sample.qualifier==='='?'':sample.qualifier+' '}${sample.value} ${sample.unit}${sample.providerFlag&&!['<','>','<=','>=','='].includes(sample.providerFlag)?` [provider flag ${sample.providerFlag}]`:''}`;}
function resultDate(sample){return `${sample.collectedDate}${sample.collectedTimeReported?' '+sample.collectedTimeReported:''} (as reported)`;}
function drawDep(){
  depLayer.clearLayers();const samples=displayedDep(),stations=new Map();
  for(const sample of samples){if(!stations.has(sample.station))stations.set(sample.station,[]);stations.get(sample.station).push(sample);}
  for(const [name,results] of stations){
    const first=results[0];
    const content=`<strong>NYC DEP · ${escape(name)}</strong><small>Published laboratory observations; not current conditions</small>${results.map(s=>`<div class="dep-popup-result"><b>${escape(s.target)} · ${escape(s.layer)}</b><span>${escape(resultText(s))}</span><small>Collected ${escape(resultDate(s))}${s.depthFtReported?`<br>Sample depth: ${escape(s.depthFtReported)} ft`:''}</small></div>`).join('')}<small>Station coordinates from ${escape(first.coordinateRecordDate||'source record')}${first.locationBasis==='historical_station_record'?' (historical station lookup)':''}${first.coordinateColumnsSwapped?'; reversed provider coordinate columns corrected':''}.<br>Assay and collection timezone are not specified per result. Flags and units are retained as published.</small><p><a href="${escape(first.source)}" target="_blank" rel="noopener noreferrer">Original DEP dataset ↗</a></p>`;
    L.circleMarker([first.latitude,first.longitude],{radius:7,color:'#c9fff0',weight:2,fillColor:'#42bba0',fillOpacity:.9}).bindTooltip(`DEP ${escape(name)} · ${escape(results[0].collectedDate)}`).bindPopup(content,{maxWidth:320}).addTo(depLayer);
  }
  if(!$('depToggle').checked)map.removeLayer(depLayer);
  const sorted=[...stations.values()].sort((a,b)=>map.distance([40.7006,-74.0142],[a[0].latitude,a[0].longitude])-map.distance([40.7006,-74.0142],[b[0].latitude,b[0].longitude]));
  if(sorted.length){
    const nearest=sorted[0],first=nearest[0];
    $('nearestStationLabel').textContent=`NEAREST SHOWN DEP STATION · ${first.station} · ${(map.distance([40.7006,-74.0142],[first.latitude,first.longitude])/1000).toFixed(1)} KM FROM GAUGE`;
    $('nearestReadings').innerHTML=nearest.map(s=>`<div class="observed-reading"><span>${escape(s.target)} · ${escape(s.layer)}</span><strong>${escape(s.qualifier==='='?'':s.qualifier+' ')}${escape(s.value)} <small>${escape(s.unit)}</small></strong><span>${escape(s.collectedDate)}${s.providerFlag&&!['<','>','<=','>=','='].includes(s.providerFlag)?` · provider flag ${escape(s.providerFlag)}`:''}</span></div>`).join('');
    $('observationDateNote').textContent=`${stations.size} stations shown. Historical results are not evidence of present-day concentrations. Location records may predate the samples.`;
  }else{$('nearestStationLabel').textContent='NO MATCHING PUBLISHED SAMPLES';$('nearestReadings').textContent='No records match this indicator/layer selection.';$('observationDateNote').textContent='Missing measurements are not treated as zero.';}
  syncModelUI();
}
async function refreshDep(){
  if(state.loadingDep)return;state.loadingDep=true;$('refreshDep').disabled=true;
  try{
    const response=await fetch('/api/observations',{signal:AbortSignal.timeout(23000)});if(!response.ok)throw new Error('DEP data service unavailable');
    const data=await response.json();state.dep=data;
    const statusLabels={refreshed:'Retrieved from DEP',saved_snapshot:'Saved authentic DEP snapshot',cached:'Last retrieved DEP records',unavailable:'DEP data unavailable'};
    $('depStatus').textContent=`${statusLabels[data.sourceStatus]||'DEP records'} · ${data.samples.length} results at ${data.stationCount} stations. Latest published sample: ${data.latestPublishedSampleDate||'not available'}.${data.error?' Refresh failed; dates remain unchanged.':''}`;
    drawDep();
  }catch(error){$('depStatus').textContent=state.dep?'Refresh failed. Previously retrieved, dated measurements remain visible.':'Published samples could not be loaded. Retry when the connection is available.';if(!state.dep){$('nearestReadings').textContent='No observation data available.';$('mapSubtitle').textContent='No published observations loaded.';}}
  finally{state.loadingDep=false;$('refreshDep').disabled=false;}
}
async function refreshStevens(){
  try{
    const response=await fetch('/api/stevens',{signal:AbortSignal.timeout(23000)});if(!response.ok)throw new Error('Stevens connection status unavailable');
    const data=await response.json();state.stevens=data;
    $('stevensBadge').textContent=({not_configured:'NOT CONNECTED',unavailable:'UNAVAILABLE',historical:'HISTORICAL MODEL',future:'FUTURE MODEL',available:'MODEL AVAILABLE',stale:'STALE MODEL'})[data.status]||'UNKNOWN';
    $('stevensStatus').textContent=data.message;
    if(data.field&&state.fieldOrigin!=='manual'&&!state.suppressAutoModel){state.field=validateField(data.field);state.fieldOrigin='secom';syncModelUI();if(state.mode==='scenario')runScenario();draw(performance.now());}
  }catch(error){$('stevensBadge').textContent='UNAVAILABLE';$('stevensStatus').textContent='Numerical model connection could not be checked. No replacement velocities are invented.';}
}
$('depTarget').onchange=drawDep;$('depLayer').onchange=drawDep;$('refreshDep').onclick=refreshDep;
$('depToggle').onchange=()=>{$('depToggle').checked?depLayer.addTo(map):map.removeLayer(depLayer);};
$('exportObservations').onclick=()=>{
  if(!state.dep?.samples.length){toast('No observations are available to export.');return;}
  const record={application:'Battery Flow',version:'0.2.0',exportedAt:new Date().toISOString(),...state.dep,displayedSamples:displayedDep(),interpretation:'Published historical indicator measurements; not live pathogen detections. Dates, qualifiers, units, source and coordinate provenance are retained.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='battery-dep-observations.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
};
setInterval(refreshDep,30*60_000);setInterval(refreshStevens,30*60_000);
resizeCanvas();updateSource();syncModelUI();refreshNoaa();refreshDep();refreshStevens();

function downloadJson(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function refreshSewers(){
  try{
    const response=await fetch('/api/sewers',{signal:AbortSignal.timeout(23000)});if(!response.ok)throw new Error('Inventory service unavailable');
    const data=await response.json();state.sewers=data;sewerLayer.clearLayers();
    for(const f of data.features){const p=f.properties;
      L.circleMarker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{radius:4,color:'#e5b77d',weight:1,fillColor:'#ba8552',fillOpacity:.7}).bindTooltip(`CSO ${escape(p.outfall)} · discharge unknown`).bindPopup(`<strong>CSO outfall ${escape(p.outfall)}</strong><p>Permit: ${escape(p.permit||'not supplied')}<br>Receiving water: ${escape(p.receivingWater||'not supplied')}</p><small>Official DEC inventory location.<br>Live discharge: unknown<br>Discharge rate: not supplied<br>Microbial load: not supplied<br>Inventory edited: ${escape(data.sourceDataEditedAt?.slice(0,10)||'not supplied')}</small><p><a href="${escape(data.source)}" target="_blank" rel="noopener noreferrer">Original outfall inventory ↗</a></p>`).addTo(sewerLayer);
    }
    $('sewerCount').textContent=`${data.count} OUTFALLS`;
    $('sewerStatus').textContent=`${data.count} official DEC outfalls in the NYC pilot. ${data.sourceStatus==='refreshed'?'Inventory retrieved.':'Saved inventory; refresh unavailable.'} Locations show potential sources, not current overflow events.`;
  }catch(error){$('sewerStatus').textContent='Outfall inventory refresh unavailable. Any previously loaded locations remain visible; discharge status is unknown.';}
}
function drawAdvisories(){
  advisoryLayer.clearLayers();if(!state.boundaries)return;
  const type=$('advisoryType').value,records=new Map((state.advisories?.records||[]).filter(r=>r.type===type).map(r=>[r.waterbodyId,r]));
  const current=state.advisories?.status==='retrieved';
  L.geoJSON(state.boundaries,{pane:'advisoryPane',style:f=>{const r=records.get(f.properties.waterbodyId),known=current&&r,active=known&&r.providerAdvisory;return{color:active?'#eab26d':'#718795',weight:1,fillColor:active?'#d69443':'#8093a0',fillOpacity:active ? .15 : .02,dashArray:known?null:'4 5'};},onEachFeature:(f,layer)=>{
    const r=records.get(f.properties.waterbodyId),known=current&&r;
    const status=known?(r.providerAdvisory?'DEP reports an advisory':'DEP reports no advisory'):'Advisory status unavailable or old';
    const content=`<strong>${escape(f.properties.name)}</strong><p>${escape(type==='WQ'?'Water-quality advisory':'CSO advisory')}<br>${escape(status)}</p>${r?`<small>Provider message: ${escape(r.message)}<br>Provider time: ${escape(r.occurredOnReported)} (timezone unspecified)<br>Duration field: ${escape(r.durationHoursReported)} h<br>Retrieved: ${escape(state.advisories.retrievedAt)}</small>`:'<small>No current provider record loaded.</small>'}<p>Rainfall/model-based advisory, not a bacterial measurement or proof of water safety.</p><a href="https://nycwaterbodyadvisory.azurewebsites.net/" target="_blank" rel="noopener noreferrer">Check official DEP dashboard ↗</a>`;
    layer.bindTooltip(escape(f.properties.name)).bindPopup(content,{maxWidth:315});
  }}).addTo(advisoryLayer);
  const selected=[...records.values()],active=selected.filter(r=>r.providerAdvisory).length;
  $('advisoryStatus').textContent=current?`${type==='WQ'?'Water quality':'CSO'}: DEP reports advisories for ${active} of ${selected.length} waterbodies citywide. Provider period: ${state.advisories.latestReported} (timezone unspecified). No advisory does not establish safety.`:'DEP advisory feed unavailable or old. Boundaries are reference areas; current advisory status is unknown.';
}
async function refreshAdvisories(){
  try{
    const requests=[fetch('/api/advisories',{signal:AbortSignal.timeout(23000)})];
    if(!state.boundaries)requests.push(fetch('/waterbody-boundaries.geojson'));
    const responses=await Promise.allSettled(requests);
    if(responses[1]?.status==='fulfilled'&&responses[1].value.ok)state.boundaries=await responses[1].value.json();
    if(responses[0].status!=='fulfilled'||!responses[0].value.ok)throw new Error('Advisory feed unavailable');
    state.advisories=await responses[0].value.json();drawAdvisories();
  }catch(error){if(state.advisories)state.advisories.status='stale';$('advisoryStatus').textContent='DEP advisory refresh failed. Current status is unknown; use the official dashboard.';drawAdvisories();}
}
$('sewersToggle').onchange=()=>{$('sewersToggle').checked?sewerLayer.addTo(map):map.removeLayer(sewerLayer);};
$('advisoriesToggle').onchange=()=>{$('advisoriesToggle').checked?advisoryLayer.addTo(map):map.removeLayer(advisoryLayer);};
$('advisoryType').onchange=drawAdvisories;
$('exportSewers').onclick=()=>{if(!state.sewers&&!state.advisories){toast('No sewer or advisory data is available yet.');return;}downloadJson('battery-sewer-and-advisory-data.json',{application:'Battery Flow',version:'0.2.0',exportedAt:new Date().toISOString(),outfalls:state.sewers,advisories:state.advisories,interpretation:'Inventory locations and official model-based advisories. No measured outfall discharge or microbial source loading.'});};
setInterval(refreshSewers,60*60_000);setInterval(refreshAdvisories,5*60_000);
refreshSewers();refreshAdvisories();
