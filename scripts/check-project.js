const fs=require('node:fs'),path=require('node:path'); const root=path.resolve(__dirname,'..');
const required=['README.md','apps/premiere-copilot/manifest.json','apps/local-service/server.js','packages/tool-registry/index.js','packages/workflow-engine/index.js','database/schema/001_core.sql','docs/00_START_HERE.md'];
let failed=false; for(const f of required){ const ok=fs.existsSync(path.join(root,f)); console.log(`${ok?'OK':'MISSING'} ${f}`); if(!ok) failed=true; }
for(const f of ['package.json','apps/premiere-copilot/manifest.json','apps/local-service/package.json']) JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
if(failed) process.exit(1); console.log('Project structure and JSON checks passed.');
