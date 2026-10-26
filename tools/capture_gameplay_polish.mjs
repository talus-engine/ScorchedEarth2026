// Offline layout fixtures only. Never attaches to the running game or its profile.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../foxtrot/node_modules/playwright/index.mjs';
const output='docs/evidence/gameplay-polish';fs.mkdirSync(output,{recursive:true});
const markup=fs.readFileSync('world/Menus/hud.html','utf8');
const font=fs.readFileSync('../foxtrot/public/fonts/VCR_OSD_MONO.ttf').toString('base64');
const browser=await chromium.launch({headless:true,args:['--disable-gpu','--renderer-process-limit=1']});
const page=await browser.newPage();const rows=[];
const shop=JSON.parse(fs.readFileSync('world/Game/shop.json','utf8'));
const base={current:{control:'CPU',name:'Molly “Mole” Morgan',color:'#ff783c',angle:82,power:67,health:100},turnNumber:18,remaining:29,cash:1234.75,roundCash:278.25,weaponName:'Heavy Riot Bomb',weaponAmmo:3,status:'Computer is choosing its shot',tactic:'Investigating nearby supplies',target:'Kiloton',persona:'Burrow Union · Easy',shotDirection:'Left · high arc',biome:'Atomic wasteland',seed:19841024,tankCount:16,canEquip:true,supplies:{jet:12,jetCapacity:12,jetStock:18,dig:8,shield:50,shieldCapacity:100,magnet:12,magnetCapacity:50},groundFuelEnabled:true,groundFuel:9,groundFuelStock:15,parachuteEnabled:true,parachuteCharges:3,autoAimCharges:2,batteries:2,roster:Array.from({length:16},(_,i)=>({name:['Molly “Mole” Morgan','The spectacularly overconfident tank commander','CPU '+(i+1)][i%3],color:['#ff783c','#70f8a0','#35d9ff'][i%3],health:100-i*4,status:i===12?'Eliminated':'Alive'})),loadout:shop.items.filter(i=>i.enabled&&i.kind==='weapon').map(i=>({name:i.name,stock:3,action:'equip-'+i.id})),targets:[{name:'Kiloton',action:'target-1'},{name:'Lucky Fuse',action:'target-2'}],walletPopups:[],arcadeCards:[]};
async function render(data,width,height){
 await page.setViewportSize({width,height});await page.setContent(`<style>@font-face{font-family:'VCR OSD Mono';src:url(data:font/ttf;base64,${font})}body{margin:0;background:#29323a}body:before{content:'OFFLINE LAYOUT FIXTURE';position:absolute;top:45%;left:35%;color:#74818b;font:16px monospace}</style>`+markup);
 await page.evaluate(data=>{
  const get=(s,path)=>path.split('.').reduce((v,k)=>v?.[k],s);
  function bind(el,s){
   if(el.tagName==='TEMPLATE')return;
   const each=el.getAttribute('data-talus-each');
   if(each){const template=el.querySelector('template');el.removeAttribute('data-talus-each');el.replaceChildren();for(const item of get(s,each)||[]){const fragment=template.content.cloneNode(true);for(const child of [...fragment.children])bind(child,item);el.append(fragment)}return}
   for(const a of [...el.attributes]){
    const v=get(s,a.value);
    if(a.name==='data-talus-bind')el.textContent=typeof v==='number'&&el.hasAttribute('data-talus-fixed')?v.toFixed(Number(el.getAttribute('data-talus-fixed'))):String(v??'');
    else if(a.name==='data-talus-show')el.hidden=!v;
    else if(a.name.startsWith('data-talus-class-'))el.classList.toggle(a.name.slice(17),!!v);
    else if(a.name.startsWith('data-talus-style-')&&v!==undefined)el.style.setProperty(a.name.slice(17),v);
    else if(a.name.startsWith('data-talus-attr-')){const name=a.name.slice(16);if(v===false||v==null)el.removeAttribute(name);else el.setAttribute(name,v===true?'':String(v))}
   }
   for(const child of el.children)bind(child,s);
  }
  bind(document.querySelector('.indigo-hud'),data);
 },data);
 await page.evaluate(()=>document.fonts.ready);
}
async function capture(name){
 const report=await page.evaluate(()=>{
  const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
  const clipped=[...document.querySelectorAll('.hud-bar button,.hud-bar summary,.hud-gauges,.hud-wallet,.hud-pilot')].filter(e=>e.getClientRects().length&&!e.closest('[hidden]')&&(!e.closest('details')||e.matches('summary')||e.closest('details').open)&&(!e.closest('.hud-drawer-body')||e===document.activeElement)).filter(e=>{const r=e.getBoundingClientRect();return r.x<0||r.right>innerWidth+.5||r.y<0||r.bottom>innerHeight+.5}).map(e=>e.textContent);
  return{viewport:{width:innerWidth,height:innerHeight},top:box(document.querySelector('.hud-top')),bottom:box(document.querySelector('.hud-bottom')),clipped};
 });
 assert.deepEqual(report.clipped,[],name+' viewport clipping');
 assert.ok(report.top.h+report.bottom.h<report.viewport.height*.3,name+' bars must leave most of arena clear');
 rows.push({name,...report});await page.screenshot({path:`${output}/${name}.png`});
}
try{
 for(const [width,height] of [[1440,868],[960,540]]){
  await render({...base,human:false},width,height);await capture(`cpu-${width}`);
  await render({...base,current:{...base.current,control:'Human'},human:true},width,height);await capture(`human-${width}`);
  await page.locator('summary').first().click();await page.locator('.hud-drawer-body button').last().focus();await capture(`equipment-${width}`);
 }
 await render({...base,arcadeCards:[{eyebrow:'TURN 18 COMPLETE',title:'Molly “Mole” Morgan',sub:'One more crater for the collection',score:'2 kills · 340 damage · $278.25',receipt:true}]},1440,868);
 await page.evaluate(()=>{for(const a of document.getAnimations()){a.pause();a.currentTime=500}});await capture('tread-transition');
 fs.writeFileSync(`${output}/layout.json`,JSON.stringify({kind:'offline HTML layout fixtures, not native runtime acceptance',checks:rows},null,2)+'\n');
 console.log(JSON.stringify(rows.map(r=>({name:r.name,top:r.top.h,bottom:r.bottom.h,clipped:r.clipped})),null,2));
}finally{await browser.close()}
