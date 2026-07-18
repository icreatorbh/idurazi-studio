class IDuraziError extends Error { constructor(code,message,details={}) { super(message); this.name='IDuraziError'; this.code=code; this.details=details; } }
const Risk={LOW:'low',MEDIUM:'medium',HIGH:'high'};
module.exports={IDuraziError,Risk};
