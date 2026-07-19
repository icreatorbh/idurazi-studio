#!/usr/bin/env node
require('./bootstrap');
const { listTools } = require('@idurazi/tool-registry');
const { runWorkflow } = require('@idurazi/workflow-engine');
const { runRuntimeCommand } = require('./runtime-command');
const interview = require('../../examples/workflows/interview-import.json');

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'tools') console.log(JSON.stringify(listTools(), null, 2));
  else if (cmd === 'workflow' && args[0] === 'interview-import') console.log(JSON.stringify(await runWorkflow(interview, {}), null, 2));
  else if (cmd === 'runtime') process.exitCode = await runRuntimeCommand(args);
  else console.log('Commands: tools | workflow interview-import | runtime start|restart|status|health|ping|stop|logs');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
