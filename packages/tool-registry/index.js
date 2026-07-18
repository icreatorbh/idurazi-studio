const tools = new Map();
function registerTool(definition, executor) {
  if (!definition?.name || typeof executor !== 'function') throw new Error('Invalid tool registration');
  tools.set(definition.name, {definition:Object.freeze({...definition}), executor});
}
function getTool(name){ return tools.get(name); }
function listTools(){ return [...tools.values()].map(x=>x.definition); }
async function executeTool(name,input,context={}) {
  const tool=getTool(name); if(!tool) throw new Error(`Unknown tool: ${name}`);
  if(tool.definition.requiresApproval && !context.approved) return {status:'approval_required',tool:name,input,risk:tool.definition.risk};
  const output=await tool.executor(input,context); return {status:'completed',tool:name,output};
}
module.exports={registerTool,getTool,listTools,executeTool};
