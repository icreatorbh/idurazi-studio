#!/usr/bin/env node
require('./bootstrap');
const {listTools}=require('@idurazi/tool-registry'); const {runWorkflow}=require('@idurazi/workflow-engine');
const interview=require('../../examples/workflows/interview-import.json');
(async()=>{ const [cmd,arg]=process.argv.slice(2); if(cmd==='tools') console.log(JSON.stringify(listTools(),null,2)); else if(cmd==='workflow'&&arg==='interview-import') console.log(JSON.stringify(await runWorkflow(interview,{}),null,2)); else console.log('Commands: tools | workflow interview-import'); })().catch(e=>{console.error(e);process.exit(1)});
