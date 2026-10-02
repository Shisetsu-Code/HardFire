'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createLauncher}=require('../plugin/HardFire/mcp/launch.cjs');
test('remote and disabled endpoints never try to launch an invalid local installation',async()=>{
  const previous={...process.env};
  try{
    process.env.HARDFIRE_APP_PATH='C:/nonexistent-hardfire-fixture';
    await createLauncher('https://example.invalid/mcp')({headless:false});
    process.env.HARDFIRE_AUTO_START='0';
    await createLauncher('http://127.0.0.1:1/mcp')({headless:true});
    await assert.rejects(createLauncher('http://127.0.0.1:1/mcp')({headless:'false'}),/boolean/);
  }finally{
    for(const key of ['HARDFIRE_APP_PATH','HARDFIRE_AUTO_START'])if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
  }
});
