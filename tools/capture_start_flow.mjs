// Offline title/setup layout capture. Native scene/terrain controls are not simulated.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../../foxtrot/node_modules/playwright/index.mjs';
const out='docs/evidence/start-flow';fs.mkdirSync(out,{recursive:true});
const font=fs.readFileSync('../foxtrot/public/fonts/VCR_OSD_MONO.ttf').toString('base64');
const browser=await chromium.launch({headless:true,args:['--disable-gpu','--renderer-process-limit=1']});
const page=await browser.newPage({viewport:{width:1440,height:868}});const receipts=[];
try{
 for(const [name,file,state] of [['title-new','title',{saves:0}],['title-saved','title',{saves:2}],['setup-new','setup',{canResume:false}],['setup-return','setup',{canResume:true}]]){
  const html=fs.readFileSync(`world/Menus/${file}.html`,'utf8');
  await page.setContent(`<style>@font-face{font-family:'VCR OSD Mono';src:url(data:font/ttf;base64,${font})}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#29323a}talus-terrain-settings{display:block;border:1px dashed #7582be;padding:12px}talus-terrain-settings:before{content:'Native terrain settings (not rendered in this fixture)'}</style>`+html);
  await page.evaluate(state=>{for(const el of document.querySelectorAll('[data-talus-show]')){const key=el.dataset.talusShow;el.hidden=key.startsWith('!')?!!state[key.slice(1)]:!state[key]}},state);
  await page.evaluate(()=>document.fonts.ready);
  if(file==='setup')await page.locator('footer').scrollIntoViewIfNeeded();
  const report=await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length);
   return{labels:buttons.map(b=>b.textContent.trim()),clipped:buttons.filter(b=>{const r=b.getBoundingClientRect();return r.x<0||r.right>innerWidth||r.y<0||r.bottom>innerHeight}).map(b=>b.textContent)};
  });
  assert.deepEqual(report.clipped,[]);if(file==='setup'){assert.ok(!report.labels.includes('Continue'));assert.ok(report.labels.includes('Start match'))}
  if(name==='title-new')assert.ok(!report.labels.includes('Resume saved game'));
  if(name==='title-saved')assert.ok(report.labels.includes('Resume saved game'));
  await page.screenshot({path:`${out}/${name}.png`});receipts.push({name,...report});
 }
 fs.writeFileSync(`${out}/layouts.json`,JSON.stringify({kind:'Offline layout fixtures; native scene/terrain not simulated',receipts},null,2)+'\n');console.log(JSON.stringify(receipts,null,2));
}finally{await browser.close()}
