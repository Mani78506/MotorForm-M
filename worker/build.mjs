import { mkdir, readFile, writeFile } from 'node:fs/promises';
const types = {'index.html':'text/html','studio.html':'text/html','finder.js':'text/javascript','app.js':'text/javascript','landing.css':'text/css','style.css':'text/css','car.webp':'image/webp','operator.html':'text/html'};
const assets = Object.fromEntries(await Promise.all(Object.entries(types).map(async ([path,type]) => [path,{type,body:(await readFile('public/'+path)).toString('base64')}])));
const source = await readFile('worker/index.mjs','utf8');
const seed = JSON.parse(await readFile("worker/seed.json", "utf8"));
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js', 'const assets = '+JSON.stringify(assets)+';\n'+ 'const seed = '+JSON.stringify(seed)+';\n'+source);
