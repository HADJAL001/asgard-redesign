// OSGARD V9 product integration contract: no remote calls or auth changes.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const slug=process.argv[2];
const expected=JSON.parse(readFileSync(new URL('./premium-expected.json',import.meta.url),'utf8'));
if (slug!==expected.slug) throw new Error('Wrong product integration: '+slug);
const root=join(process.cwd(),'public','premium-ab-preview');
const text=(name)=>readFileSync(join(root,name),'utf8');
let checks=0;
const check=(ok,name)=>{if(!ok)throw Error('Premium bridge gate: '+name);checks++};
const html=text('index.html');
check(html.includes(`data-product="${slug}"`),'expected static product page');
check(html.includes('data-mode="embed"'),'isolated frontend mode');
check(html.includes('data-action-href="/"'),'navigate into the actual app');
check(html.includes("script-src 'self'")&&html.includes("connect-src 'none'"),'no network-based runtime');
check(!html.includes('src="https://')&&!html.includes('onload="'),'no remote JavaScript');
check(html.includes('noindex,nofollow'),'preview not indexed');
check(html.includes('href="/"'),'real app is accessible');
for (const f of ['app.js','styles.css','shell.css']) check(existsSync(join(root,f))&&statSync(join(root,f)).size>2000,`runtime ${f}`);
check(text('app.js').includes("const slug = embedded ? (script.dataset.product || 'all')"),'untrusted query cannot switch product');
for(const theme of ['a','b']) {
 const filename=`assets/hero-${theme}-${slug}.webp`;
 const art=readFileSync(join(root,filename));
 check(art.length===expected.art[theme].bytes,'image size '+theme);
 check(createHash('sha256').update(art).digest('hex')===expected.art[theme].sha256,'image SHA-256 '+theme);
}
console.log(JSON.stringify({status:'PASS',slug,checks}));
