// Probe Google Visualization date-range filtering without outputting private row data.
const base='https://docs.google.com/spreadsheets/d/1bWPoTD6FZ7vr2cfYcxxvXSbehhEwqWamao5Vgu5kR3E/gviz/tq';
async function probe(range,tq){
 const u=new URL(base);
 u.searchParams.set('tqx','out:json');u.searchParams.set('headers','0');
 u.searchParams.set('sheet','Raw Ga4 & Meta Ads Data');
 u.searchParams.set('range',range);u.searchParams.set('tq',tq);
 const started=Date.now();
 try{
  const resp=await fetch(u,{signal:AbortSignal.timeout(110000)});
  const t=await resp.text(),a=t.indexOf('{'),b=t.lastIndexOf('}');
  const p=JSON.parse(t.slice(a,b+1));
  const row=p.table?.rows?.[0]?.c?.[0];
  console.log(JSON.stringify({range,query:tq,status:resp.status,gviz:p.status,rows:p.table?.rows?.length,
    firstValueType:typeof row?.v,firstDateLike:/Date\(/.test(String(row?.v)),error:p.errors?.[0]?.detailed_message,
    durationMs:Date.now()-started}));
 }catch(e){console.log(JSON.stringify({range,query:tq,error:e.message,durationMs:Date.now()-started}));}
}
await probe('A3:Q',"select * where A >= date '2026-11-05' and A <= date '2026-11-11'");
await probe('AR3:BC',"select * where AR >= date '2026-11-05' and AR <= date '2026-11-11'");
await probe('AR3:BC',"select * where A >= date '2026-11-05' and A <= date '2026-11-11'");
