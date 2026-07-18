const {registerTool}=require('@idurazi/tool-registry');
registerTool({name:'transcribe_media',description:'Transcribe local media',risk:'low',reversible:false,requiresApproval:false},async input=>({queued:true,...input}));
registerTool({name:'generate_chapters',description:'Generate topic chapters',risk:'low',reversible:true,requiresApproval:false},async input=>({chapters:input.chapters||[]}));
registerTool({name:'detect_people',description:'Resolve mentioned people',risk:'low',reversible:true,requiresApproval:false},async input=>({people:[]}));
registerTool({name:'suggest_lower_thirds',description:'Suggest lower thirds',risk:'medium',reversible:true,requiresApproval:false},async input=>({suggestions:[]}));
registerTool({name:'apply_premiere_changes',description:'Apply approved changes in Premiere',risk:'high',reversible:true,requiresApproval:true},async input=>({applied:true,...input}));
