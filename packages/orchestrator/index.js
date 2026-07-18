const {listTools,executeTool}=require('@idurazi/tool-registry');
const {runWorkflow}=require('@idurazi/workflow-engine');
class Orchestrator {
  constructor({planner}){ this.planner=planner; }
  async plan(request,context={}){ return this.planner({request,tools:listTools(),context}); }
  async executePlan(plan,context={}){
    const results=[]; for(const action of plan.actions||[]) results.push(await executeTool(action.tool,action.input,context)); return results;
  }
  runWorkflow(workflow,input,context){ return runWorkflow(workflow,input,context); }
}
module.exports={Orchestrator};
