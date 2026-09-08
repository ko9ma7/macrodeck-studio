import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of ['index.html','admin.html']) fs.copyFileSync(path.join(root,name), path.join(out,name));
for (const dir of ['src','public']) {
  const from = path.join(root,dir);
  const to = dir === 'public' ? out : path.join(out,dir);
  fs.cpSync(from,to,{recursive:true});
}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('Built static site to dist/');
