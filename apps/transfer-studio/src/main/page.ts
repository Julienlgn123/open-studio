// Page ouverte sur le téléphone (ou un autre PC) après le scan du QR code : envoyer et recevoir
// des fichiers, échanger du texte, avec code PIN si le PC l'exige.
export function phonePage(): string {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0d0d0f">
<title>Transfert · Open Studio</title>
<style>
:root{--bg:#0d0d0f;--s:#16161a;--s2:#1f1f25;--b:rgba(255,255,255,.08);--t:#ececf1;--t2:#a1a1aa;--a:#0ea5e9}
@media (prefers-color-scheme:light){:root{--bg:#f6f6f8;--s:#fff;--s2:#f0f0f3;--b:rgba(0,0,0,.08);--t:#18181b;--t2:#52525b}}
*{box-sizing:border-box;margin:0}body{background:var(--bg);color:var(--t);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:20px 16px 90px;max-width:640px;margin:0 auto}
h1{font-size:22px;margin-bottom:2px}p.sub{color:var(--t2);margin-bottom:16px}
.card{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:16px;margin-bottom:14px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;border:0;border-radius:12px;background:var(--a);color:#fff;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer;font-family:inherit}
.btn.sec{background:var(--s2);color:var(--t)}.btn.sm{width:auto;height:36px;padding:0 14px;font-size:14px}
input[type=file]{display:none}
textarea,input.pin{width:100%;border:1px solid var(--b);background:var(--s2);color:var(--t);border-radius:12px;padding:12px;font:inherit;resize:vertical}
input.pin{font-size:28px;letter-spacing:.5em;text-align:center;margin:12px 0}
.row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--b)}.row:first-child{border-top:0}
.name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.size{color:var(--t2);font-size:13px;white-space:nowrap}
.thumb{width:44px;height:44px;border-radius:8px;object-fit:cover;background:var(--s2);flex-shrink:0}
.ico{width:44px;height:44px;border-radius:8px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.bar{height:6px;border-radius:3px;background:var(--b);overflow:hidden;margin-top:6px}.bar div{height:100%;background:var(--a);width:0;transition:width .2s}
.empty{color:var(--t2)}.ok{color:#22c55e;font-weight:600}.err{color:#ef4444}
.tabs{position:fixed;left:0;right:0;bottom:0;display:flex;background:var(--s);border-top:1px solid var(--b);padding:6px 6px calc(6px + env(safe-area-inset-bottom))}
.tabs button{flex:1;border:0;background:none;color:var(--t2);font:600 12px system-ui;padding:6px 0;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer}
.tabs button span{font-size:20px}.tabs button.on{color:var(--a);background:var(--s2)}
.view{display:none}.view.on{display:block}
.drop{border:2px dashed var(--b);border-radius:14px;padding:18px;text-align:center;color:var(--t2);margin-top:10px}.drop.over{border-color:var(--a);color:var(--a)}
.msg{background:var(--s2);border-radius:12px;padding:10px 12px;margin-top:8px;white-space:pre-wrap;word-break:break-word}
.msg.pc{border-left:3px solid var(--a)}.msg small{display:flex;justify-content:space-between;align-items:center;color:var(--t2);margin-bottom:4px;gap:8px}
.msg button{border:0;background:none;color:var(--a);font:600 13px system-ui;cursor:pointer}
.toast{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);background:var(--t);color:var(--bg);padding:8px 14px;border-radius:10px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none}.toast.on{opacity:1}
#lock{display:none}
</style></head><body>
<h1>📲 Transfert</h1><p class="sub">Connecté à ton PC. Rien ne passe par Internet.</p>
<div id="lock" class="card"><h2>Code de sécurité</h2><p>Tape le code à 4 chiffres affiché sur le PC.</p>
<input id="pinIn" class="pin" inputmode="numeric" maxlength="4" autocomplete="one-time-code"><button class="btn" id="pinOk">Valider</button><p id="pinErr" class="err"></p></div>
<div id="app">
<div class="view on" id="v-send"><div class="card"><h2>Envoyer vers le PC</h2>
<label class="btn">⬆️ Choisir des fichiers<input id="pick" type="file" multiple></label>
<label class="btn sec" style="margin-top:8px">🖼️ Photos et vidéos<input id="pickMedia" type="file" multiple accept="image/*,video/*"></label>
<div class="drop" id="drop">…ou glisse des fichiers ici</div>
<div id="total" class="size" style="margin-top:10px"></div><div id="ups"></div></div></div>
<div class="view" id="v-get"><div class="card"><h2>Partagés par le PC <button class="btn sm sec" id="all" style="display:none">Tout télécharger</button></h2><div id="files" class="empty">Chargement…</div></div></div>
<div class="view" id="v-text"><div class="card"><h2>Texte et liens</h2>
<textarea id="txt" rows="3" placeholder="Un lien, une adresse, un code… il arrive sur le PC."></textarea>
<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="sendTxt">Envoyer au PC</button><button class="btn sec" id="paste" style="width:auto;padding:0 16px">📋</button></div>
<div id="texts"></div></div></div>
</div>
<nav class="tabs"><button class="on" data-v="send"><span>⬆️</span>Envoyer</button><button data-v="get"><span>⬇️</span>Recevoir<b id="badge"></b></button><button data-v="text"><span>💬</span>Texte</button></nav>
<div class="toast" id="toast"></div>
<script>
const k=new URLSearchParams(location.search).get('k');let p=sessionStorage.getItem('pin')||'';
const q=()=>'k='+k+(p?'&p='+p:'');const $=id=>document.getElementById(id);
const fmt=n=>n<1024?n+' o':n<1048576?(n/1024).toFixed(0)+' Ko':n<1073741824?(n/1048576).toFixed(1)+' Mo':(n/1073741824).toFixed(2)+' Go';
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),1600)}
async function api(path,opt){const r=await fetch(path+(path.includes('?')?'&':'?')+q(),opt);if(r.status===401){lock();throw new Error('pin')}return r}
function lock(){$('lock').style.display='block';$('app').style.display='none';$('pinIn').focus()}
$('pinOk').onclick=async()=>{p=$('pinIn').value.trim();const r=await fetch('/api/files?'+q());if(r.status===401){$('pinErr').textContent='Code incorrect.';p='';return}
sessionStorage.setItem('pin',p);$('lock').style.display='none';$('app').style.display='block';refresh()};
$('pinIn').onkeydown=e=>{if(e.key==='Enter')$('pinOk').click()};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id==='v-'+b.dataset.v));if(b.dataset.v==='get'){seen=(window._files||[]).length;$('badge').textContent=''}});
let seen=0;
async function load(){const l=await (await api('/api/files')).json();const el=$('files');$('all').style.display=l.length>1?'flex':'none';
$('badge').textContent=l.length&&l.length!==seen?' •':'';
if(!l.length){el.className='empty';el.textContent='Aucun fichier pour l’instant. Ajoute-en depuis le PC.';return}
el.className='';el.innerHTML='';for(const f of l){const d=document.createElement('div');d.className='row';
const src='/files/'+f.id+'?'+q();
d.innerHTML=(f.image?'<img class="thumb" loading="lazy" src="'+src+'&inline=1">':'<span class="ico">'+(f.dir?'🗂️':'📄')+'</span>')+'<div class="name"><div class="n"></div><div class="size">'+fmt(f.size)+(f.dir?' · '+f.files+' fichiers (ZIP)':'')+'</div></div><a class="btn sm">⬇️</a>';
d.querySelector('.n').textContent=f.name;d.querySelector('a').href=src;d.querySelector('a').setAttribute('download',f.dir?f.name+'.zip':f.name);
if(f.image)d.querySelector('img').onclick=()=>open(src+'&inline=1');el.appendChild(d)}window._files=l}
$('all').onclick=async()=>{for(const f of window._files||[]){const a=document.createElement('a');a.href='/files/'+f.id+'?'+q();a.download=f.name;document.body.appendChild(a);a.click();a.remove();await new Promise(r=>setTimeout(r,700))}};
async function loadTexts(){const l=await (await api('/api/texts')).json();const el=$('texts');el.innerHTML='';
for(const t of l){const d=document.createElement('div');d.className='msg '+t.from;
const when=new Date(t.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
d.innerHTML='<small><span>'+(t.from==='pc'?'💻 Depuis le PC':'📱 '+esc(t.device||'Téléphone'))+' · '+when+'</span><span><button data-c>Copier</button></span></small><div></div>';
const body=d.querySelector('div');if(/^https?:\\/\\/\\S+$/.test(t.text)){const a=document.createElement('a');a.href=t.text;a.textContent=t.text;a.target='_blank';a.style.color='var(--a)';body.appendChild(a)}else body.textContent=t.text;
d.querySelector('[data-c]').onclick=()=>copy(t.text);el.appendChild(d)}}
async function copy(t){try{await navigator.clipboard.writeText(t);toast('Copié')}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();toast('Copié')}}
$('sendTxt').onclick=async()=>{const t=$('txt').value.trim();if(!t)return;const r=await api('/api/text',{method:'POST',body:t});if(r.ok){$('txt').value='';toast('Envoyé au PC ✓');loadTexts()}};
$('paste').onclick=async()=>{try{$('txt').value=await navigator.clipboard.readText()}catch(e){toast('Colle avec un appui long')}};
function refresh(){load().catch(()=>{});loadTexts().catch(()=>{})}
refresh();setInterval(refresh,4000);
let totalN=0,doneN=0;
function upd(){$('total').textContent=totalN?doneN+' / '+totalN+' envoyé'+(doneN>1?'s':''):''}
$('pick').onchange=e=>{[...e.target.files].forEach(send);e.target.value=''};$('pickMedia').onchange=$('pick').onchange;
const dz=$('drop');dz.ondragover=e=>{e.preventDefault();dz.classList.add('over')};dz.ondragleave=()=>dz.classList.remove('over');
dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');[...e.dataTransfer.files].forEach(send)};
const queue=[];let active=0;
function send(f){totalN++;upd();const row=document.createElement('div');row.className='row';row.innerHTML='<div style="flex:1;min-width:0"><div class="name"></div><div class="bar"><div></div></div></div><span class="size">en attente</span>';
row.querySelector('.name').textContent=f.name+' · '+fmt(f.size);$('ups').prepend(row);queue.push([f,row]);next()}
function next(){while(active<2&&queue.length){const [f,row]=queue.shift();active++;
const x=new XMLHttpRequest();x.open('PUT','/api/upload?'+q()+'&name='+encodeURIComponent(f.name));
x.upload.onprogress=ev=>{if(ev.lengthComputable){const pc=Math.round(ev.loaded/ev.total*100);row.querySelector('.bar div').style.width=pc+'%';row.querySelector('.size').textContent=pc+' %'}};
const end=ok=>{active--;const s=row.querySelector('.size');s.textContent=ok?'Envoyé ✓':'Échec';s.className='size '+(ok?'ok':'err');if(ok){doneN++;upd()}next()};
x.onload=()=>{if(x.status===401){lock();end(false)}else end(x.status===200)};x.onerror=()=>end(false);x.send(f)}}
</script></body></html>`
}
