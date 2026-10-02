'use strict';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id);
function decodeMessage(raw){
  if(Buffer.byteLength(raw)>1500000)return null;
  try{const data=JSON.parse(String(raw));return data&&typeof data==='object'&&!Array.isArray(data)?data:null;}catch{return null;}
}
function encodeScreenshot(id,bytes,mime){
  if(!validId(id)||mime!=='image/jpeg'||bytes.length>16*1024*1024)throw new Error('Unsupported or oversized screenshot');
  const header=Buffer.from(JSON.stringify({type:'screenshot',agent_id:'hardfire',command_id:id,mime,ts:Date.now()}));
  const length=Buffer.alloc(4);length.writeUInt32BE(header.length);return Buffer.concat([length,header,bytes]);
}
module.exports={decodeMessage,encodeScreenshot,validId};
