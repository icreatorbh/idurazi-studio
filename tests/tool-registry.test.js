const test=require('node:test'); const assert=require('node:assert/strict'); const {registerTool,executeTool}=require('../packages/tool-registry');
test('approval gate blocks protected tools',async()=>{ registerTool({name:'test.protected',requiresApproval:true,risk:'high'},async()=>42); const r=await executeTool('test.protected',{}); assert.equal(r.status,'approval_required'); });
test('approved tool executes',async()=>{ const r=await executeTool('test.protected',{}, {approved:true}); assert.equal(r.output,42); });
