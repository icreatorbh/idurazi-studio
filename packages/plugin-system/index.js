const plugins=new Map();
function registerPlugin(plugin){ if(!plugin?.id || typeof plugin.activate!=='function') throw new Error('Invalid plugin'); plugins.set(plugin.id,plugin); }
async function activatePlugins(context){ for(const plugin of plugins.values()) await plugin.activate(context); }
function listPlugins(){ return [...plugins.values()].map(({id,name,version})=>({id,name,version})); }
module.exports={registerPlugin,activatePlugins,listPlugins};
