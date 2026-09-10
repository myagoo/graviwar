import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 for(const file of await readdir('public/icons')){
  if(!file.endsWith('.png'))continue;
  const bytes=await readFile(`public/icons/${file}`);
  const result=await page.evaluate(async base64=>{
   const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const {data}=ctx.getImageData(0,0,img.width,img.height);
   let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]!==255)transparent++;
   return {transparent,corner:Array.from(data.slice(0,4))};
  },bytes.toString('base64'));
  console.log(file,result);
  assert.equal(result.transparent,0,`${file}: transparent pixels can show the installer background`);
  assert.deepEqual(result.corner,[0,0,0,255],`${file}: background must be opaque black`);
 }
 const logo=await readFile('src/assets/home-logo.png');
 const samples=await page.evaluate(async base64=>{
  const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const pixel=(x,y)=>Array.from(ctx.getImageData(Math.floor(img.width*x),Math.floor(img.height*y),1,1).data);
  return {corner:pixel(0,0),large:pixel(.43,.55),small:pixel(.82,.35)};
 },logo.toString('base64'));
 assert.equal(samples.corner[3],0,'Homepage exterior must be transparent');
 for(const key of ['large','small']){
  assert(samples[key][3]>=250,`${key} hole must visually block the stars`);
  assert(samples[key].slice(0,3).every(value=>value<10),`${key} hole must remain black`);
 }
 console.log('PASS homepage: transparent exterior, black hole interiors');
} finally {await browser.close();}
