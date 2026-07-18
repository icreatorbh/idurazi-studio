const test=require('node:test');const assert=require('node:assert/strict');
const {ProviderContainer}=require('@idurazi/provider-container');
test('provider container validates and resolves providers',()=>{const p={id:'fake-ai',health:async()=>({ok:true}),listModels:async()=>[],chat:async()=>({})};const c=new ProviderContainer().register('ai',p);assert.equal(c.resolve('ai'),p);assert.equal(c.describe()[0].id,'fake-ai');});
test('provider container rejects incomplete providers',()=>{assert.throws(()=>new ProviderContainer().register('ai',{id:'broken'}),/does not implement/);});
