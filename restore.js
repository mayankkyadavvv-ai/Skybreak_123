/** Restore this source export, including binary brand assets. node restore.js [output-directory] */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(process.argv[2] || here),file=path.join(here,'SKYBREAK_ALL_CODES.md');
if(!fs.existsSync(file))throw new Error('Place SKYBREAK_ALL_CODES.md next to restore.js');
const content=fs.readFileSync(file,'utf8');
const headers=/^### FILE: ([^\n]+)\n\n<!-- sha256: ([a-f0-9]{64}); bytes: (\d+); encoding: (utf8|base64) -->\n\n(`{6,})[^\n]*\n/gm;
const writes=[];let match;
while((match=headers.exec(content))){
 const [,name,hash,length,encoding,fence]=match,start=headers.lastIndex,end=content.indexOf('\n'+fence,start);
 if(end<0)throw new Error('Missing source fence for '+name);
 const parts=name.replaceAll('\\','/').split('/'),target=path.resolve(root,...parts);
 if(!target.startsWith(root+path.sep) || parts.some(part=>['.git','.vercel','node_modules','..'].includes(part) || part.startsWith('.env') && part!=='.env.example'))throw new Error('Unsafe export path');
 const body=content.slice(start,end),bytes=Buffer.from(body,encoding==='base64'?'base64':'utf8').subarray(0,Number(length));
 if(bytes.length!==Number(length) || createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('Integrity check failed for '+name);
 writes.push({target,bytes,name});headers.lastIndex=end+fence.length+1;
}
if(!writes.length)throw new Error('No verified source entries found. Use the matching September 2026 master export.');
// Validate all entries before restoring. Matching files in the chosen directory are overwritten.
fs.mkdirSync(root,{recursive:true});
for(const {target,bytes,name} of writes){
 let current=root;for(const part of path.relative(root,path.dirname(target)).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())throw new Error('Refusing symlink path');}
 if(fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())throw new Error('Refusing symlink file');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
}
console.log(`Restored ${writes.length} SHA-256 verified files to ${root}. Run npm ci, npm test, npm run build.`);
