import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
try {for(const engine of [chromium,firefox,webkit]) {
const browser=await engine.launch();
try {
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
 await page.evaluate(async()=>{
  const {GameMenu}=await import('/src/netplayjs/ui/gamemenu.ts');
  const menu=Object.create(GameMenu.prototype);
  Object.assign(menu,{root:document.createElement('div'),settings:(await import('/src/solo-settings.ts')).DEFAULT_MULTIPLAYER_SETTINGS,matchmaker:{clientID:'00000000-0000-4000-8000-000000000001',serverURL:'https://example.com',connections:new Map()},members:new Set(['00000000-0000-4000-8000-000000000001']),ready:new Set(),prepared:new Set(),targetPlayers:2,room:'00000000-0000-4000-8000-000000000001',message:'',inviting:false,started:false,ended:false});
  Object.assign(menu.root.style,{position:"fixed",inset:"10%",padding:"20px",overflow:"auto"});
  document.body.replaceChildren(menu.root);window.menu=menu;menu.render();
 });
 await page.getByRole('button',{name:'Invite friends',exact:true}).click();
 assert.equal(await page.getByText('Custom invitation settings',{exact:true}).count(),1,'Invitation lobby hides settings');
 const decode=async(displaySize=false)=>{
  const pixels=await page.evaluate(displaySize=>{
   const canvas=document.querySelector('.invitation-qr');
   const target=document.createElement('canvas');target.width=target.height=displaySize?Math.round(canvas.getBoundingClientRect().width*devicePixelRatio):canvas.width;
   const output=target.getContext('2d');output.drawImage(canvas,0,0,target.width,target.height);
   const data=output.getImageData(0,0,target.width,target.height);
   return {data:Array.from(data.data),width:data.width,height:data.height};
  },displaySize);
  return jsQR(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height)?.data;
 };
 const fits=()=>page.locator('.invitation-qr').evaluate(canvas=>{
  const box=canvas.getBoundingClientRect(),parent=canvas.parentElement;
  const available=parent.clientWidth-parseFloat(getComputedStyle(parent).paddingLeft)-parseFloat(getComputedStyle(parent).paddingRight);
  return box.width<=available+1&&Math.abs(box.width-box.height)<1;
 });
 assert(await fits(),'QR must be square and fit its container');
 const original=await page.getByRole('link',{name:'Invite link',exact:true}).getAttribute('href');
 assert.equal(await decode(),original,'QR must decode to the complete invitation URL');
 await page.getByText('Custom invitation settings',{exact:true}).click();
 await page.getByText('AI',{exact:true}).click();
 await page.getByLabel('AI rivals',{exact:true}).fill('2');
 const link=await page.getByRole('link',{name:'Invite link',exact:true}).getAttribute('href');
 assert.equal((await page.evaluate(async link => (await import('/src/solo-settings.ts')).decodeInvitationSettings(new URLSearchParams(new URL(link).hash.slice(1)).get('settings')),link)).aiCount,2);
 assert.notEqual(link,original);assert.equal(await decode(),link,'QR must update with invitation settings');
 assert(await fits(),'Updated QR must still fit');
 assert.equal(await decode(true),link,'QR must decode at displayed mobile size');
 await page.evaluate(()=>{window.menu.members.add('00000000-0000-4000-8000-000000000002');window.menu.render();});
 assert(await page.getByLabel('AI rivals',{exact:true}).isDisabled(),'Rules must freeze once peers join');
 await page.evaluate(()=>{window.menu.started=true;window.menu.render();});
 assert.equal(await page.locator('.invitation-qr').count(),0,'Remove QR when gameplay starts');
 console.log(`PASS ${engine.name()}: invitation QR decodes complete link, updates with settings, lobby controls remain correct`);
} finally {await browser.close();}
}}finally{await server.close();}
