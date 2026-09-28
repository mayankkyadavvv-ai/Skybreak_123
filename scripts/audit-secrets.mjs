import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const excluded=new Set(['node_modules','.git','.vercel','.openai','qa-artifacts']);
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/,/\b(?:ghp_|github_pat_|vercel_)[A-Za-z0-9_]{24,}/,/\b(?:sk_live_|sk-proj-)[A-Za-z0-9_-]{20,}/];
const findings=[];let checked=0;
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 const file=join(dir,entry.name);if(entry.isSymbolicLink()){findings.push(relative('.',file));continue;}
 if(entry.isDirectory()){if(!excluded.has(entry.name))walk(file);}
 else if(/^\.env(?:\.|$)/.test(entry.name) && entry.name!=='.env.example')findings.push(relative('.',file));
 else if(/\.(?:js|mjs|html|css|json|map|txt|md|toml|bat|cmd|py|svg)$/.test(file)){checked++;if(patterns.some(pattern=>pattern.test(readFileSync(file,'utf8'))))findings.push(relative('.',file));}
}}
walk('.');console.log(JSON.stringify({identifiedPrivilegedCredentials:findings.length,locations:findings,checkedFiles:checked,scope:'Project source, configs, docs and built output; dependency/account folders excluded',limitation:'Pattern scan; not a guarantee against all possible secrets.'}));if(findings.length)process.exitCode=1;
