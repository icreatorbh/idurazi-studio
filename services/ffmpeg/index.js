const {spawn}=require('node:child_process');
function extractAudio(input,output){ return new Promise((resolve,reject)=>{ const p=spawn('ffmpeg',['-y','-i',input,'-vn','-ac','1','-ar','16000',output]); p.on('close',c=>c===0?resolve(output):reject(new Error(`ffmpeg exited ${c}`))); }); }
module.exports={extractAudio};
