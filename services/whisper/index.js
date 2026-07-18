const {spawn}=require('node:child_process'); const path=require('node:path');
function transcribe({script,input,model='small',language='ar',outputDir}){ return new Promise((resolve,reject)=>{
 const args=[script,'--input',input,'--model',model,'--language',language,'--output-dir',outputDir];
 const p=spawn(process.env.PYTHON||'python',args,{stdio:['ignore','pipe','pipe']}); let out='',err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
 p.on('close',code=>code===0?resolve(JSON.parse(out)):reject(new Error(err||`Whisper exited ${code}`)));
 });}
module.exports={transcribe};
