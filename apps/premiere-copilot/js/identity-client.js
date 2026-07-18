const IdentityClient={
 base(){return ArchiveClient.base();},
 request(path,options={}){return ArchiveClient.request(path,options);},
 resolve(payload){return this.request('/identity/resolve',{method:'POST',body:JSON.stringify(payload)});},
 queue(){return this.request('/identity/review-queue');},
 review(payload){return this.request('/identity/review',{method:'POST',body:JSON.stringify(payload)});},
 merge(payload){return this.request('/identity/merge',{method:'POST',body:JSON.stringify(payload)});},
 undo(auditId){return this.request('/identity/merge/undo',{method:'POST',body:JSON.stringify({auditId})});}
};
