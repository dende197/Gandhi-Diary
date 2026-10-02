const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const esbuild=require('esbuild'),acorn=require('acorn'),postcss=require('postcss'),tailwind=require('tailwindcss');
const root=path.resolve(__dirname,'..'),out=path.join(root,'assets');
const options={minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,target:['safari15','chrome100'],legalComments:'eof'};
async function emit(name,code){const result=await esbuild.transform(code,options);fs.writeFileSync(path.join(out,name+'.js'),result.code);}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const css=await postcss([tailwind(require('./tailwind.config.cjs'))]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;',{from:undefined});
 fs.writeFileSync(path.join(out,'tailwind.css'),(await esbuild.transform(css.css,{loader:'css',minify:true})).code);
 let ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');
 const groups={views:['renderProfile','renderGradesView','renderAcademicProfile'],modals:['showQuickAddTaskModal','showAddRegistroTaskModal','showCompetencyInputModal']};
 const ast=acorn.parse(ui,{ecmaVersion:'latest'}),replacements=[];
 for(const [group,names] of Object.entries(groups)){
  const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&names.includes(n.id.name));
  if(functions.length!==names.length)throw Error('Missing lazy function in '+group);
  await emit('ui-'+group,functions.map(n=>ui.slice(n.start,n.end)).join('\n'));
  for(const n of functions){const name=n.id.name;
   const wrapper=name.startsWith('render') ? `function ${name}(){window.loadFrontendFeature('${group}').then(()=>window.scheduleRender(0)).catch(()=>{});return '<div class="view" style="padding:24px">Caricamento… <button onclick="window.scheduleRender(0)">Riprova</button></div>';}` : `function ${name}(...args){const current=ClientRuntime.capture();return window.loadFrontendFeature('${group}').then(()=>{if(current())return window['${name}'](...args)}).catch(()=>{});}`;
   replacements.push([n.start,n.end,wrapper]);
  }
 }
 for(const [start,end,code] of replacements.sort((a,b)=>b[0]-a[0]))ui=ui.slice(0,start)+code+ui.slice(end);
 await emit('ui',ui);
 for(const name of ['frontend-runtime','push-settings','demo-cleanup','app-bootstrap','fluidity-engine-v3','fluidity-boot-patch'])await emit(name,fs.readFileSync(path.join(root,name+'.js'),'utf8'));
 console.log('Generated static CSS, main scripts and lazy views/modals in assets/.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
