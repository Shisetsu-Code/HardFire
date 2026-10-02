'use strict';
const path=require('node:path');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
function createLocalClient({bridgePath=path.resolve(__dirname,'../../plugin/HardFire/mcp/bridge.cjs'),nodePath=process.execPath,clientFactory=()=>new Client({name:'hardfire-chatgpt-agent',version:'1.5.1'}),transportFactory}={}){
  let sdk,pending,tools,closed=false;
  async function connect(){
    if(closed)throw new Error('HardFire MCP client closed');
    if(!pending)pending=(async()=>{
      sdk=clientFactory();
      const current=sdk;
      current.onclose=()=>{if(sdk===current){pending=undefined;tools=undefined;sdk=undefined;}};
      const transport=transportFactory ? transportFactory() : new StdioClientTransport({command:nodePath,args:[bridgePath],cwd:path.dirname(bridgePath),env:{...process.env}});
      try{await current.connect(transport);const discovered=(await current.listTools()).tools;if(sdk!==current)throw new Error('MCP disconnected during discovery');tools=discovered;}
      catch(error){await current.close().catch(()=>{});if(sdk===current){sdk=undefined;tools=undefined;pending=undefined;}throw error;}
    })();
    return pending;
  }
  return {
    connect,
    async listTools(){await connect();return tools;},
    async callTool(name,args,{signal}={}){
      await connect();
      if(!tools.some(tool=>tool.name===name))throw new Error('Unknown HardFire tool: '+name);
      return sdk.callTool({name,arguments:args},undefined,{signal,timeout:300000});
    },
    async close(){closed=true;await pending?.catch(()=>{});await sdk?.close();}
  };
}
module.exports={createLocalClient};
