import http from 'node:http';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import * as sass from 'sass';
const source='docs/design-research/frontend',root='outputs/frontend-directions';await mkdir(root+'/vendor',{recursive:true});await mkdir(root+'/fonts',{recursive:true});
for(const file of ['preview.html','preview.js','fonts/geologica.ttf','fonts/golostext.ttf'])await copyFile(source+'/'+file,root+'/'+(file==='preview.html'?'index.html':file));
for(const file of ['leaflet.js','leaflet.css'])await copyFile('node_modules/leaflet/dist/'+file,root+'/vendor/'+file);
const {writeFile}=await import('node:fs/promises');await writeFile(root+'/preview.css',sass.compile(source+'/preview.scss',{style:'expanded'}).css);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:5174');
  if(url.pathname.startsWith('/api/')){const upstream=await fetch('http://127.0.0.1:5173'+url.pathname);res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json'});res.end(Buffer.from(await upstream.arrayBuffer()));return;}
  const requested=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!requested.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(requested),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ttf':'font/ttf','.png':'image/png'};res.writeHead(200,{'content-type':mime[path.extname(requested)]??'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});server.listen(5174,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5174/'));
