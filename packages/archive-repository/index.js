const fs=require('fs'); const path=require('path');
const TYPES=['people','episodes','transcripts','topics','quotes','assets','links','imports','mentions','identityAudits'];
class ArchiveRepository{
 constructor(filePath){this.filePath=filePath; this.ensure();}
 empty(){return Object.fromEntries(TYPES.map(k=>[k,[]]));}
 ensure(){fs.mkdirSync(path.dirname(this.filePath),{recursive:true}); if(!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath,JSON.stringify(this.empty(),null,2));}
 read(){this.ensure(); const db=JSON.parse(fs.readFileSync(this.filePath,'utf8')); for(const t of TYPES) if(!Array.isArray(db[t])) db[t]=[]; return db;}
 write(db){fs.writeFileSync(this.filePath,JSON.stringify(db,null,2)); return db;}
 list(type,{limit=200,offset=0}={}){const db=this.read(); return (db[type]||[]).slice(offset,offset+limit);}
 get(type,id){return this.list(type,{limit:Number.MAX_SAFE_INTEGER}).find(x=>x.id===id)||null;}
 upsert(type,item){const db=this.read(); if(!Array.isArray(db[type])) throw new Error('Unknown archive type'); const now=new Date().toISOString(); const id=item.id||`${type.replace(/s$/,'')}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`; const i=db[type].findIndex(x=>x.id===id); const next={...(i>=0?db[type][i]:{}),...item,id,updatedAt:now,createdAt:i>=0?db[type][i].createdAt:now}; if(i>=0) db[type][i]=next; else db[type].push(next); this.write(db); return next;}
 remove(type,id){const db=this.read(); if(!Array.isArray(db[type])) throw new Error('Unknown archive type'); const n=db[type].length; db[type]=db[type].filter(x=>x.id!==id); db.links=db.links.filter(l=>!((l.fromType===type&&l.fromId===id)||(l.toType===type&&l.toId===id))); this.write(db); return db[type].length<n;}
 link(link){if(!link.fromType||!link.fromId||!link.toType||!link.toId) throw new Error('Incomplete archive link'); const existing=this.read().links.find(l=>l.fromType===link.fromType&&l.fromId===link.fromId&&l.toType===link.toType&&l.toId===link.toId&&l.relation===link.relation); return existing||this.upsert('links',link);}
 search(query,{types,limit=50}={}){const q=String(query||'').trim().toLowerCase(); if(!q) return []; const db=this.read(); const wanted=types&&types.length?types:Object.keys(db).filter(k=>!['links','imports'].includes(k)); const out=[]; for(const type of wanted){for(const item of db[type]||[]){const text=JSON.stringify(item).toLowerCase(); if(text.includes(q)){const fields=[item.title,item.nameAr,item.nameEn,item.text,item.summary,item.description].filter(Boolean).join(' ').toLowerCase(); out.push({type,score:fields.startsWith(q)?1:fields.includes(q)?.85:.6,item});}}} return out.sort((a,b)=>b.score-a.score).slice(0,limit);}
 getLinked(entityType,entityId){const db=this.read(); const links=(db.links||[]).filter(l=>(l.fromType===entityType&&l.fromId===entityId)||(l.toType===entityType&&l.toId===entityId)); return links.map(l=>{const reverse=l.toType===entityType&&l.toId===entityId; const type=reverse?l.fromType:l.toType; const id=reverse?l.fromId:l.toId; return {relation:l.relation,type,id,item:(db[type]||[]).find(x=>x.id===id)||null};});}
 stats(){const db=this.read(); return Object.fromEntries(Object.entries(db).map(([k,v])=>[k,Array.isArray(v)?v.length:0]));}
}
module.exports={ArchiveRepository,TYPES};
