import {writeFileSync} from 'node:fs';
const rgb=hex=>hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const luminance=rgb=>rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05)};
const checks=[['Menu body','#c1d1d7','#081520'],['Panel heading','#edf8fa','#102532'],['Public page body','#c4d4dc','#07121a'],['Public links','#9de7dc','#07121a'],['HUD muted, minimum 72% dark panel over white sky','#c1d1d7',null],['Warning, opaque panel','#ff9a94','#081520']].map(([label,foreground,background])=>{
 const bg=background?rgb(background):rgb('#05111b').map(channel=>channel*.72+1*.28);return {label,foreground,background:background || '72% #05111b over white',contrast:Math.round(ratio(rgb(foreground),bg)*100)/100,required:4.5};
});
const report={method:'WCAG sRGB luminance calculation for listed tokens; not a browser/pixel accessibility scan',checks};
writeFileSync('evidence/contrast.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(checks.some(c=>c.contrast<c.required))process.exitCode=1;
