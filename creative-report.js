// Formula-backed daily creative data. Normalization occurs once per five
// minutes per workbook, not on every date range or navigation.
const ultraCreativeSnapshots = new Map();
const ULTRA_CREATIVE_FRESH_MS = 5 * 60_000;
const ULTRA_CREATIVE_STALE_MS = 12 * 60 * 60_000;

async function readCreativeSnapshot(business) {
  const key = business.spreadsheetId;
  const previous = ultraCreativeSnapshots.get(key);
  const age = previous?.data ? Date.now() - previous.data.cachedAt : Infinity;
  if(previous?.data && age < ULTRA_CREATIVE_FRESH_MS) return previous.data;

  function refresh() {
    const cached = ultraCreativeSnapshots.get(key);
    if(cached?.pending) return cached.pending;
    const pending = (async()=>{
        const mapping=parseWebsiteMapping(await readPublicSheet(business.spreadsheetId,'Website Mapping and Metrics','A1:G180'));
        if(!mapping.has('creativeAnalysis.range'))throw Error('Creative Analysis mapping is missing.');
        const range=mapRange(mapping,'creativeAnalysis.range');
        const raw=await readPublicSheet(business.spreadsheetId,range.sheet,range.value);
        if(raw.some(r=>r.some(v=>/^#(REF!|VALUE!|ERROR!|N\/A)/.test(String(v)))))throw Error('The creative reporting formula needs attention. Check Meta & GA4 Reporting CL8.');
        const headers=raw[0]||[];
        // Google Visualization may coerce the literal Date header to null because
        // nearly all remaining cells contain actual date values.
        const hasHeader=['Ad Name','Ad Id','Amount spent'].every((name,i)=>
          String(headers[i+1]??'').trim()===name);
        if(!hasHeader)throw Error('Creative reporting columns do not match the mapping.');
        const optional=v=>{if(v==null||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null;};
        const records=raw.slice(1).map(r=>({date:dateCandidates(r[0])[0],name:String(r[1]||''),id:String(r[2]||''),spend:optional(r[3]),cpm:optional(r[4]),ctr:optional(r[5]),purchases:optional(r[6]),thumbnail:String(r[7]||''),frequency:optional(r[8]),messages:optional(r[9]),plays3:optional(r[10]),video25:optional(r[11]),video50:optional(r[12]),video75:optional(r[13]),video100:optional(r[14]),avgTime:optional(r[15]),videoPlays:optional(r[16]),ranking:String(r[17]||''),creativeUrl:String(r[19]||''),engagements:optional(r[18]),campaign:String(r[20]||''),adset:String(r[21]||''),clicks:optional(r[22]),impressions:optional(r[23]),linkClicks:optional(r[24]),frequencyWeight:optional(r[25]),timeWeight:optional(r[26]),ctrWeight:optional(r[27])})).filter(r=>r.date&&r.id);
      
      const availableFrom=records.reduce((a,r)=>!a||r.date<a?r.date:a,'');
      const availableThrough=records.reduce((a,r)=>r.date>a?r.date:a,'');
      const latest=new Map();
      for(const r of records) {
        const x=latest.get(r.id);
        if(r.thumbnail && (!x || r.date>x.date)) latest.set(r.id,r);
      }
      return {records, range:range.sheet, cachedAt:Date.now(), availableFrom,availableThrough,latest};
    })();
    ultraCreativeSnapshots.set(key,{data:cached?.data||null,pending});
    pending.then(data=>{
      ultraCreativeSnapshots.delete(key);
      ultraCreativeSnapshots.set(key,{data,pending:null});
      while(ultraCreativeSnapshots.size>5)ultraCreativeSnapshots.delete(ultraCreativeSnapshots.keys().next().value);
      console.log("[creative-cache] Indexed",data.records.length,"records");
    },error=>{
      ultraCreativeSnapshots.set(key,{data:cached?.data||null,pending:null});
      console.warn("[creative-cache] Refresh failed",error?.message||String(error));
    });
    return pending;
  }

  if(previous?.data && age < ULTRA_CREATIVE_STALE_MS) {
    // Return immediately with last-good creative records.
    refresh().catch(()=>{});
    return previous.data;
  }
  try { return await refresh(); }
  catch(error){ if(previous?.data)return previous.data; throw error; }
}

async function buildCreativeReport(business,start,end){
  const {records,range,latest,availableFrom,availableThrough}=await readCreativeSnapshot(business);
  if(!start)start=availableFrom;
  if(!end)end=availableThrough;
  const span=Math.round((Date.parse(end)-Date.parse(start))/864e5)+1;
  if(!Number.isFinite(span)||span<1)throw Error('Choose a valid date range.');
  const prevEnd=new Date(Date.parse(start)-864e5).toISOString().slice(0,10);
  const prevStart=new Date(Date.parse(start)-span*864e5).toISOString().slice(0,10);
  const selected=records.filter(r=>r.date>=prevStart&&r.date<=end).map(r=>({
    ...r,thumbnail:latest.get(r.id)?.thumbnail||r.thumbnail
  }));
  return {records:selected,start,end,prevStart,prevEnd,source:range,availableFrom,availableThrough};
}
