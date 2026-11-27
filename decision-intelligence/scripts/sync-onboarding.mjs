import fs from 'node:fs/promises';
import {parseCostAnswer} from '../src/costs.mjs';
const config=JSON.parse(await fs.readFile(new URL('../config/business.json',import.meta.url),'utf8'));
const url=new URL(`https://docs.google.com/spreadsheets/d/${config.sourceSpreadsheetId}/gviz/tq`);
for(const [k,v] of Object.entries({tqx:'out:json',headers:'0',sheet:'Decision Intelligence Setup',range:'A7:H99',tq:'select B,G'}))url.searchParams.set(k,v);
const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('Onboarding read failed');
const text=await r.text(),p=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));if(p.status!=='ok')throw Error('Onboarding read failed');
const modelPath=new URL('../config/business-model.json',import.meta.url),m=JSON.parse(await fs.readFile(modelPath,'utf8'));
const answers=new Map(p.table.rows.map(r=>[r.c?.[1]?.v,r.c?.[0]?.v??null]));
const registryPath=new URL('../config/demo-onboarding.json',import.meta.url),registry=JSON.parse(await fs.readFile(registryPath,'utf8'));
for(const q of m.questions){if(!answers.has(q.id))throw Error('Question ID missing from rebuilt onboarding: '+q.id);q.answer=answers.get(q.id);q.status=q.answer===null||q.answer===''?'unanswered':'trial_selection';const entry=registry.questions.find(x=>x.id===q.id);if(entry){if(entry.inputKind&&entry.inputKind!=='choice'){entry.typedAnswer=parseCostAnswer(q.id,q.answer);entry.selectedLabel=q.answer===null?'':String(q.answer);q.status=entry.typedAnswer.status;continue;}const option=entry.options.find(o=>o.label===q.answer);if(q.answer&&!option)throw Error('Answer is not a valid dropdown choice: '+q.id);entry.selectedKey=option?.key??null;entry.selectedLabel=option?.label??'';}}
await fs.writeFile(registryPath,JSON.stringify(registry,null,2));
m.onboardingReadAt=new Date().toISOString();await fs.writeFile(modelPath,JSON.stringify(m,null,2));
console.log(JSON.stringify({questions:m.questions.length,answered:m.questions.filter(q=>q.status==='trial_selection').length,autoApplied:false}));
