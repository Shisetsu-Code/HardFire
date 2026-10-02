import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import catalog from '../catalog.json' with {type:'json'};
import {runCommand,commandResult} from './bridge.js';
const resultTool={name:'hardfire_command_result',description:'Read a deferred command result by command_id. Never repeat the original action after a timeout or disconnect.',inputSchema:{type:'object',properties:{command_id:{type:'string',pattern:'^[A-Za-z0-9_.:-]{1,128}$'}},required:['command_id'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}};
export function createServer(env){
  const server=new Server({name:'HardFire',version:'1.5.1'},{capabilities:{tools:{}},instructions:'HardFire controls the local browser on the user PC through an authenticated relay. Start with hardfire_status. Use hardfire_launch with headless true or false; tab_id preserves the target. For running or unknown results, query hardfire_command_result with command_id; never repeat an uncertain click or fill. Keep the local HardFire ChatGPT agent running. Commands, results and requested screenshots pass through Cloudflare. Local Codex MCP remains available independently.'});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...catalog,resultTool].map(tool=>({...tool,_meta:{securitySchemes:[{type:'oauth2',scopes:['browser:control']}]}}))}));
  server.setRequestHandler(CallToolRequestSchema,async({params})=>{
    if(![...catalog,resultTool].some(tool=>tool.name===params.name))throw new Error('Unknown HardFire tool');
    try{return params.name==='hardfire_command_result'?await commandResult(env,params.arguments?.command_id):await runCommand(env,params.name,params.arguments||{});}
    catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
  });
  return server;
}
export async function handleMcp(request,env){
  const server=createServer(env);const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);
  return transport.handleRequest(request);
}
