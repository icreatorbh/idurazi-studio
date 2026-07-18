const {executeTool}=require('@idurazi/tool-registry');
async function runWorkflow(workflow,input={},context={}) {
  const state={input,steps:[],outputs:{}};
  for(const step of workflow.steps){
    const stepInput=typeof step.mapInput==='function'?step.mapInput(state):{...input,...step.input};
    const result=await executeTool(step.tool,stepInput,{...context,approved:context.approvedTools?.includes(step.tool)});
    state.steps.push({id:step.id,tool:step.tool,result});
    state.outputs[step.id]=result.output;
    if(result.status==='approval_required') return {...state,status:'paused_for_approval',pending:step};
    if(result.status!=='completed' && !step.optional) return {...state,status:'failed'};
  }
  return {...state,status:'completed'};
}
module.exports={runWorkflow};
