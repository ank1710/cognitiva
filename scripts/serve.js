import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const ROOT=resolve(import.meta.dirname,'..');
const PORT=Number(process.env.PORT||3000);
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end('Método não permitido');return;}
  let path;
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);path=resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));if(path!==ROOT&&!path.startsWith(ROOT+sep))throw Error('path');if(path.includes('/api/')){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Análise via API só está disponível quando publicada com backend seguro.'}));return;}const info=await stat(path);if(!info.isFile())throw Error('not a file');const bytes=await readFile(path);res.writeHead(200,{'Content-Type':MIME[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Não encontrado');}
});
server.listen(PORT,()=>console.log(`Cognitiva 2.0 disponível em http://localhost:${PORT}`));
