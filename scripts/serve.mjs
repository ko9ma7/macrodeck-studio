import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml; charset=utf-8','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\//,''));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { file=path.join(root,'404.html'); if(!fs.existsSync(file)) file=path.join(root,'public','404.html'); res.statusCode=404; }
  const ext=path.extname(file); res.setHeader('Content-Type',types[ext]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(port,()=>console.log(`MacroDeck: http://localhost:${port}`));
