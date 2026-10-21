import assert from 'node:assert/strict';
import {loadEnvFile} from 'node:process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
loadEnvFile('.env');
const base=`http://127.0.0.1:${process.env.WEB_PORT??'5173'}`,root='docs/evidence/frontend';await mkdir(root,{recursive:true});
const readiness=await fetch(base+'/health/ready');assert.equal(readiness.status,200);
const config=await fetch(base+'/api/v1/client-config').then(r=>r.json());assert.equal(config.demoBrowserEnabled,true);
const secrets=['POSTGRES_PASSWORD','DEMO_USER_RU_TOKEN','DEMO_USER_KY_TOKEN','DEMO_SESSION_SECRET'].map(key=>{assert.ok(process.env[key]);return Buffer.from(process.env[key]);});
let bundles=0;const html=await fetch(base).then(response=>response.text());for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)){const bytes=Buffer.from(await fetch(new URL(match[1],base)).then(response=>response.arrayBuffer()));assert.ok(!secrets.some(secret=>bytes.includes(secret)),'Local secret in served browser bundle');bundles++;}assert.ok(bundles>=2);
const browser=await chromium.launch({headless:true}),results=[];
try{for(const [screen,width,height]of [['desktop',1440,900],['mobile',393,851]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByText('Синхронизировано',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Выбрать демо-профиль',exact:true}).click();await page.getByRole('dialog').locator('.profile-option').filter({hasText:'Айжан'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('Синхронизировано',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Самокаты · 30',exact:true}).click();await page.getByRole('searchbox',{name:'Номер самоката'}).fill('SK-005');await page.getByRole('dialog').getByRole('button',{name:/SK-005/}).click();
  await page.evaluate(()=>document.fonts.ready);
  let allTilesComplete=true;try{await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.leaflet-tile')];return images.length>0&&images.every(image=>image instanceof HTMLImageElement&&image.complete);},{},{timeout:10000});}catch{allTilesComplete=false;}
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  const layout=await page.evaluate(()=>({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,verticalOverflow:document.documentElement.scrollHeight>innerHeight+2,markers:document.querySelectorAll('.transport-pin').length,loadedTiles:document.querySelectorAll('.leaflet-tile-loaded').length,font:getComputedStyle(document.body).fontFamily,oldToast:document.querySelectorAll('.server-notice').length}));
  assert.equal(layout.horizontalOverflow,false);assert.equal(layout.verticalOverflow,false);assert.equal(layout.markers,30);assert.equal(layout.oldToast,0);assert.ok(layout.loadedTiles>0);assert.deepEqual(errors,[]);
  await page.screenshot({path:root+'/live-'+screen+'.png',fullPage:true});
  await page.getByRole('button',{name:'Кыргызча',exact:true}).click();await page.getByText('Электр самокат',{exact:true}).waitFor();await page.screenshot({path:root+'/live-ky-'+screen+'.png',fullPage:true});
  results.push({screen,width,height,...layout,allTilesComplete,pageErrors:errors,mainDatabaseMutations:'none; temporary demo token issued without persistence'});await page.close();
}}finally{await browser.close();}
const recordedAt=new Date(Date.now()+6*3600000).toISOString().replace('Z','+06:00');await writeFile(root+'/live-smoke.json',JSON.stringify({recordedAt,base,readiness:await readiness.json(),staticBundlesChecked:bundles,bundleSecretScan:'passed',results},null,2)+'\n');console.log(JSON.stringify({recordedAt,bundleSecretScan:'passed',views:results.map(({screen,horizontalOverflow,verticalOverflow,markers,allTilesComplete})=>({screen,horizontalOverflow,verticalOverflow,markers,allTilesComplete}))}));
