const inventoryMonthlyCache = new Map();
function inventoryKey(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function inventorySize(value) {
  const size=inventoryKey(value).replace(/\s+/g,'');
  return ({small:'s',medium:'m',large:'l',xsmall:'xs',extrasmall:'xs',xlarge:'xl',extralarge:'xl',xxlarge:'xxl','2xl':'xxl',xxxlarge:'xxxl','3xl':'xxxl'})[size]||size;
}
function inventoryDay(value) {
  if(typeof value==='number'&&value>20000&&value<100000)return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  const text=String(value??'').trim();
  const gviz=text.match(/^Date\((\d+),(\d+),(\d+)/);
  if(gviz)return [gviz[1],String(+gviz[2]+1).padStart(2,'0'),String(+gviz[3]).padStart(2,'0')].join('-');
  return /^\d{4}-\d{2}-\d{2}/.test(text)?text.slice(0,10):null;
}
function inventoryNumber(value) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(String(value).replace(/,/g,''));
  return Number.isFinite(n)?Math.max(0,n):null;
}
function estimateInventoryDemand(eligible,day) {
  const time=Date.parse(day); const distance=x=>(time-(x.time??Date.parse(x.date)))/86400000;
  const recent=eligible.filter(x=>distance(x)>=1&&distance(x)<=28);
  const older=eligible.filter(x=>distance(x)>28&&distance(x)<=118);
  const rate=rows=>rows.reduce((n,x)=>n+x.units,0)/rows.length;
  const hasRecent=recent.length>=7,hasOlder=older.length>=14;
  const age=eligible.length?distance(eligible.at(-1)):null;
  if(hasRecent&&hasOlder)return {demand:.7*rate(recent)+.3*rate(older),model:'70/30',age,confidence:'Reliable'};
  if(hasRecent)return {demand:rate(recent),model:'Recent only',age,confidence:'Recent only'};
  if(hasOlder)return {demand:rate(older),model:'Historical fallback',age,confidence:age>60?'Low confidence':'Historical fallback'};
  const fallback=eligible.filter(x=>distance(x)>28&&distance(x)<=365).slice(-90);
  if(fallback.length>=14)return {demand:rate(fallback),model:'Historical fallback',age,confidence:'Low confidence'};
  return {demand:null,model:'Insufficient Data',age,confidence:'Insufficient Data'};
}
function buildMonthlyInventory(history,orderRows,today) {
  const variants=new Map();
  const nameIds=new Map(),sales=new Map(),uncertainSales=new Set(),badUnits=new Set(),sold=new Map();
  const addAlias=(product,size,id)=>{
    const key=inventoryKey(product)+'|'+inventorySize(size);
    if(!nameIds.has(key))nameIds.set(key,new Set());
    nameIds.get(key).add(id);
  };
  const dates=(history[0]||[]).map(inventoryDay);
  let duplicateConflicts=0;
  const records=history.slice(1).filter(row=>row[1]&&row[2]).map(row=>({
    row,rank:dates.reduce((n,date,col)=>n+(col>=5&&date&&date<today&&inventoryNumber(row[col])!==null?1:0),0)
  }));
  for(const {row,rank} of records){
    const product=String(row[2]),size=inventorySize(row[3]);
    const key=inventoryKey(product)+'|'+size;
    let item=variants.get(key);
    if(!item){item={id:key,product,size,stock:new Map(),ranks:new Map(),conflicts:new Set(),ambiguous:false};variants.set(key,item);}
    addAlias(product,size,key);
    for(let col=5;col<dates.length;col++){
      const date=dates[col],stock=inventoryNumber(row[col]);
      if(!date||date>=today||stock===null)continue;
      const oldRank=item.ranks.get(date);
      // Several temporary Shopify IDs repeat a size in this sheet. Use its
      // most complete history record, with short records filling only gaps.
      if(oldRank===undefined||rank>oldRank){
        item.stock.set(date,stock);item.ranks.set(date,rank);item.conflicts.delete(date);
      }else if(rank===oldRank&&item.stock.get(date)!==stock)item.conflicts.add(date);
    }
  }
  duplicateConflicts=[...variants.values()].reduce((n,v)=>n+v.conflicts.size,0);
  const headers=orderRows[0]||[];
  const column=name=>headers.findIndex(h=>inventoryKey(h)===inventoryKey(name));
  const dateCol=column('Day'),linesCol=column('Sales (Product title, Unit price)'),sizeCol=column('Product variant only');
  const qtyCol=column('Items quantity in cart'),orderCol=column('Order');
  const seen=new Set();
  for(const row of orderRows.slice(1)){
    const day=inventoryDay(row[dateCol]),order=String(row[orderCol]||'');
    if(!day||day>=today||!order||seen.has(order))continue;
    seen.add(order);
    const lines=String(row[linesCol]||'').replace(/\r/g,'').split('\n').filter(x=>x.trim());
    const sizes=String(row[sizeCol]||'').replace(/\r/g,'').split('\n');
    const qty=inventoryNumber(row[qtyCol]);
    const titles=lines.map(line=>line.replace(/,\s*(?:(?:EGP|E£|LE|\$)\s*)?[\d,.]+\s*$/i,'').trim());
    const productKeys=[...new Set(titles.map(inventoryKey))];
    const usableQty=Number.isInteger(qty)&&qty>=lines.length&&qty>0;
    const exactLines=usableQty&&sizes.length===lines.length&&(qty===lines.length||lines.length===1);
    if(productKeys.length===1&&usableQty){
      const k=productKeys[0]+'|'+day.slice(0,7);
      sold.set(k,(sold.get(k)||0)+qty);
    }
    for(let i=0;i<lines.length;i++){
      const product=titles[i],key=inventoryKey(product),monthKey=key+'|'+day.slice(0,7);
      const units=lines.length===1&&usableQty?qty:1;
      if(productKeys.length!==1||!usableQty)sold.set(monthKey,(sold.get(monthKey)||0)+units);
      if(!usableQty||productKeys.length>1&&!exactLines)badUnits.add(monthKey);
      const ids=nameIds.get(key+'|'+inventorySize(sizes[i]));
      if(ids?.size!==1||!exactLines){
        if(ids?.size)for(const id of ids)uncertainSales.add(id+'|'+day);
        else for(const variant of variants.values())if(inventoryKey(variant.product)===key)uncertainSales.add(variant.id+'|'+day);
        continue;
      }
      const id=[...ids][0];
      if(!sales.has(id))sales.set(id,new Map());
      const daily=sales.get(id);daily.set(day,(daily.get(day)||0)+units);
      const variant=variants.get(id);
      if(variant&&(!variant.salesStart||day<variant.salesStart))variant.salesStart=day;
    }
  }
  const groups=new Map();
  for(const variant of variants.values()){
    const key=inventoryKey(variant.product);
    if(!groups.has(key))groups.set(key,{name:variant.product,variants:[]});
    groups.get(key).variants.push(variant);
    const eligible=[],series=new Map();
    const keys=[...variant.stock.keys()].sort();
    const start=variant.salesStart&&variant.salesStart<keys[0]?variant.salesStart:keys[0];
    variant.start=start;
    if(!start)continue;
    const end=keys.at(-1),units=sales.get(variant.id)||new Map();
    for(let date=start;date<=end;date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10)){
      const stock=variant.conflicts.has(date)?null:variant.stock.get(date)??null;
      const estimate=estimateInventoryDemand(eligible,date);
      series.set(date,{stock,...estimate});
      // Closing snapshots cannot certify intraday availability. Require positive
      // consecutive observations, enough closing stock and no observed sellout.
      const yesterday=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
      const previous=variant.conflicts.has(yesterday)?null:variant.stock.get(yesterday);
      const unitsToday=units.get(date)||0;
      const threshold=estimate.demand??(eligible.length?eligible.slice(-28).reduce((n,r)=>n+r.units,0)/Math.min(28,eligible.length):1);
      if(!uncertainSales.has(variant.id+'|'+date)&&!variant.ambiguous&&stock>0&&previous>0&&stock>=Math.max(1,threshold,unitsToday)&&previous>=Math.max(1,threshold))eligible.push({date,time:Date.parse(date),units:unitsToday});
    }
    variant.series=series;
  }
  const products=[];
  for(const [key,product] of groups){
    const months=new Set(product.variants.flatMap(v=>[...(v.series?.keys()||[])].map(d=>d.slice(0,7))));
    for(const month of months){
      const first=month+'-01',after=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),1)).toISOString().slice(0,10);
      const last=after<today?after:today;
      let expectedDates=0,expected=0,observed=0,complete=0,stockSum=0,demandDays=0,demand=0,served=0,available=0,lost=0;
      const confidence=new Set(),daily=[];
      for(let date=first;date<last;date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10)){
        const active=product.variants.filter(v=>v.start&&v.start<=date);
        if(!active.length)continue;
        expectedDates++;
        let stock=0,full=true,dayDemand=0,dayLost=0,modelled=0;
        for(const v of active){
          expected++;
          const r=v.series?.get(date);
          if(!r||r.stock===null){full=false;continue;}
          observed++;stock+=r.stock;
          if(r.demand===null||v.ambiguous)continue;
          demandDays++;modelled++;demand+=r.demand;dayDemand+=r.demand;
          served+=Math.min(r.stock,r.demand);
          available+=r.stock>=r.demand?r.demand:0;
          lost+=Math.max(0,r.demand-r.stock);dayLost+=Math.max(0,r.demand-r.stock);
          confidence.add(r.confidence);
        }
        if(full){complete++;stockSum+=stock;}
        daily.push({date,stock:full?stock:null,demand:full&&modelled===active.length?dayDemand:null,lost:full&&modelled===active.length?dayLost:null});
      }
      const coverage=expected?observed/expected:0,modelCoverage=expected?demandDays/expected:0;
      const enough=coverage>=.7&&modelCoverage>=.7;
      products.push({name:product.name,month,avgStock:coverage>=.7&&complete?stockSum/complete:null,
        coverage:enough&&demand>0?served/demand:null,availability:enough&&demand>0?available/demand:null,
        lostUnits:enough?lost:null,unitsSold:sold.get(key+'|'+month)||0,unitsSoldExact:!badUnits.has(key+'|'+month),
        snapshotCoverage:coverage,modelCoverage,completeDays:complete,completeDayCoverage:expectedDates?complete/expectedDates:0,observedVariantDays:observed,expectedVariantDays:expected,
        confidence:!enough?'Insufficient Data':confidence.has('Low confidence')?'Low confidence':confidence.has('Historical fallback')?'Historical fallback':coverage<.9||complete<.9*expectedDates?'Partial history':'Reliable',
        daily});
    }
  }
  return {products,duplicateConflicts,asOf:today,historyResolution:'Product + normalized size; most complete record takes precedence per date. Equal-completeness conflicts remain unknown.',method:'Conditional 70/30 · recent 28d ≥7 eligible days; older preceding 90d ≥14. Historical fallback ≤365d. Closing-snapshot approximation.'};
}
async function readMonthlyInventory(env,business) {
  const key=business.spreadsheetId,old=inventoryMonthlyCache.get(key);
  if(old&&old.until>Date.now())return old.pending;
  const read=(sheet,range)=>readPublicSheet(key,sheet,range);
  const pending=Promise.all([read('Inventory History','A1:ZZ1'),read('Inventory History','A2:ZZ'),read('Order Tracking Details','A1:BA1'),read('Order Tracking Details','A2:BA')])
    .then(([hh,history,oh,orders])=>buildMonthlyInventory([hh[0]||[],...history],[oh[0]||[],...orders],new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date())));
  inventoryMonthlyCache.set(key,{pending,until:Date.now()+300000});
  pending.catch(()=>{if(inventoryMonthlyCache.get(key)?.pending===pending)inventoryMonthlyCache.delete(key);});
  return pending;
}






