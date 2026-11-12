const post="https://www.facebook.com/333267216547084_122208944276467209";
const variants=[
 ["direct",post],
 ["embed","https://www.facebook.com/plugins/post.php?href="+encodeURIComponent(post)+"&show_text=false&width=500"],
 ["video","https://www.facebook.com/plugins/video.php?href="+encodeURIComponent(post)+"&show_text=false&width=500"],
 ["mobile","https://m.facebook.com/333267216547084_122208944276467209"]
];
for(const [name,url] of variants){
 try{
 const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36","Accept":"text/html"},signal:AbortSignal.timeout(15000)});
 const body=await response.text();
 const preview=[...body.matchAll(/<meta[^>]+(?:og:image|og:video|twitter:image)[^>]*>/gi)].slice(0,2).map(x=>x[0].replace(/content=(["']).*?\1/gi,'content="[redacted]"'));
 console.log(JSON.stringify({name,status:response.status,url:response.url.replace(/\?.*/,""),bytes:body.length,hasLogin:/login|log in|must be logged/i.test(body),hasEmbed:/fb-post|fb-video|post-container|userContentWrapper/i.test(body),ogPreviewCount:preview.length,framePolicy:response.headers.get("x-frame-options")}));
 }catch(e){console.log(JSON.stringify({name,error:String(e)}))}
}
