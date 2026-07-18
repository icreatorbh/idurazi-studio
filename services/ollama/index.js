async function chat({baseUrl='http://127.0.0.1:11434',model='qwen3:8b',messages,format}){
 const response=await fetch(`${baseUrl}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages,stream:false,format})});
 if(!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`); return response.json();
}
module.exports={chat};
