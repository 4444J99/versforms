// Deliberately self-contained so the public repository receives no private
// compiler, source, authentication, D1 or PHOTOS dependencies. R2 reads only.
const BLANK = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>versforms</title><meta name="robots" content="noindex"><style>:root{--paper:#e6dfd2;color-scheme:light}@media(prefers-color-scheme:dark){:root{--paper:#16171a;color-scheme:dark}}html,body{margin:0;height:100%;background:var(--paper)}</style></head><body></body></html>';
const ID = /^[a-f0-9]{64}$/;
const PATH = /^(?:index\.html|data\/j\.json|reader-(?:features|packages)\.js|img\/[a-z]\/[A-Za-z0-9_.-]+\.jpg)$/;
const headers = {'x-robots-tag':'noindex','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'public, max-age=60, must-revalidate'};
const answer = (request, body, status=200, extra={}) => new Response(request.method==='HEAD'?null:body,{status,headers:{...headers,...extra}});

export async function readPublic(request, env) {
  if (!['GET','HEAD'].includes(request.method))return answer(request,null,405,{allow:'GET, HEAD'});
  const url=new URL(request.url);
  // Decode nothing: only exact ASCII engine routes can reach R2.
  let path=url.pathname.slice(1), requested=null;
  if(path.startsWith('_snapshot/')) {
    const m=/^_snapshot\/([a-f0-9]{64})\/(.*)$/.exec(path);
    if(!m)return answer(request,null,404);
    requested=m[1];path=m[2];
  }
  if(path==='')path='index.html';
  if(!PATH.test(path) || path.includes('..'))return answer(request,null,404);
  try {
    const pointer=await env.PUBLIC.get('current.json');
    if(!pointer)return path==='index.html' && !requested ? answer(request,BLANK,200,{'content-type':'text/html; charset=utf-8'}) : answer(request,null,404);
    const current=await pointer.json();
    if(!ID.test(current.id))return answer(request,null,503,{'cache-control':'no-store'});
    if(requested && requested!==current.id)return answer(request,null,404);
    const prefix=`snapshots/${current.id}/`;
    const record=await env.PUBLIC.get(prefix+'manifest.json');
    if(!record)return answer(request,null,503,{'cache-control':'no-store'});
    const manifest=await record.json();
    if(manifest.id!==current.id || !Array.isArray(manifest.files))return answer(request,null,503,{'cache-control':'no-store'});
    const file=manifest.files.find(f=>f.path===path);
    if(!file)return answer(request,null,404);
    if(file.key!==prefix+path && !/^img\/[a-f0-9]{64}\.jpg$/.test(file.key))return answer(request,null,503,{'cache-control':'no-store'});
    const etag=`"${current.id}:${path}"`;
    if(request.headers.get('if-none-match')===etag)return answer(request,null,304,{etag});
    const obj=await env.PUBLIC.get(file.key);
    if(!obj)return answer(request,null,404);
    let body=obj.body;
    if(path==='index.html') {
      // Pin data and images to the page's snapshot. A pointer race fails visibly
      // instead of combining a previous page with another release's data.
      const text=await new Response(body).text();
      body=text.replace(/<head\b[^>]*>/i,m=>m+`<base href="/_snapshot/${current.id}/">`);
    }
    return answer(request,body,200,{'content-type':file.contentType || 'application/octet-stream',etag});
  } catch {return answer(request,null,503,{'cache-control':'no-store'});}
}
