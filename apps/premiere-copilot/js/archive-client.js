const ArchiveClient={
 base(){return (ApiKeys.load().ollamaUrl||'http://127.0.0.1:37841').replace(/\/$/,'');},
 async request(path,options={}){const r=await fetch(this.base()+path,{headers:{'Content-Type':'application/json'},...options});const data=await r.json();if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;},
 stats(){return this.request('/archive/stats');},
 list(type){return this.request('/archive/list?type='+encodeURIComponent(type));},
 search(query,types){return this.request('/archive/search',{method:'POST',body:JSON.stringify({query,types,limit:100})});},
 upsert(type,item){return this.request('/archive/upsert',{method:'POST',body:JSON.stringify({type,item})});},
 remove(type,id){return this.request('/archive/delete',{method:'POST',body:JSON.stringify({type,id})});},
 linked(entityType,entityId){return this.request('/archive/linked',{method:'POST',body:JSON.stringify({entityType,entityId})});},
 importInterview(payload){return this.request('/archive/import/interview',{method:'POST',body:JSON.stringify(payload)});}
};
