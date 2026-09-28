"""Export reviewed source and build, excluding local/account data. Python 3 standard library."""
import argparse,base64,hashlib,json,re,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1];out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
if not (root/'dist/index.html').is_file(): raise RuntimeError('Run npm run build before exporting.')
excluded={'node_modules','dist','.git','.vercel','.openai','qa-artifacts','__pycache__'}
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}',rb'\b(?:ghp_|github_pat_|vercel_)[A-Za-z0-9_]{24,}',rb'\b(?:sk_live_|sk-proj-)[A-Za-z0-9_-]{20,}']
files=[]
for file in sorted(root.rglob('*')):
    rel=file.relative_to(root)
    if set(rel.parts)&excluded or file==out or out in file.parents: continue
    if file.is_symlink(): raise RuntimeError('Symlink refused: '+str(rel))
    if not file.is_file() or file.suffix=='.zip' or file.name=='SKYBREAK_ALL_CODES.md': continue
    if any(part.startswith('.env') and part!='.env.example' for part in rel.parts): raise RuntimeError('Environment file refused: '+str(rel))
    if any(part.startswith('.') and part not in {'.gitignore','.vercelignore','.env.example'} for part in rel.parts): continue
    data=file.read_bytes()
    if any(re.search(pattern,data) for pattern in patterns): raise RuntimeError('Possible credential; redacted path: '+str(rel))
    files.append((rel.as_posix(),data))
fence='`'*16
master=['# Skybreak — Complete Verified Source\n\nPlace this file next to restore.js. Run `node restore.js [output-directory]` to recreate all files, including binary assets. Matching destination files are overwritten. Credentials, private environment files, dependencies, account state and built output are excluded.\n']
manifest={}
for name,data in files:
    digest=hashlib.sha256(data).hexdigest();manifest[name]={'sha256':digest,'bytes':len(data)}
    try: body=data.decode('utf-8');encoding='utf8';language={'js':'javascript','mjs':'javascript','json':'json','css':'css','html':'html','md':'markdown','py':'python','svg':'xml'}.get(name.rsplit('.',1)[-1],'text')
    except UnicodeDecodeError: body=base64.b64encode(data).decode();encoding=language='base64'
    master.append(f'\n### FILE: {name}\n\n<!-- sha256: {digest}; bytes: {len(data)}; encoding: {encoding} -->\n\n{fence}{language}\n{body}\n{fence}\n')
master_data=''.join(master).encode();(out/'SKYBREAK_ALL_CODES.md').write_bytes(master_data)
with zipfile.ZipFile(out/'skybreak-complete-project(1).zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for name,data in files: archive.writestr(name,data)
    archive.writestr('SKYBREAK_ALL_CODES.md',master_data)
with zipfile.ZipFile(out/'skybreak-deploy-ready.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for file in sorted((root/'dist').rglob('*')):
        if file.is_symlink(): raise RuntimeError('Symlink refused in build')
        if file.is_file():
            data=file.read_bytes()
            if any(re.search(pattern,data) for pattern in patterns): raise RuntimeError('Possible credential in build')
            archive.writestr(file.relative_to(root/'dist').as_posix(),data)
    source_config=json.loads((root/'vercel.json').read_text())
    static_config={'framework':None,'buildCommand':'','installCommand':'','outputDirectory':'.','cleanUrls':True,'headers':source_config['headers']}
    archive.writestr('vercel.json',json.dumps(static_config,indent=2)+'\n')
    archive.writestr('DEPLOYMENT.md','# Skybreak static build\n\nDeployment is requested but not completed here. These are the locally checked prebuilt files, not proof of a live release. Extract this archive before using a compatible static host. For Vercel, the included config skips install/build and serves this directory with the reviewed clean URLs and headers. It does not change project protection. Link only the existing authorized Skybreak project when deployment resumes.\n\nFor further development, use skybreak-complete-project(1).zip. Privacy/Terms are drafts; real-browser, GPU, mobile and live-host acceptance remains pending. A multiplayer WebSocket server is separate; changing its endpoint requires rebuilding the source and synchronizing CSP. See the source HOSTING_GUIDE.md and QA.md.\n')
(out/'skybreak-source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'sourceFiles':len(files),'binaryAssets':sum(1 for n,d in files if n.endswith(('.png','.ico'))),'artifacts':[{ 'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.iterdir()) if p.name in {'SKYBREAK_ALL_CODES.md','skybreak-complete-project(1).zip','skybreak-deploy-ready.zip'}]}))
