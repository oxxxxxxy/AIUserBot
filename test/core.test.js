const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMessages } = require("../src/prompt");
const { mergeConfig } = require("../src/config-store");
const { parseSse, requestCompletion } = require("../src/llm-client");
test("prompt contains context and maps roles",()=>{const config=mergeConfig({business:{context:"Работаем с 9 до 18"}});const messages=buildMessages(config,[{outgoing:false,text:"Когда?"},{outgoing:true,text:"С девяти."}]);assert.match(messages[0].content,/Работаем с 9 до 18/);assert.deepEqual(messages.slice(1).map((item)=>item.role),["user","assistant"])});
test("parses OmniRoute SSE",()=>{assert.equal(parseSse('data: {"choices":[{"delta":{"content":"При"}}]}\n\ndata: {"choices":[{"delta":{"content":"вет"}}]}\n\ndata: [DONE]\n'),"Привет")});
test("requests JSON completion",async()=>{const fake=async()=>new Response(JSON.stringify({choices:[{message:{content:" OK "}}]}),{status:200,headers:{"content-type":"application/json"}});assert.equal(await requestCompletion({baseUrl:"http://local/v1",apiKey:"k",model:"m",temperature:.4,maxTokens:20},[],fake),"OK")});
