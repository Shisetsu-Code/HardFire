'use strict';
const fs=require('node:fs');const path=require('node:path');
const source=path.resolve(__dirname,'../plugin/HardFire/mcp/tools.json');
const target=path.resolve(__dirname,'../cloudflare/catalog.json');
const catalog=JSON.parse(fs.readFileSync(source,'utf8'));
if(catalog.length!==25||catalog.some(tool=>!tool.name.startsWith('hardfire_')))throw new Error('Unexpected HardFire catalog');
fs.writeFileSync(target,JSON.stringify(catalog,null,2)+'\n');console.log('Exported '+catalog.length+' HardFire tools');
