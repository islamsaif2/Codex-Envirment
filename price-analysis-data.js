const priceAnalysisCache=new Map();
function buildPriceAnalysisData(headers,priceRows,orderRows,pageRows,config={}){
  const C=PriceChangeCore;
  const priceDates=headers.map(C.date),dates=[...new Set(priceDates.filter(Boolean))].sort();
  if(!dates.length)throw Error('Price History has no dated price columns. Check Header row in Automation Settings.');
  const table=new Map(),pageDays=new Set(),orderDays=new Set();
  const blank=date=>({date,price:null,orders:0,sessions:null,revenue:0,units:0,unitsExact:true,revenueExact:true,deliveredOrders:0,returnedOrders:0,deliveredRevenue:0});
  for(const row of priceRows){
    if(!row[0]||C.key(row[0])==='product')continue;
    const id=C.key(row[0]);if(!id)continue;
    const item={id,name:String(row[0]),image:'',map:new Map()};
    for(let col=1;col<priceDates.length;col++){
      const date=priceDates[col];if(!date)continue;
      const raw=row[col],price=typeof raw==='number'?raw:/^\s*[\d,.]+\s*$/.test(String(raw??''))?C.number(raw):null;
      const value=item.map.get(date)||blank(date);value.price=price>0?price:null;item.map.set(date,value);
    }
    table.set(id,item);
  }
  const find=(headers,candidates,fallback)=>{const i=headers.findIndex(h=>candidates.includes(C.key(h)));return i<0?fallback:i;};
  const oh=orderRows[0]||[],ph=pageRows[0]||[];
  const ix={date:config.orderDate??find(oh,['day','date'],0),order:config.orderId??find(oh,['order','order id'],1),
    products:config.orderProducts??find(oh,['sales product title unit price'],11),quantity:config.orderQuantity??find(oh,['items quantity in cart'],24),
    discount:config.orderDiscount??find(oh,['discounts'],20),shipping:find(oh,['total shipping charges'],19),shippingNet:find(oh,['shipping price after discount'],33),
    status:find(oh,['order status'],38)};
  const seen=new Set();
  for(const row of orderRows.slice(1)){
    const date=C.date(row[ix.date]),order=String(row[ix.order]??'').trim();if(!date||!order)continue;
    const identity=date+'|'+order;if(seen.has(identity))continue;seen.add(identity);orderDays.add(date);
    const lines=String(row[ix.products]??'').split(/\n/).map(line=>{const m=line.match(/^(.*),\s*EGP\s*([\d,.]+)\s*$/i);return m?{id:C.key(m[1]),price:C.number(m[2])}:null;}).filter(Boolean);
    if(!lines.length)continue;
    const quantity=C.number(row[ix.quantity]),ids=new Set(lines.map(l=>l.id));
    const exact=ids.size===1||quantity===lines.length;
    const multiplier=ids.size===1&&quantity>0?quantity/lines.length:1;
    const subtotal=lines.reduce((s,l)=>s+l.price*multiplier,0);
    const shipping=C.number(row[ix.shipping]),shippingNet=C.number(row[ix.shippingNet]);
    const shippingDiscount=shipping!==null&&shippingNet!==null?Math.max(0,shipping-shippingNet):0;
    const discount=Math.max(0,(C.number(row[ix.discount])||0)-shippingDiscount);
    const adjustment=exact&&subtotal>0?Math.max(0,1-discount/subtotal):1;
    const status=C.key(row[ix.status]);
    for(const id of ids){
      const item=table.get(id);if(!item)continue;
      const value=item.map.get(date)||blank(date),own=lines.filter(l=>l.id===id);
      if(value.price>0&&own.some(l=>Math.abs(l.price-value.price)>.011))value.priceComparable=false;
      value.orders++;value.units+=own.length*multiplier;value.unitsExact=value.unitsExact&&exact;
      value.revenue+=own.reduce((s,l)=>s+l.price*multiplier*adjustment,0);value.revenueExact=value.revenueExact&&exact;
      if(status==='delivered'){value.deliveredOrders++;value.deliveredRevenue+=own.reduce((s,l)=>s+l.price*multiplier*adjustment,0);}
      if(['returned','returned to business'].includes(status))value.returnedOrders++;
      item.map.set(date,value);
    }
  }
  const pi={date:config.pageDate??find(ph,['day','date'],0),title:config.pageTitle??find(ph,['page title'],1),sessions:config.pageSessions??find(ph,['sessions'],2),path:config.pagePath??find(ph,['page path'],9)};
  for(const row of pageRows.slice(1)){
    const date=C.date(row[pi.date]);if(!date)continue;pageDays.add(date);
    if(!/^\/products\//i.test(String(row[pi.path]||'')))continue;
    const title=String(row[pi.title]??'');
    let item=table.get(C.key(title));
    // Match a store-name suffix without assuming this business is Ultramedix.
    if(!item){const parts=title.split(/\s+[–—|]\s+/);while(parts.length>1&&!item){parts.pop();item=table.get(C.key(parts.join(' – ')));}}
    if(!item)continue;
    const value=item.map.get(date)||blank(date),sessions=C.number(row[pi.sessions]);
    if(sessions!==null)value.sessions=(value.sessions||0)+Math.max(0,sessions);item.map.set(date,value);
  }
  const today=config.today||new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date());
  const end=[...dates,...pageDays,...orderDays].filter(d=>d<today).sort().at(-1)||dates.at(-1);
  const start=dates[0];
  const allDays=C.days(start,end);
  const products=[...table.values()].map(item=>({id:item.id,name:item.name,image:item.image,checkedTransitions:true,
    daily:allDays.map(date=>{const d=item.map.get(date)||blank(date);if(d.sessions===null&&pageDays.has(date))d.sessions=0;return d;})}));
  // Historical inventory: consolidate duplicate variant rows by normalized size.
  // Blank cells are unknown, never zero. Only sizes with actual snapshots enter
  // the catalog; conflicting populated duplicate records make a size unknown.
  const inventory=config.inventoryRows||[],ih=inventory[0]||[],inventoryDates=ih.map(C.date),stock=new Map();
  const sizeKey=v=>{const k=C.key(v);return ({xsmall:'xs','extra small':'xs',small:'s',medium:'m',large:'l',xlarge:'xl','extra large':'xl',xxlarge:'xxl','2xl':'xxl','3xl':'xxxl'})[k]||k;};
  for(const row of inventory.slice(1)){
    const id=C.key(row[2]),size=sizeKey(row[3]);if(!table.has(id)||!size)continue;
    const vals=new Map();
    for(let j=5;j<inventoryDates.length;j++){const d=inventoryDates[j],v=C.number(row[j]);if(d&&v!==null)vals.set(d,Math.max(0,v));}
    if(!vals.size)continue;
    if(!stock.has(id))stock.set(id,new Map());const sizes=stock.get(id);
    if(!sizes.has(size))sizes.set(size,new Map());const series=sizes.get(size);
    for(const [d,v] of vals){if(!series.has(d))series.set(d,v);else if(series.get(d)!==v)series.set(d,null);}
  }
  // Derive variant demand only from explicitly paired product/size lines.
  // If no reliable pairing exists, equal-size availability is exposed as fallback.
  const variantCol=find(oh,['product variant only','variant only','product variant'],32),demand=new Map(),seenVariants=new Set();
  for(const row of orderRows.slice(1)){
    const d=C.date(row[ix.date]),oid=String(row[ix.order]??'').trim();if(!d||!oid||seenVariants.has(d+'|'+oid))continue;seenVariants.add(d+'|'+oid);
    const lines=String(row[ix.products]??'').split(/\n/).filter(Boolean),variants=String(row[variantCol]??'').split(/\n/).filter(Boolean);
    if(lines.length!==variants.length)continue;
    for(let i=0;i<lines.length;i++){const m=lines[i].match(/^(.*),\s*EGP\s*[\d,.]+\s*$/i);if(!m)continue;const id=C.key(m[1]),size=sizeKey(variants[i]);if(!stock.get(id)?.has(size))continue;if(!demand.has(id))demand.set(id,[]);demand.get(id).push({date:d,size});}
  }
  for(const p of products){
    const sizes=stock.get(p.id);if(!sizes)continue;
    const entries=demand.get(p.id)||[];
    for(const day of p.daily){
      const known=[...sizes].filter(([k,m])=>Number.isFinite(m.get(day.date)));
      day.stockCoverage=known.length/sizes.size;
      if(!known.length)continue;
      const prior=entries.filter(r=>r.date<day.date&&r.date>=C.shift(day.date,-28)),weights=new Map();
      for(const r of prior)weights.set(r.size,(weights.get(r.size)||0)+1);
      // All-zero evidence applies only to the populated size set, with full coverage.
      day.stockUnits=known.reduce((n,[k,m])=>n+m.get(day.date),0);
      if(known.length!==sizes.size)continue;
      const weighted=prior.length>0,den=weighted?prior.length:sizes.size;
      day.availability=known.reduce((n,[k,m])=>n+(m.get(day.date)>0?(weighted?(weights.get(k)||0):1):0),0)/den;
      day.availabilityMethod=weighted?'prior 28-day matched variant order lines':'equal size weights';
    }
  }
  return {products,start,end,generatedAt:new Date().toISOString(),stockAdjusted:stock.size>0,
    sources:{prices:config.priceSheet||'Price History',orders:config.orderSheet||'Order Tracking Details',sessions:config.pageSheet||'D by D Pages Analysis'},
    definitions:{conversion:'Unique Shopify orders containing a product / GA4 product-page sessions. Not session-attributed purchases.',note:'Inventory snapshots joined by product and size; missing or conflicting stock remains unknown.'}};
}
async function readPriceAnalysis(env,business){
  const id=business.spreadsheetId,existing=priceAnalysisCache.get(id);
  if(existing&&existing.until>Date.now())return existing.pending;
  const read=(sheet,range)=>env.readLocalOrders?env.readLocalOrders(id,sheet,range,(i,t,r)=>readPublicSheet(i,t,r)).then(x=>x.rows):readPublicSheet(id,sheet,range);
  const pending=(async()=>{
    const [mappingRows,location,positions]=await Promise.all([
      read('Website Mapping and Metrics','A1:G180'),
      read('Automation Settings','W16:W16').catch(()=>[]),read('Automation Settings','W37:W38').catch(()=>[])
    ]);
    const mapping=parseWebsiteMapping(mappingRows),orders=mapRange(mapping,'orders.range'),pages=mapRange(mapping,'pages.range');
    const priceSheet=String(location[0]?.[0]||'Price History'),headerRow=Number(positions[0]?.[0])||1,firstRow=Number(positions[1]?.[0])||headerRow+1;
    const [headerRaw,orderRows,pageRows,imageRows,inventoryRows]=await Promise.all([
      read(priceSheet,'A'+headerRow+':ZZZ'+headerRow),
      read(orders.sheet,orders.sheet==='Order Tracking Details'?'A1:BA':orders.value),read(pages.sheet,pages.value),
      mapping.has('inventoryImages.range')?read(mapRange(mapping,'inventoryImages.range').sheet,mapRange(mapping,'inventoryImages.range').value).catch(()=>[]):Promise.resolve([]),
      read('Inventory History','A1:ZZ1000').catch(()=>[])
    ]);
    const header=headerRaw[0]||[];let last=header.length-1;while(last>0&&!PriceChangeCore.date(header[last]))last--;
    let col='',n=last+1;while(n){n--;col=String.fromCharCode(65+n%26)+col;n=Math.floor(n/26);}
    const priceRows=await read(priceSheet,'A'+firstRow+':'+col);
    const index=(k,r,rows,fallback)=>mapping.has(k)?mapCol(mapping,k,r,rows):fallback;
    const normalizedPages=pages.headerRow===Number(pages.value.match(/\d+/)?.[0])?pageRows:[[],...pageRows];
    const result=buildPriceAnalysisData(header,priceRows,orderRows,normalizedPages,{
      priceSheet,orderSheet:orders.sheet,pageSheet:pages.sheet,inventoryRows,
      orderDate:index('orders.date','orders.range',orderRows,0),orderId:index('orders.order','orders.range',orderRows,1),
      orderProducts:index('orders.products','orders.range',orderRows,11),orderQuantity:index('orders.itemsQuantity','orders.range',orderRows,24),
      orderDiscount:index('orders.discount','orders.range',orderRows,20),
      pageDate:index('pages.date','pages.range',pageRows,0),pageTitle:index('pages.title','pages.range',pageRows,1),
      pageSessions:index('pages.sessions','pages.range',pageRows,2),pagePath:index('pages.path','pages.range',pageRows,9)
    });
    const images=new Map();for(const row of imageRows)if(row[1]&&/^https?:\/\//.test(String(row[14]||'')))images.set(PriceChangeCore.key(row[1]),String(row[14]));
    for(const product of result.products)product.image=images.get(product.id)||'';
    return result;
  })();
  priceAnalysisCache.set(id,{pending,until:Date.now()+300000});
  pending.catch(()=>{if(priceAnalysisCache.get(id)?.pending===pending)priceAnalysisCache.delete(id);});
  return pending;
}
