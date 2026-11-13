(()=>{
const CA={data:null,loading:false,error:'',group:'ad',status:'active',sort:'spend',direction:'desc',search:'',metrics:['spend','purchaseShare','purchases','cpa','ctr','messages'],limit:24,request:0};
const defs={share:['% spend','percent',false],spend:['Amount spent','money',false],purchaseShare:['Contribution % to Purchases','percent',true],purchases:['Purchases','number',true],cpa:['Cost per purchase','money',false],ctr:['Link CTR (est.)','percent',true],cpm:['CPM (est.)','money',false],clicks:['Outbound clicks','number',true],cpc:['Cost / outbound click','money',false],messages:['Messaging conversations','number',true],plays3:['3-second video plays','number',true],video25:['Video plays at 25%','number',true],video50:['Video plays at 50%','number',true],video75:['Video plays at 75%','number',true],video100:['Video plays at 100%','number',true],avgTime:['Average video play time','seconds',true],videoPlays:['Video plays','number',true],engagements:['Post engagements','number',true]};
const safe=u=>{try{const x=new URL(u);return x.protocol==='https:'?x.href:'';}catch{return '';}};
const escCA=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=(key,v)=>{if(v==null||!Number.isFinite(v))return '—';const type=defs[key]?.[1];return type==='percent'?(100*v).toFixed(2)+'%':type==='money'?'EGP '+v.toLocaleString('en',{maximumFractionDigits:2}):type==='seconds'?v.toFixed(2)+' s':v.toLocaleString('en',{maximumFractionDigits:type==='decimal'?2:0});};
function summarize(rows){
 const sum=k=>{const a=rows.map(r=>r[k]).filter(Number.isFinite);return a.length?a.reduce((a,b)=>a+b,0):null;};
 const ratio=(a,b)=>a!=null&&b>0?a/b:null;
 const weighted=(value,weight)=>{const a=rows.filter(r=>Number.isFinite(r[value])&&r[weight]>0);const w=a.reduce((s,r)=>s+r[weight],0);return w?a.reduce((s,r)=>s+r[value]*r[weight],0)/w:null;};
 const out=Object.fromEntries(['spend','purchases','messages','plays3','video25','video50','video75','video100','videoPlays','engagements','clicks'].map(k=>[k,sum(k)]));
 out.cpa=ratio(out.spend,out.purchases);out.cpc=ratio(out.spend,out.clicks);out.cpm=ratio(out.spend==null?null:1000*out.spend,sum('impressions'));out.ctr=ratio(sum('linkClicks'),sum('ctrWeight'));out.avgTime=weighted('avgTime','timeWeight');return out;
}
function groups(){
 const data=CA.data;if(!data)return [];
 const map=new Map();const key=r=>CA.group==='name'?r.name:CA.group==='campaign'?r.campaign:CA.group==='adset'?r.campaign+' / '+r.adset:r.id;
 for(const r of data.records){if(CA.status!=='all'&&(r.status||'unknown')!==CA.status)continue;const k=key(r)||'(Unnamed)';if(!map.has(k))map.set(k,{key:k,name:CA.group==='ad'?r.name:k,now:[],prev:[],ads:new Map()});const g=map.get(k);(r.date>=data.start?g.now:g.prev).push(r);const old=g.ads.get(r.id);if(!old||r.date>old.date)g.ads.set(r.id,r);}
 const nowTotal=summarize(data.records.filter(r=>r.date>=data.start)),prevTotal=summarize(data.records.filter(r=>r.date<data.start));
 return [...map.values()].filter(g=>g.now.length).map(g=>{g.current=summarize(g.now);g.previous=summarize(g.prev);
 
 for(const [stats,totals,rows] of [[g.current,nowTotal,g.now],[g.previous,prevTotal,g.prev]]){
   if(!rows.length){for(const key of ['spend','purchases','messages','clicks','plays3','video25','video50','video75','video100','videoPlays','engagements'])if(totals[key]!=null)stats[key]=0;}
   stats.share=totals.spend>0&&stats.spend!=null?stats.spend/totals.spend:null;
   stats.purchaseShare=totals.purchases>0&&stats.purchases!=null?stats.purchases/totals.purchases:null;
 }return g;}).filter(g=>!CA.search||[g.name,g.key,...[...g.ads.values()].map(r=>r.campaign)].join(' ').toLowerCase().includes(CA.search.toLowerCase())).sort((a,b)=>{const x=a.current[CA.sort],y=b.current[CA.sort];if(x==null)return y==null?a.name.localeCompare(b.name):1;if(y==null)return -1;return (CA.direction==='desc'?y-x:x-y)||a.name.localeCompare(b.name);});
}
function delta(key,now,prev){if(now==null||prev==null||prev===0){
 const label=now==null?'—':prev==null?'No baseline':now===0?'0%':'New';
 const reason=now==null?'Current value unavailable':prev==null?'Previous value unavailable or undefined':'Previous value was zero';
 return '<span class="ca-change neutral" title="'+reason+'">'+label+'</span>';
 }const d=(now-prev)/Math.abs(prev)*100;const neutral=key==='spend'||key==='share';return '<span class="ca-change '+(neutral?'neutral':((d>=0)===defs[key][2]?'good':'bad'))+'" title="Compared with the previous equal-length period">'+(d>0?'+':'')+d.toFixed(0)+'%</span>';}
function media(g){
 // Use only genuine URLs from the sheet. Empty/expired thumbnails should not
 // be confused with missing Facebook creative post links.
 const list=[...g.ads.values()];
 const ads=list.filter(r=>safe(r.thumbnail)).slice(0,4);
 const fb=list.some(r=>safe(r.creativeUrl));
 const empty=fb?"Preview unavailable · Open card for Facebook link":"No thumbnail stored for these ads";
 return '<div class="ca-media '+(ads.length>1?'collage':'')+'">'+
   (ads.length?ads.map(r=>'<img loading="lazy" referrerpolicy="no-referrer" src="'+escCA(safe(r.thumbnail))+'" alt="'+escCA(r.name)+'">').join(''):
    '<span class="ca-no-image">'+escCA(empty)+'</span>')+
   '<span class="ca-count">'+g.ads.size+' '+(g.ads.size===1?'ad':'ads')+'</span></div>';
}
function openDetails(g){
 const d=document.createElement('dialog');d.className='ca-dialog';d.innerHTML='<header><div><h2>'+escCA(g.name)+'</h2><small>'+escCA(CA.data.start)+' – '+escCA(CA.data.end)+'</small></div><button class="btn" aria-label="Close creative details">✕</button></header><div class="ca-detail-grid">'+Object.keys(defs).map(k=>'<div><span>'+escCA(defs[k][0])+'</span><strong>'+display(k,g.current[k])+'</strong>'+delta(k,g.current[k],g.previous[k])+'</div>').join('')+'</div><h3>Ads in this card</h3>'+[...g.ads.values()].map(r=>'<div class="ca-ad-detail">'+(safe(r.thumbnail)?'<img src="'+escCA(safe(r.thumbnail))+'" alt="Creative thumbnail">':'')+'<div><b>'+escCA(r.name)+'</b><small>Ad ID: '+escCA(r.id)+'</small>'+(safe(r.creativeUrl)?'<a target="_blank" rel="noopener noreferrer" href="'+escCA(safe(r.creativeUrl))+'">View original on Facebook ↗</a>':/^\\d{8,}$/.test(String(r.id))?'<a target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/ads/library/?id='+encodeURIComponent(r.id)+'">Find ad in Meta Ad Library ↗</a>':'')+'</div></div>').join('')+'<p class="ca-note">CPM and link CTR use impressions estimated from source spend / CPM. Video play time is weighted by plays. — means no reported value. Comparisons use '+escCA(CA.data.prevStart)+' to '+escCA(CA.data.prevEnd)+'.</p>';
 document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();handleImages(d);
}
function handleImages(root){
 root.querySelectorAll('img').forEach(img=>{
   const fallback=()=>{
     if(!img.dataset.caProxyTried){
       const original=img.dataset.caOriginal||img.currentSrc||img.src;
       img.dataset.caOriginal=original;
       const host=(()=>{try{return new URL(original).hostname.toLowerCase()}catch{return ''}})();
       // Proxy only Meta image CDN URLs; no arbitrary remote hosts.
       if(host==='fbcdn.net'||host.endsWith('.fbcdn.net')||
          host==='cdninstagram.com'||host.endsWith('.cdninstagram.com')){
         img.dataset.caProxyTried='yes';
         img.src='/api/creative-thumbnail?url='+encodeURIComponent(original);
         return;
       }
     }
     img.style.display='none';
     const parent=img.parentElement;
     if(parent&&!parent.querySelector('.ca-image-error')){
       const msg=document.createElement('span');
       msg.className='ca-image-error';
       msg.textContent='Preview unavailable · Open card for the original Facebook link';
       parent.append(msg);
     }
   };
   img.addEventListener('error',fallback);
   if(img.complete&&img.naturalWidth===0)fallback();
 });
}
function cardHeading(group){
 const ads=[...group.ads.values()];
 const statuses=new Set(ads.map(ad=>ad.status||'unknown'));
 const status=statuses.size===1?[...statuses][0]:'mixed';
 const label={active:'Active',inactive:'Inactive',unknown:'Unknown',mixed:'Mixed'}[status];
 const list=key=>[...new Set(ads.map(ad=>ad[key]).filter(Boolean))];
 const line=(label,values)=>values.length?'<div title="'+escCA(values.join(', '))+'">'+label+': '+escCA(values.length===1?values[0]:values.length+' '+label.toLowerCase()+'s')+'</div>':'';
 const objectives=list('objective');
 const objective=objectives.length===1?objectives[0].replace(/^OUTCOME_/i,'').replace(/_/g,' ').toLowerCase():objectives.length?'Mixed objectives':'';
 const objectiveBadge=objective?'<span class="ca-objective" title="'+escCA(objective)+'">'+escCA(objective)+'</span>':'';
 return '<div class="ca-heading"><h3 title="'+escCA(group.name)+'">'+escCA(group.name)+'</h3><div class="ca-heading-badges">'+objectiveBadge+'<span class="ca-status ca-status-'+status+'">'+label+'</span></div></div><div class="ca-hierarchy">'+line('Ad set',list('adset'))+line('Campaign',list('campaign'))+'</div>';
}
function draw(){if(page!=='Creative Analysis')return;
 const all=groups();const choices=Object.entries(defs).map(([k,v])=>'<option value="'+k+'">'+escCA(v[0])+'</option>').join('');
 $('content').innerHTML='<section class="ca-workspace"><div class="ca-toolbar"><div class="ca-controls"><label>From<input id="ca-from" type="date" value="'+escCA(CA.data?.start||dateFrom)+'"></label><label>To<input id="ca-to" type="date" value="'+escCA(CA.data?.end||dateTo)+'"></label><button id="ca-apply" class="btn">Apply</button><label>Ad status<select id="ca-status"><option value="active">Active ads</option><option value="all">All ads</option><option value="inactive">Inactive ads</option></select></label><label>Group by<select id="ca-group"><option value="ad">Ad</option><option value="name">Ad name</option><option value="adset">Ad set</option><option value="campaign">Campaign</option></select></label><label>Sort by<select id="ca-sort">'+choices+'</select></label><button id="ca-direction" class="btn" title="Reverse sort">'+(CA.direction==='desc'?'↓ Highest first':'↑ Lowest first')+'</button><input id="ca-search" type="search" placeholder="Search creative or campaign" aria-label="Search creatives" value="'+escCA(CA.search)+'"></div><div class="ca-metrics">'+CA.metrics.map((k,i)=>'<label><span>'+(i+1)+'</span><select data-ca-metric="'+i+'" aria-label="Card metric '+(i+1)+'">'+choices+'</select>'+(CA.metrics.length>1?'<button data-ca-remove="'+i+'" aria-label="Remove metric">×</button>':'')+'</label>').join('')+(CA.metrics.length<6?'<button id="ca-add" class="btn">+ Add metric</button>':'')+'</div></div><p class="ca-note">Meta creative performance · '+(CA.loading?'Loading…':all.length+' cards')+(CA.data?' · Compared with '+CA.data.prevStart+' – '+CA.data.prevEnd:'')+' · Click a card for all metrics and the original ad.</p>'+(CA.error?'<div class="error">'+escCA(CA.error)+' <button id="ca-retry" class="btn">Retry</button></div>':'')+'<div class="ca-grid">'+all.slice(0,CA.limit).map((g,i)=>'<button class="ca-card" data-ca-card="'+i+'">'+media(g)+'<div class="ca-card-body">'+cardHeading(g)+CA.metrics.map(k=>'<div class="ca-metric"><span>'+escCA(defs[k][0])+'</span><b>'+display(k,g.current[k])+'</b>'+delta(k,g.current[k],g.previous[k])+'</div>').join('')+'</div></button>').join('')+'</div>'+(!CA.loading&&!CA.error&&!all.length?'<div class="empty">No creatives match these dates and filters. Try All ads to include ads with unknown status.</div>':'')+(all.length>CA.limit?'<button id="ca-more" class="btn">Load more creatives</button>':'')+'<p class="ca-note">Source: Meta &amp; GA4 Reporting. Blank metrics stay unavailable; totals are grouped by Ad ID, using the latest export per day. Estimated and weighted metrics are explained in card details.</p></section>';
 $('ca-status').value=CA.status;
 $('ca-status').onchange=e=>{CA.status=e.target.value;CA.limit=24;draw();};
 $('ca-group').value=CA.group;$('ca-sort').value=CA.sort;
 document.querySelectorAll('[data-ca-metric]').forEach(el=>{el.value=CA.metrics[+el.dataset.caMetric];el.onchange=()=>{CA.metrics[+el.dataset.caMetric]=el.value;draw();};});
 document.querySelectorAll('[data-ca-remove]').forEach(el=>el.onclick=()=>{CA.metrics.splice(+el.dataset.caRemove,1);draw();});
 document.querySelectorAll('[data-ca-card]').forEach(el=>el.onclick=()=>openDetails(all[+el.dataset.caCard]));handleImages($('content'));
 $('ca-apply').onclick=()=>load($('ca-from').value,$('ca-to').value);
 $('ca-group').onchange=e=>{CA.group=e.target.value;CA.limit=24;draw();};$('ca-sort').onchange=e=>{CA.sort=e.target.value;draw();};$('ca-direction').onclick=()=>{CA.direction=CA.direction==='desc'?'asc':'desc';draw();};
 $('ca-search').onchange=e=>{CA.search=e.target.value;CA.limit=24;draw();};
 if($('ca-add'))$('ca-add').onclick=()=>{CA.metrics.push(Object.keys(defs).find(k=>!CA.metrics.includes(k))||'spend');draw();};
 if($('ca-more'))$('ca-more').onclick=()=>{CA.limit+=24;draw();};if($('ca-retry'))$('ca-retry').onclick=()=>load($('ca-from').value,$('ca-to').value);
}
async function load(start,end){if(!start||!end||start>end){CA.error='Choose a valid start and end date.';draw();return;}const request=++CA.request;CA.loading=true;CA.error='';CA.data=null;draw();try{const data=await api('/api/creative-analysis?businessId='+encodeURIComponent(businessId)+'&start='+start+'&end='+end);if(request!==CA.request)return;CA.data=data;CA.limit=24;}catch(e){if(request===CA.request)CA.error=e.message;}finally{if(request===CA.request){CA.loading=false;draw();}}}
const original=setPage;setPage=function(p){original(p);$('nav-creative')?.classList.toggle('active',p==='Creative Analysis');if(p==='Creative Analysis'){$('page-title').textContent='Creative Analysis';$('page-sub').textContent='See which creative earns attention and drives purchases.';load(dateFrom,dateTo);}};
const nav=document.createElement('button');nav.id='nav-creative';nav.textContent='Creative Analysis';nav.onclick=()=>setPage('Creative Analysis');$('nav-ad-funnel').after(nav);
// Expose only pure aggregators for focused fixture verification.
window.ultraCreativeMath={summarize};
})();


