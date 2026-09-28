import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {parseHTML} from 'linkedom';
import {site} from '../site.config.js';
const root=resolve('dist'),issues=[],pages=readdirSync(root).filter(name=>name.endsWith('.html'));
for(const page of pages){
  const html=readFileSync(join(root,page),'utf8'),{document}=parseHTML(html),title=document.querySelector('title')?.textContent;
  if(!title || !document.querySelector('meta[name="description"]')?.content)issues.push(`${page}: missing metadata`);
  const ids=new Set();for(const node of document.querySelectorAll('[id]')){if(ids.has(node.id))issues.push(`${page}: duplicate id ${node.id}`);ids.add(node.id);}
  const expected=site.origin+(page==='index.html'?'/':'/'+page.slice(0,-5));
  if(document.querySelector('link[rel="canonical"]')?.getAttribute('href')!==expected)issues.push(`${page}: wrong canonical`);
  if(page!=='index.html' && /\/assets\/.+\.js/.test(html))issues.push(`${page}: game JavaScript on public page`);
  if(page!=='index.html' && document.querySelectorAll('h1').length!==1)issues.push(`${page}: expected one h1`);
  for(const node of document.querySelectorAll('[href],[src]')){
    const url=node.getAttribute('href') ?? node.getAttribute('src');if(!url || /^(?:data:|mailto:|https?:)/.test(url))continue;
    const parsed=new URL(url,expected),path=parsed.pathname,file=join(root,path==='/'?'index.html':path.slice(1)+(extname(path)?'':'.html'));
    if(!existsSync(file) || !statSync(file).isFile()){issues.push(`${page}: missing local target ${url}`);continue;}
    if(parsed.hash && file.endsWith('.html')){const target=parseHTML(readFileSync(file,'utf8')).document;if(!target.getElementById(decodeURIComponent(parsed.hash.slice(1))))issues.push(`${page}: missing fragment ${url}`);}
  }
}
const image=readFileSync(join(root,'brand/skybreak-social.png'));
if(image.readUInt32BE(16)!==1200 || image.readUInt32BE(20)!==630)issues.push('Social PNG must be 1200×630');
const sitemap=readFileSync(join(root,'sitemap.xml'),'utf8');for(const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)){const url=new URL(match[1]);if(url.origin!==site.origin)issues.push('Wrong sitemap origin');const page=url.pathname==='/'?'index.html':url.pathname.slice(1)+'.html';if(!pages.includes(page))issues.push('Missing sitemap page');if(/name="robots" content="noindex/.test(readFileSync(join(root,page),'utf8')) && process.env.VERCEL_ENV!=='preview' && process.env.SKYBREAK_PREVIEW!=='1')issues.push('Noindex page in production sitemap');}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log(`Static validation passed: ${pages.length} pages, local targets/fragments, IDs, metadata and 1200×630 social image. Browser accessibility/layout still needs verification.`);
