import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
export async function verifyOAuth({base,request,password,onToken=async()=>{}}){
 const get=(path,options={})=>request(base+path,{...options,redirect:'manual'});
 assert.equal((await get('/mcp')).status,401);
 const metadata=await (await get('/.well-known/oauth-authorization-server')).json();
 const redirect='http://127.0.0.1:18453/callback';
 const registration=await request(metadata.registration_endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'HardFire verification',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
 assert.equal(registration.status,201);const client=await registration.json();
 const verifier=randomBytes(32).toString('base64url');
 const params=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'browser:control offline_access',state:randomBytes(16).toString('hex'),resource:base+'/mcp',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
 const consent=await get('/authorize?'+params);assert.equal(consent.status,200);
 const html=await consent.text();assert.match(html,/Cloudflare/);
 const handle=html.match(/name="handle" value="([^"]+)"/)?.[1];assert.ok(handle);
 const cookie=consent.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const approve=(value,cookieValue=cookie)=>get('/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin:base,cookie:cookieValue},body:new URLSearchParams({handle,password:value,decision:'approve'})});
 assert.equal((await approve('wrong-password')).status,401);
 assert.equal((await approve(password,'')).status,400);
 const approved=await approve(password);assert.equal(approved.status,302);
 const callback=new URL(approved.headers.get('location'));assert.equal(callback.searchParams.get('state'),params.get('state'));
 const exchange=await request(metadata.token_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier,resource:base+'/mcp'})});
 assert.equal(exchange.status,200);const tokens=await exchange.json();
 try{await onToken(tokens.access_token);}
 finally{
   const refresh=await request(metadata.token_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token,resource:base+'/mcp'})});
   assert.equal(refresh.status,200);const fresh=await refresh.json();
   if(metadata.revocation_endpoint){const revoked=await request(metadata.revocation_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:fresh.refresh_token,token_type_hint:'refresh_token',client_id:client.client_id})});assert.equal(revoked.status,200);}
 }
 return {oauth:true};
}
