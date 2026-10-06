import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const {chromium}=await import(process.env.PROMO_PLAYWRIGHT || '/Users/kuangqie/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const out=resolve(import.meta.dirname,'../../docs/media/previews');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage({viewport:{width:540,height:960},deviceScaleFactor:1});
await page.goto('http://127.0.0.1:4317/docs/media/promo.svg');await page.evaluate(()=>{document.documentElement.style.width='540px';document.documentElement.style.height='960px';document.documentElement.pauseAnimations()});await page.evaluate(()=>document.fonts.ready);
for(const t of [0,1.65,2.3,4.2,5,6.5,8.5,9.6,10.8,13,15.5,16.8,18,20.4,21,22.8,26.3,26.8]){await page.evaluate(t=>document.documentElement.setCurrentTime(t),t);await page.screenshot({path:resolve(out,`frame-${t}.png`)});}
await page.goto('http://127.0.0.1:4317/docs/media/preview.html');await page.waitForTimeout(600);const img=await page.locator('img').evaluate(e=>({width:e.naturalWidth,height:e.naturalHeight,complete:e.complete}));await page.screenshot({path:resolve(out,'image-mode.png')});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForTimeout(28000);writeFileSync(resolve(out,'verification.json'),JSON.stringify({img,errors,fullLoopSeconds:28},null,2));await browser.close();
