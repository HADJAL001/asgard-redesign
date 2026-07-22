const {execSync}=require('child_process');
const root=__dirname;
function run(cmd){
  console.log('>',cmd);
  try{const r=execSync(cmd,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  if(r.trim())console.log(r.trim().slice(-300));}
  catch(e){console.log('ERR:',((e.stdout||'')+(e.stderr||'')).trim().slice(-300));}
}
run('git add next.config.mjs');
run('git commit -m "fix: CSP headers allow Next.js scripts and fix connect-src"');
run('git push origin HEAD');
run('git log --oneline -2');
