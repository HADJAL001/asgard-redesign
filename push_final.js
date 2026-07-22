const {execSync}=require('child_process');
const root=__dirname;
function run(cmd){
  console.log('>',cmd);
  try{const r=execSync(cmd,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  if(r.trim())console.log(r.trim().slice(-400));}
  catch(e){const o=((e.stdout||'')+(e.stderr||'')).trim();console.log(o.slice(-400)||e.message);}
}
run('git add vercel.json next.config.mjs');
run('git commit -m "fix: CSP via vercel.json headers, revert next.config.mjs CSP"');
run('git push');
run('git log --oneline -3');
