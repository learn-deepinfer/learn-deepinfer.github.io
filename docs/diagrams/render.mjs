import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const output = path.join(project, 'docs/assets/diagrams');
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.png':'image/png' };
const server=createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(project,'.'+pathname);
  if(!file.startsWith(project+path.sep)){res.writeHead(403).end();return;}
  const info=await stat(file); if(!info.isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1200,height:760},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const figures=[
 ['readme-cover','hero.html'], ['readme-cover-zh','hero.html?lang=zh'],
 ['architecture','gallery.html?kind=architecture'],
 ['cache-timeline','gallery.html?kind=cache'], ['core-equations','gallery.html?kind=formulas'],
 ['batching','batching.html'], ['expert-routing','experts.html'], ['production-pipeline','pipeline.html'],
].filter(([name])=>!process.argv[2]||name===process.argv[2]);
try {
 await mkdir(output,{recursive:true});
 for(const [name,file] of figures){
  const response=await page.goto(origin+'/docs/diagrams/'+file,{waitUntil:'networkidle'});
  if(response.status()!==200)throw new Error(`${file}: HTTP ${response.status()}`);
  await page.evaluate(()=>document.fonts.ready);
  if(file.startsWith('gallery')||file.startsWith('hero'))await page.waitForFunction(()=>window.__figureReady===true);
  const figure=page.locator('.figure, .canvas, .diagram');
  if(await figure.count()!==1)throw new Error(`${file}: expected one artboard`);
  const bounds=await figure.boundingBox();
  if(!bounds||!([1200,1440].includes(bounds.width))||!([640,760].includes(bounds.height)))throw new Error(`${file}: incorrect artboard ${JSON.stringify(bounds)}`);
  await figure.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
  console.log(`Rendered ${name}.png — ${bounds.width*2} × ${bounds.height*2}`);
 }
 if(errors.length)throw new Error(errors.join('\n'));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
