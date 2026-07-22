const {execSync}=require('child_process');
const root=__dirname;
function run(cmd){
  console.log('>',cmd);
  try{const r=execSync(cmd,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  if(r.trim())console.log(r.trim().slice(-300));}
  catch(e){const o=((e.stdout||'')+(e.stderr||'')).trim();console.log(o.slice(-300)||e.message);}
}
run('git add app/page.tsx lib/auth-store.tsx');
run('git commit -m "fix: remove loading splash for guests - show landing immediately"');
run('git push');
run('git log --oneline -3');
