// Page ouverte sur le téléphone (ou un autre PC) après le scan du QR code : envoyer et recevoir.
export function phonePage(): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transfert · Open Studio</title>
<style>
:root{--bg:#0d0d0f;--s:#16161a;--b:rgba(255,255,255,.08);--t:#ececf1;--t2:#a1a1aa;--a:#0ea5e9}
@media (prefers-color-scheme:light){:root{--bg:#f6f6f8;--s:#fff;--b:rgba(0,0,0,.08);--t:#18181b;--t2:#52525b}}
*{box-sizing:border-box;margin:0}body{background:var(--bg);color:var(--t);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:20px 16px 40px}
h1{font-size:22px;margin-bottom:4px}p.sub{color:var(--t2);margin-bottom:18px}
.card{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:16px;margin-bottom:14px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);margin-bottom:10px}
label.btn,a.btn,button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;border:0;border-radius:12px;background:var(--a);color:#fff;font-weight:700;font-size:16px;text-decoration:none}
input[type=file]{display:none}
.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--b)}.row:first-child{border-top:0}
.name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.size{color:var(--t2);font-size:13px}
.dl{width:auto;height:36px;padding:0 14px;font-size:14px}
.bar{height:6px;border-radius:3px;background:var(--b);overflow:hidden;margin-top:6px}.bar div{height:100%;background:var(--a);width:0}
.empty{color:var(--t2)}.ok{color:#22c55e;font-weight:600}.err{color:#ef4444}
</style></head><body>
<h1>📲 Transfert</h1><p class="sub">Connecté à ton PC. Rien ne passe par Internet.</p>
<div class="card"><h2>Envoyer vers le PC</h2>
<label class="btn">⬆️ Choisir des fichiers<input id="pick" type="file" multiple></label>
<div id="ups"></div></div>
<div class="card"><h2>Fichiers partagés par le PC</h2><div id="files" class="empty">Chargement…</div></div>
<script>
const k=new URLSearchParams(location.search).get('k');
const fmt=n=>n<1024?n+' o':n<1048576?(n/1024).toFixed(0)+' Ko':n<1073741824?(n/1048576).toFixed(1)+' Mo':(n/1073741824).toFixed(2)+' Go';
async function load(){try{const r=await fetch('/api/files?k='+k);const l=await r.json();const el=document.getElementById('files');
if(!l.length){el.className='empty';el.textContent='Aucun fichier pour l’instant. Ajoute-en depuis le PC.';return}
el.className='';el.innerHTML='';for(const f of l){const d=document.createElement('div');d.className='row';
d.innerHTML='<span class="name"></span><span class="size">'+fmt(f.size)+'</span><a class="btn dl">Télécharger</a>';
d.querySelector('.name').textContent=f.name;d.querySelector('a').href='/files/'+f.id+'?k='+k;el.appendChild(d)}}catch(e){}}
load();setInterval(load,4000);
document.getElementById('pick').onchange=e=>{for(const f of e.target.files)send(f);e.target.value=''};
function send(f){const row=document.createElement('div');row.className='row';row.innerHTML='<div style="flex:1;min-width:0"><div class="name"></div><div class="bar"><div></div></div></div><span class="size">0 %</span>';
row.querySelector('.name').textContent=f.name;document.getElementById('ups').appendChild(row);
const x=new XMLHttpRequest();x.open('PUT','/api/upload?k='+k+'&name='+encodeURIComponent(f.name));
x.upload.onprogress=ev=>{if(ev.lengthComputable){const p=Math.round(ev.loaded/ev.total*100);row.querySelector('.bar div').style.width=p+'%';row.querySelector('.size').textContent=p+' %'}};
x.onload=()=>{const s=row.querySelector('.size');if(x.status===200){s.textContent='Envoyé ✓';s.className='size ok'}else{s.textContent='Échec';s.className='size err'}};
x.onerror=()=>{const s=row.querySelector('.size');s.textContent='Échec';s.className='size err'};x.send(f)}
</script></body></html>`
}
