export function parseCostAnswer(id,raw){
 if(raw===null||raw===undefined||String(raw).trim()==='')return {status:'unknown',value:null};
 if(id==='variable_product_cost'&&/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(String(raw).trim()))return {status:'source_requires_read',value:null,sourceUrl:String(raw).trim()};
 const text=String(raw).trim().replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[٬,]/g,'').replace('٫','.').replace(/\s*(جنيه|EGP)\s*$/i,'');
 if(!/^\d+(\.\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw Error('التكلفة لازم تكون رقمًا غير سالب، أو رابط شيت تكلفة لكل SKU في خانة تكلفة المنتج.');
 return {status:'owner_supplied',value:Number(text),currency:'EGP',unit:id==='fixed_costs_monthly'?'month':id==='return_cost'?'returned_order':'unit',scope:id==='variable_product_cost'?'uniform_per_unit_as_entered':null,excludesAdvertisingSpend:id==='fixed_costs_monthly'};
}
export function costStatus(registry){return Object.fromEntries(['return_cost','variable_product_cost','fixed_costs_monthly'].map(id=>{const q=registry?.questions?.find(x=>x.id===id);return [id,q?.typedAnswer??{status:'unknown',value:null}];}));}
