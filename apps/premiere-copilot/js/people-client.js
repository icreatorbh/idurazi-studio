const PeopleClient={
 base(){return (ApiKeys.load().url||"http://127.0.0.1:37841").replace(/\/$/,"")},
 async req(path,options={}){const r=await fetch(this.base()+path,{headers:{"Content-Type":"application/json"},...options});const t=await r.text();let j={};try{j=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error(j.error||t||`HTTP ${r.status}`);return j},
 list(){return this.req('/people')},
 create(person){return this.req('/people',{method:'POST',body:JSON.stringify(person)})},
 update(person){return this.req('/people/update',{method:'POST',body:JSON.stringify(person)})},
 remove(id){return this.req('/people/delete',{method:'POST',body:JSON.stringify({id})})},
 suggest(transcript,model){return this.req('/lower-thirds/suggest',{method:'POST',body:JSON.stringify({transcript,model})})}
};
