import readline from 'node:readline';
import {rpc} from './service.mjs';
// MCP stdio adapter. stdout is reserved for protocol messages.
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of lines){try{if(line.length>1024*1024)throw Error('Message too large');const r=await rpc(JSON.parse(line));if(r)process.stdout.write(JSON.stringify(r)+'\n');}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}}
