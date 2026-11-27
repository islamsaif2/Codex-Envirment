import fs from 'node:fs/promises';
export async function answerRegistry(){return JSON.parse(await fs.readFile(new URL('../config/demo-onboarding.json',import.meta.url),'utf8'));}
export async function translateChoices(selections){
 const registry=await answerRegistry();if(!Array.isArray(selections)||selections.length>100)throw Error('Selections must be a bounded array');const seen=new Set(),normalized={};
 for(const s of selections){if(seen.has(s.questionId))throw Error('Duplicate question');seen.add(s.questionId);const q=registry.questions.find(q=>q.id===s.questionId);if(!q)throw Error('Unknown question');const option=q.options.find(o=>o.key===s.optionKey);if(!option)throw Error('Option does not belong to this question');normalized[q.id]={value:option.value,label:option.label,mode:'demo',usableAsVerifiedFact:false};}
 return {status:'translated_preview',mode:'demo',translator:'deterministic_option_mapping',normalized,appliedToLiveBusiness:false,execution:'disabled',freeTextPolicy:'ChatGPT may propose a structured interpretation, but unsupported or ambiguous free text is not applied. Business approval and typed validation are required for live settings.'};
}
