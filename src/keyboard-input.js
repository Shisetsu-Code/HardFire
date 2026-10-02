'use strict';
const modifiers={Alt:1,Control:2,Meta:4,Shift:8};
const keys={Enter:13,Tab:9,Backspace:8,Delete:46,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35,PageUp:33,PageDown:34,Space:32};
function parseKey(value){
  if(typeof value!=='string'||!value||value.length>60)throw new Error('invalid_key');
  const parts=value.split('+');const key=parts.pop();
  if(parts.length>3||new Set(parts).size!==parts.length||parts.some(p=>!modifiers[p])||(!keys[key]&&!/^[a-zA-Z0-9]$/.test(key)))throw new Error('invalid_key');
  return {key:key==='Space'?' ':key,parts,modifiers:parts.reduce((mask,p)=>mask|modifiers[p],0),code:keys[key]||key.toUpperCase().charCodeAt(0)};
}
async function press(connection,{key,sessionId}={}){
  const parsed=parseKey(key);const held=[];let mask=0;let keySent=false;
  try{
    for(const modifier of parsed.parts){held.push(modifier);mask|=modifiers[modifier];await connection.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:modifier,modifiers:mask},sessionId);}
    keySent=true;
    await connection.send('Input.dispatchKeyEvent',{type:'keyDown',key:parsed.key,windowsVirtualKeyCode:parsed.code,modifiers:mask,
      ...(!mask || mask===8 ? {text:parsed.key==='Enter'?'\r':parsed.key.length===1?parsed.key:''}:{})},sessionId);
  }finally{
    if(keySent)await connection.send('Input.dispatchKeyEvent',{type:'keyUp',key:parsed.key,windowsVirtualKeyCode:parsed.code,modifiers:mask},sessionId).catch(()=>{});
    for(const modifier of held.reverse()){mask&=~modifiers[modifier];await connection.send('Input.dispatchKeyEvent',{type:'keyUp',key:modifier,modifiers:mask},sessionId).catch(()=>{});}
  }
  return {pressed:key};
}
module.exports={press,parseKey};
