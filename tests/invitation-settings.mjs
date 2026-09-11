import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'});await server.listen();
const browser=await chromium.launch();
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
 await page.evaluate(async()=>{
  const {GameMenu}=await import('/src/netplayjs/ui/gamemenu.ts');
  const menu=Object.create(GameMenu.prototype);
  Object.assign(menu,{root:document.createElement('div'),settings:(await import('/src/solo-settings.ts')).DEFAULT_MULTIPLAYER_SETTINGS,matchmaker:{clientID:'00000000-0000-4000-8000-000000000001',serverURL:'https://example.com',connections:new Map()},members:new Set(['00000000-0000-4000-8000-000000000001']),ready:new Set(),prepared:new Set(),targetPlayers:2,room:'00000000-0000-4000-8000-000000000001',message:'',inviting:false,started:false,ended:false});
  document.body.replaceChildren(menu.root);window.menu=menu;menu.render();
 });
 await page.getByRole('button',{name:'Invite friends',exact:true}).click();
 assert.equal(await page.getByText('Custom invitation settings',{exact:true}).count(),1,'Invitation lobby hides settings');
 await page.getByText('Custom invitation settings',{exact:true}).click();
 await page.getByText('AI',{exact:true}).click();
 await page.getByLabel('AI rivals',{exact:true}).fill('2');
 const link=await page.getByRole('link',{name:'Invite link',exact:true}).getAttribute('href');
 assert.equal(JSON.parse(new URLSearchParams(new URL(link).hash.slice(1)).get('settings')).aiCount,2);
 await page.evaluate(()=>{window.menu.members.add('00000000-0000-4000-8000-000000000002');window.menu.render();});
 assert(await page.getByLabel('AI rivals',{exact:true}).isDisabled(),'Rules must freeze once peers join');
 console.log('PASS invitation lobby: visible grouped settings, editable AI, encoded link, rules frozen when peers join');
} finally {await browser.close();await server.close();}
