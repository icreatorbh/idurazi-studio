const fs=require('node:fs');
function loadSchema(schemaPath){ return fs.readFileSync(schemaPath,'utf8'); }
function createRepository(adapter){ return { query:(sql,params=[])=>adapter.query(sql,params), run:(sql,params=[])=>adapter.run(sql,params) }; }
module.exports={loadSchema,createRepository};
