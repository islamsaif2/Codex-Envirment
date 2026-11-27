import {addDays,localToday,ratio} from './core.mjs';
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function predict(rows,date,model){const last=rows.at(-1)?.date;if(!last)return null;const recent=rows.filter(r=>r.date>=addDays(last,-27));const same=recent.filter(r=>new Date(r.date).getUTCDay()===new Date(date).getUTCDay());return mean((model==='weekday'&&same.length>=3?same:recent).map(r=>r.value));}
export function observedForecast(rows,{today=localToday('Africa/Cairo'),horizon=7}={}){
 const series=rows.filter(r=>r.date<today&&typeof r.value==='number'&&Number.isFinite(r.value)&&r.value>=0).sort((a,b)=>a.date.localeCompare(b.date));
 if(new Set(series.map(x=>x.date)).size!==series.length)throw Error('Duplicate daily aggregates');
 const through=series.at(-1)?.date,coverage=through?series.filter(r=>r.date>=addDays(through,-27)).length:0;
 if(series.length<56||coverage<26)return {status:'insufficient_observations',observedThrough:through,observations:series.length,recentCoverage:coverage,forecast:[],reason:'تاريخ المصدر أو تغطيته غير كافيين؛ الأيام الناقصة لم تتحول لصفر.'};
 const validation=series.slice(-28,-14),holdout=series.slice(-14),scores={};
 for(const model of ['mean','weekday']){const errors=validation.map(r=>Math.abs(r.value-predict(series.filter(x=>x.date<r.date),r.date,model)));scores[model]=mean(errors);}
 const model=scores.weekday<scores.mean?'weekday':'mean';
 const errors=holdout.map(r=>({actual:r.value,predicted:predict(series.filter(x=>x.date<r.date),r.date,model)}));
 const absolute=errors.map(e=>Math.abs(e.actual-e.predicted)).sort((a,b)=>a-b),radius=absolute[Math.min(absolute.length-1,Math.ceil((absolute.length+1)*.9)-1)];
 return {status:'provisional_observed_projection',model,observedThrough:through,projectionStarts:addDays(through,1),staleDays:Math.max(0,Math.floor((Date.parse(today)-Date.parse(through))/86400000)-1),sourceCertification:'Source observations only; migration identity, completeness and historical stock censoring are not certified',causal:false,publication:'Descriptive projection, not an approved spend recommendation',holdout:{days:errors.length,mae:mean(absolute),wape:ratio(absolute.reduce((a,b)=>a+b,0),errors.reduce((s,x)=>s+x.actual,0)),modelSelection:'Earlier 14 observed days; final 14 observed days held out from model selection'},forecast:Array.from({length:horizon},(_,i)=>{const date=addDays(through,i+1),value=predict(series,date,model);return {date,value,lower:Math.max(0,value-radius),upper:value+radius,band:'Descriptive absolute-error band; not calibrated demand coverage'};})};
}
