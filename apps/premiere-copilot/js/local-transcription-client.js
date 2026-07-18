const LocalTranscriptionClient={
 async transcribe(nativePath,options={}){const s=ApiKeys.load();const r=await fetch((s.serviceUrl||"http://127.0.0.1:37841")+"/transcribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filePath:nativePath,language:options.language||"auto",model:options.model||"small"})});const t=await r.text();if(!r.ok)throw new Error(t);return JSON.parse(t);},
 async chapters(transcript,model){const s=ApiKeys.load();const r=await fetch((s.serviceUrl||"http://127.0.0.1:37841")+"/chapters",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript,model:model||s.model})});const t=await r.text();if(!r.ok)throw new Error(t);return JSON.parse(t);}
};
