import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
try {for(const engine of [chromium,firefox,webkit]) {
 const browser=await engine.launch();try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const control=async locator=>{
   const box=await locator.evaluate(e=>{const s=getComputedStyle(e);return {height:e.getBoundingClientRect().height,padding:s.padding,border:s.borderRadius};});
   assert.equal(box.height,44);assert.equal(box.padding,'8px 12px');assert.equal(box.border,'8px');
  };
  const card=async()=>{
   const box=await page.locator('.menu-card').evaluate(e=>{const s=getComputedStyle(e);return {padding:s.padding,radius:s.borderRadius,overflow:e.scrollWidth>e.clientWidth};});
   assert.deepEqual(box,{padding:'12px',radius:'8px',overflow:false});
  };
  await control(page.getByRole('button',{name:'Solo',exact:true}));
  await page.getByRole('button',{name:'Solo',exact:true}).click();await card();
  await control(page.getByRole('button',{name:'Settings',exact:true}));
  await control(page.getByRole('button',{name:'Start solo game',exact:true}));
  await page.getByRole('button',{name:'Settings',exact:true}).click();await card();
  await page.getByText('Arena',{exact:true}).click();
  assert.equal(await page.getByLabel('Starting arena radius',{exact:true}).evaluate(e=>e.getBoundingClientRect().height),44);
  assert.equal(await page.locator('.setup-checkbox').evaluate(e=>e.getBoundingClientRect().height),44);
  await page.getByRole('button',{name:'Back to solo'}).click();await page.getByRole('button',{name:'Start solo game',exact:true}).click();
  await page.getByRole('button',{name:'Game menu',exact:true}).click();await card();
  await control(page.getByRole('button',{name:'Back to menu',exact:true}));
  await page.getByRole('button',{name:'Back to menu',exact:true}).click();
  await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await card();
  await control(page.getByLabel('Total players (including you)'));
  assert.equal(await page.locator('.multiplayer-choice').first().evaluate(e=>getComputedStyle(e).padding),'8px 12px');
  await page.setViewportSize({width:1280,height:900});await card();
  console.log(`PASS ${engine.name()}: shared 44px controls, 12px cards, sliders, checkboxes, mobile/desktop layouts`);
 }finally{await browser.close();}
}}finally{await server.close();}
