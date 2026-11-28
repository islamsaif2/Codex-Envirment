import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const original=fs.readFileSync(new URL('../Code.gs',import.meta.url),'utf8');
const pages=fs.readFileSync(new URL('../Pages.gs',import.meta.url),'utf8');
function context(extra={}) { const c=vm.createContext({console,...extra}); vm.runInContext(original+'\n'+pages,c); return c; }
function row(day,title,path,sessions=10){return [day,title,sessions,9,.9,.1,60,8,3,path,5];}
function apply(existing,plan){
  const grid=[['title'],['headers'],[],...existing.map(r=>r.slice())];
  for(const request of plan.requests){
    if(request.copyPaste){const {source:s,destination:d}=request.copyPaste;const copied=grid.slice(s.startRowIndex,s.endRowIndex).map(r=>r.slice(0,11));copied.forEach((r,i)=>{grid[d.startRowIndex+i]=r;});}
    if(request.updateCells){const u=request.updateCells,r=u.range;for(let i=r.startRowIndex;i<r.endRowIndex;i++)grid[i]=(u.rows?.[i-r.startRowIndex]?.values||[]).map(c=>c.userEnteredValue.numberValue??c.userEnteredValue.stringValue);}
  } return grid;
}
test('query matches page dimensions, Egypt and seven exact metrics',()=>{
  const c=context(),q=c.gp4Request_('2026-11-28',1000);
  assert.deepEqual(Array.from(q.dimensions,x=>x.name),['date','pageTitle','pagePath']);
  assert.equal(q.dimensionFilter.filter.stringFilter.value,'EG');assert.equal(q.offset,'1000');assert.equal(q.metrics.length,7);
});
test('same path with different page titles remains distinct and Old Users matches example',()=>{
  const c=context(),r=c.gp4Row_({dimensionValues:[{value:'20261127'},{value:'Ultramedix'},{value:'/'}],metricValues:[677,660,.9748892171,.02511078287,66.79833343,579,274].map(value=>({value:String(value)}))},'2026-11-27');
  assert.equal(r[10],305);assert.notEqual(c.gp4Key_(r),c.gp4Key_(row('2026-11-27','Page 2','/')));
});
test('new day shifts history within A:K and leaves row 3 blank',()=>{
 const c=context(),old=[row('2026-11-27','A','/a'),row('2026-11-26','B','/b')],fresh=[row('2026-11-28','C','/c')];
 const plan=c.gp4Publication_({sheetId:1},old,'2026-11-28',fresh),grid=apply(old,plan);
 assert.deepEqual(grid[2],[]);assert.equal(grid[3][0],46354);assert.deepEqual(grid[4],old[0]);assert.deepEqual(grid[5],old[1]);
 assert.equal(plan.requiredRows,6);assert.equal(plan.requests[0].copyPaste.source.endColumnIndex,11);
});
test('changed day with fewer regions/pages shifts tail up and clears obsolete final row',()=>{
 const c=context(),old=[row('2026-11-28','A','/a'),row('2026-11-28','B','/b'),row('2026-11-27','C','/c')];
 const grid=apply(old,c.gp4Publication_({sheetId:1},old,'2026-11-28',[row('2026-11-28','D','/d')]));
 assert.equal(grid[3][1],'D');assert.deepEqual(grid[4],old[2]);assert.deepEqual(grid[5],[]);
});
test('successful empty day removes previous rows but preserves other days',()=>{
 const c=context(),old=[row('2026-11-28','A','/a'),row('2026-11-27','B','/b')];
 const grid=apply(old,c.gp4Publication_({sheetId:1},old,'2026-11-28',[]));assert.deepEqual(grid[3],old[1]);assert.deepEqual(grid[4],[]);
});
test('replacement of equal size does not move history',()=>{
 const c=context(),old=[row('2026-11-28','A','/a'),row('2026-11-27','B','/b')];
 const p=c.gp4Publication_({sheetId:1},old,'2026-11-28',[row('2026-11-28','A','/a',20)]);assert.equal(p.requests.length,1);assert.equal(p.requests[0].updateCells.range.startRowIndex,3);
});
test('pagination failure cannot return partial publication',()=>{
 let calls=0;const c=context({AnalyticsData:{Properties:{runReport:()=>{calls++;return {dimensionHeaders:['date','pageTitle','pagePath'].map(name=>({name})),metricHeaders:['sessions','engagedSessions','engagementRate','bounceRate','averageSessionDuration','totalUsers','newUsers'].map(name=>({name})),rowCount:2,rows:calls===1?[{dimensionValues:[{value:'20261128'},{value:'A'},{value:'/a'}],metricValues:[10,9,.9,.1,60,8,3].map(value=>({value:String(value)}))}]:[]};}}}});
 assert.throws(()=>c.gp4Fetch_({propertyId:'1'},'2026-11-28',Date.now()),/pagination ended/);
});
test('native dates normalize while duplicate keys and unsorted dates fail',()=>{
 const c=context();assert.equal(c.gp4Normalize_([[46354,'A',10,9,.9,.1,60,8,3,'/a']])[0][0],'2026-11-28');
 assert.throws(()=>c.gp4Normalize_([row('2026-11-27','A','/a'),row('2026-11-28','B','/b')]),/newest first/);
 assert.throws(()=>c.gp4Normalize_([row('2026-11-28','A','/a'),row('2026-11-28','A','/a')]),/Duplicate/);
});
