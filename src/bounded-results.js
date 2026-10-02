'use strict';
function boundedResults(items,{limit=50,max_bytes=12288,metadata={},nextCursor=null}={}){
  if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('limit must be 1–200');
  if(!Number.isInteger(max_bytes)||max_bytes<512||max_bytes>65536)throw new Error('max_bytes must be 512–65536');
  const result={...metadata,elements:[],truncated:false,next_cursor:null};
  const bytes=()=>Buffer.byteLength(JSON.stringify(result));
  if(bytes()>max_bytes)throw new Error('metadata exceeds max_bytes');
  for(const item of items){
    result.elements.push(item);
    result.truncated=true;result.next_cursor=nextCursor;
    if(result.elements.length>limit || bytes()>max_bytes){result.elements.pop();break;}
  }
  result.truncated=result.elements.length<items.length || Boolean(metadata.truncated);
  result.next_cursor=result.truncated ? nextCursor:null;
  if(bytes()>max_bytes)throw new Error('metadata exceeds max_bytes');
  if(items.length && !result.elements.length)throw new Error('max_bytes too small for one element; increase the byte budget');
  return result;
}
module.exports={boundedResults};
