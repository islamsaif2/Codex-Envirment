import fs from 'node:fs';
import vm from 'node:vm';
const path='worker.mjs';
let worker=fs.readFileSync(path,'utf8');
const found=worker.match(/const APP_HTML_B64 = "([^"]+)"/);
if(!found)throw Error('Daily Performance V8: HTML not found');
let html=Buffer.from(found[1],'base64').toString('utf8');
function replaceExactly(before,after,label){
 const idx=html.indexOf(before);
 if(idx<0 || html.indexOf(before,idx+before.length)>=0)throw Error('Daily Performance V8: expected unique '+label+' source anchor not found');
 html=html.replace(before,after);
}
replaceExactly(
 "d.slice(8)+'</time></th>'",
 "new Date(d+'T12:00:00Z').toLocaleDateString('en',{weekday:'long',day:'numeric',timeZone:'UTC'})+'</time></th>'",
 "table day label");
replaceExactly(
 "function dayBusinessCardPicker(keys){\n  return '<div class=\"db-selection-label\">Monthly cards</div><div class=\"db-metrics\" aria-label=\"Monthly cards\">'+keys.map((active,i)=>\n    '<label class=\"db-chip\"><span class=\"db-chip-index\">'+(i+1)+'</span><select data-db-card=\"'+i+'\" aria-label=\"Monthly card '+(i+1)+'\">'+\n    Object.entries(dayBusinessCards).filter(([key])=>key===active||!keys.includes(key)).map(([key,[title]])=>'<option value=\"'+key+'\" '+(key===active?'selected':'')+'>'+title+'</option>').join('')+'</select></label>').join('')+'</div>';\n}",
 "function dayBusinessCardPicker(keys){\n  const maxCards=6;\n  const add=keys.length<maxCards&&Object.keys(dayBusinessCards).some(k=>!keys.includes(k));\n  return '<div class=\"db-selection-label\">Monthly cards <small>('+keys.length+'/'+maxCards+')</small></div><div class=\"db-metrics\" aria-label=\"Monthly cards\">'+keys.map((active,i)=>\n    '<label class=\"db-chip\"><span class=\"db-chip-index\">'+(i+1)+'</span><select data-db-card=\"'+i+'\" aria-label=\"Monthly card '+(i+1)+'\">'+\n    Object.entries(dayBusinessCards).filter(([key])=>key===active||!keys.includes(key)).map(([key,[title]])=>'<option value=\"'+key+'\" '+(key===active?'selected':'')+'>'+title+'</option>').join('')+'</select>'+\n    (keys.length>1?'<button type=\"button\" class=\"db-v8-remove-card\" data-db-card-remove=\"'+i+'\" title=\"Remove monthly card '+(i+1)+'\" aria-label=\"Remove monthly card '+(i+1)+'\">×</button>':'')+'</label>').join('')+\n    (add?'<button type=\"button\" class=\"db-v8-add-card\" data-db-card-add=\"true\" aria-label=\"Add another monthly card\">+ Add monthly card</button>':'')+'</div>';\n}",
 "card picker");
replaceExactly(
 "cards.length===4&&new Set(cards).size===4",
 "cards.length>=1&&cards.length<=6&&new Set(cards).size===cards.length",
 "saved card count");
replaceExactly(
 "panel.querySelectorAll('[data-db-card]').forEach(input=>input.onchange=()=>{\n    state.cards[Number(input.dataset.dbCard)]=input.value;\n    try{localStorage.setItem('ultra-day-business-cards',JSON.stringify(state.cards));}catch{}\n    renderDayBusiness();\n  });",
 "const saveCardChoices=()=>{try{localStorage.setItem('ultra-day-business-cards',JSON.stringify(state.cards));}catch{}renderDayBusiness();};\n  panel.querySelectorAll('[data-db-card]').forEach(input=>input.onchange=()=>{\n    state.cards[Number(input.dataset.dbCard)]=input.value;\n    saveCardChoices();\n  });\n  panel.querySelector('[data-db-card-add]')?.addEventListener('click',()=>{\n    if(state.cards.length>=6)return;\n    const next=Object.keys(dayBusinessCards).find(k=>!state.cards.includes(k));\n    if(next){state.cards.push(next);saveCardChoices();}\n  });\n  panel.querySelectorAll('[data-db-card-remove]').forEach(button=>button.onclick=()=>{\n    if(state.cards.length<=1)return;\n    state.cards.splice(Number(button.dataset.dbCardRemove),1);\n    saveCardChoices();\n  });",
 "add/remove card handlers");
const css=fs.readFileSync('daily-performance-v8.css','utf8');
html=html.replace('</head>','<style id="ultra-daily-performance-v8">'+css+'</style></head>');
for(const [i,m] of [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].entries())
 if(m[1].trim())new vm.Script(m[1],{filename:'daily-performance-v8-inline-'+i});
worker=worker.replace(found[1],Buffer.from(html,'utf8').toString('base64'));
fs.writeFileSync(path,worker);
console.log('Daily Performance V8: weekday labels, 6 selectable monthly cards, paid channel comparison installed');
