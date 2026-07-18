function unique(items){return [...new Set(items.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))];}
function parseTopics(text, supplied=[]){const common=['التعليم','المدرسة','الدراز','بابكو','الصيد','البحر','الرياضة','الطفولة','الأسرة','العمل','التراث']; const found=common.filter(k=>text.includes(k)); return unique([...supplied,...found]).slice(0,20);}
function parseQuotes(text,supplied=[]){if(supplied.length) return supplied; return String(text||'').split(/\n+/).map(x=>x.replace(/^\[[^\]]+\]\s*/, '').trim()).filter(x=>x.length>=35&&x.length<=280).slice(0,12).map((text,i)=>({text,timeSeconds:null,order:i}));}
function normalizeGuests(guests=[]){return guests.map(g=>typeof g==='string'?{nameAr:g}:g).filter(g=>g&&g.nameAr);}
class InterviewImportPipeline{
 constructor(repository,{personResolver=null}={}){this.repository=repository;this.personResolver=personResolver;}
 run(input={}){
  const title=String(input.title||'').trim(); const transcriptText=String(input.transcriptText||'').trim();
  if(!title) throw new Error('title is required'); if(!transcriptText) throw new Error('transcriptText is required');
  const batchId=`import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  const episode=this.repository.upsert('episodes',{title,program:input.program||'وجوه درازية',episodeNumber:input.episodeNumber||null,recordedAt:input.recordedAt||null,publishedAt:input.publishedAt||null,summary:input.summary||'',sourcePath:input.sourcePath||'',importBatchId:batchId,status:'imported'});
  const transcript=this.repository.upsert('transcripts',{episodeId:episode.id,language:input.language||'ar',text:transcriptText,segments:Array.isArray(input.segments)?input.segments:[],durationSeconds:Number(input.durationSeconds)||null,importBatchId:batchId});
  this.repository.link({fromType:'episodes',fromId:episode.id,toType:'transcripts',toId:transcript.id,relation:'has_transcript',importBatchId:batchId});
  const people=[]; for(const guest of normalizeGuests(input.guests)){let person=this.repository.search(guest.nameAr,{types:['people'],limit:5}).map(x=>x.item).find(p=>p.nameAr===guest.nameAr); if(!person) person=this.repository.upsert('people',{...guest,importBatchId:batchId}); people.push(person); this.repository.link({fromType:'people',fromId:person.id,toType:'episodes',toId:episode.id,relation:'guest_in',importBatchId:batchId});}
  const topics=parseTopics(transcriptText,input.topics||[]).map(name=>{let topic=this.repository.search(name,{types:['topics'],limit:5}).map(x=>x.item).find(t=>t.name===name); if(!topic) topic=this.repository.upsert('topics',{name,importBatchId:batchId}); this.repository.link({fromType:'episodes',fromId:episode.id,toType:'topics',toId:topic.id,relation:'covers_topic',importBatchId:batchId}); return topic;});
  const quotes=parseQuotes(transcriptText,input.quotes||[]).map(q=>{const quote=this.repository.upsert('quotes',{...q,episodeId:episode.id,transcriptId:transcript.id,importBatchId:batchId}); this.repository.link({fromType:'episodes',fromId:episode.id,toType:'quotes',toId:quote.id,relation:'contains_quote',importBatchId:batchId}); return quote;});
  const assets=(input.assets||[]).map(a=>{const asset=this.repository.upsert('assets',{...a,episodeId:episode.id,importBatchId:batchId}); this.repository.link({fromType:'episodes',fromId:episode.id,toType:'assets',toId:asset.id,relation:'has_asset',importBatchId:batchId}); return asset;});
  const mentions=[]; if(this.personResolver&&Array.isArray(input.personMentions)){for(const m of input.personMentions){mentions.push(this.personResolver.resolveMention({...m,episodeId:episode.id,transcriptId:transcript.id,context:{episodeTitle:title,program:episode.program,...(m.context||{})}}));}}
  const record=this.repository.upsert('imports',{id:batchId,type:'interview',status:'completed',episodeId:episode.id,counts:{people:people.length,topics:topics.length,quotes:quotes.length,assets:assets.length,mentions:mentions.length},completedAt:new Date().toISOString()});
  return {batchId,episode,transcript,people,topics,quotes,assets,mentions,record};
 }
}
module.exports={InterviewImportPipeline,parseTopics,parseQuotes};
