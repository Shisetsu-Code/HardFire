import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {verifyOAuth} from '../oauth-verification.mjs';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../.wrangler/test/index.js',import.meta.url)),compatibilityDate:'2026-10-02',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],bindings:{PUBLIC_URL:'https://example.com',MCP_PASSWORD:'test-password'}}));
after(()=>mf.dispose());
test('real Workers OAuth registration, consent, PKCE, tools, refresh and revoke',async()=>{
 await verifyOAuth({base:'https://example.com',request:(url,options)=>mf.dispatchFetch(url,options),password:'test-password',onToken:async token=>{
   const rpc=async(method,params={})=>(await mf.dispatchFetch('https://example.com/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json();
   const initialized=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(initialized.result.serverInfo.name,'HardFire');
   assert.equal((await rpc('tools/list')).result.tools.length,26);
 }});
});
test('consent preserves browser form origin while suppressing cross-site referrers',async()=>{
  const registered=await mf.dispatchFetch('https://example.com/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Browser regression',redirect_uris:['http://127.0.0.1:18453/callback'],token_endpoint_auth_method:'none'})});
  const client=await registered.json();
  const query=new URLSearchParams({client_id:client.client_id,redirect_uri:'http://127.0.0.1:18453/callback',response_type:'code',scope:'browser:control',code_challenge:'Y2hhbGxlbmdlZm9ydGVzdGluZ2Zvcm1zdWJtaXNzaW9u',code_challenge_method:'S256',resource:'https://example.com/mcp'});
  const page=await mf.dispatchFetch('https://example.com/authorize?'+query);
  assert.equal(page.status,200);
  // no-referrer makes browsers send Origin:null for navigation-mode form POSTs.
  assert.equal(page.headers.get('referrer-policy'),'same-origin');
  const html=await page.text();
  assert.match(html,/Cloudflare/);
  assert.match(html,/HardFire/);
  const handle=html.match(/name="handle" value="([^"]+)"/)[1];
  const cookie=page.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const form={method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://example.com',cookie},body:new URLSearchParams({handle,decision:'deny'}).toString()};
  const response=await mf.dispatchFetch('https://example.com/authorize',{...form,redirect:'manual'});
  assert.equal(response.status,302);
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),'access_denied');
});
test('MCP requires OAuth and advertises discovery without accessing the browser',async()=>{
  const response=await mf.dispatchFetch('https://example.com/mcp');
  assert.equal(response.status,401);
  assert.match(response.headers.get('www-authenticate'),/resource_metadata=/);
  const metadata=await mf.dispatchFetch('https://example.com/.well-known/oauth-protected-resource/mcp');
  assert.equal(metadata.status,200);
  assert.equal((await metadata.json()).resource,'https://example.com/mcp');
});
test('authorization rejects cross-origin form submissions',async()=>{
  const response=await mf.dispatchFetch('https://example.com/authorize',{method:'POST',headers:{origin:'https://attacker.example'},body:'decision=approve'});
  assert.equal(response.status,403);
});
test('authorization rejects incorrect passwords',async()=>{
  const response=await mf.dispatchFetch('https://example.com/authorize',{method:'POST',headers:{origin:'https://example.com','content-type':'application/x-www-form-urlencoded'},body:'decision=approve&password=wrong&handle=invalid'});
  assert.equal(response.status,401);
});

