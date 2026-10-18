# Logos des modules d'Open Studio, dans le style de Cours Studio et Drive Studio :
# fond bleu nuit, pictogramme plein en dégradé, découpes sombres, une touche cyan.
# python scripts/icons/logos.py  → scripts/icons/logos/<id>.svg (rendus en PNG par main.cjs)
import os

BG = '<rect width="1024" height="1024" rx="224" fill="#14142e"/>'
D = '#14142e'


def grad(id, a, b, x2=1, y2=1):
    return f'<linearGradient id="{id}" x1="0" y1="0" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'


def svg(defs, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs}</defs>{BG}{body}</svg>'


LOGOS = {
    # Calendrier, une case du jour mise en avant, pastille d'alerte (cours modifié).
    'ent-studio': svg(
        grad('g', '#fcd34d', '#f97316') + grad('c', '#22d3ee', '#3b82f6'),
        f'''<rect x="176" y="232" width="640" height="592" rx="88" fill="url(#g)"/>
<rect x="300" y="168" width="64" height="150" rx="32" fill="#fde68a"/><rect x="628" y="168" width="64" height="150" rx="32" fill="#fde68a"/>
<g fill="{D}"><rect x="254" y="450" width="128" height="104" rx="26"/><rect x="432" y="450" width="128" height="104" rx="26"/><rect x="254" y="610" width="128" height="104" rx="26"/><rect x="432" y="610" width="128" height="104" rx="26"/><rect x="610" y="610" width="128" height="104" rx="26"/></g>
<rect x="610" y="450" width="128" height="104" rx="26" fill="#fff"/>
<circle cx="800" cy="248" r="104" fill="url(#c)" stroke="{D}" stroke-width="28"/>
<rect x="788" y="186" width="24" height="76" rx="12" fill="#fff"/><circle cx="800" cy="296" r="15" fill="#fff"/>'''),
    # Feuille de note au coin plié, lignes, éclair (rapide).
    'quick-notes': svg(
        grad('g', '#fef08a', '#f59e0b') + grad('c', '#22d3ee', '#6366f1'),
        f'''<path d="M260 190h420l150 150v410a84 84 0 0 1-84 84H260a84 84 0 0 1-84-84V274a84 84 0 0 1 84-84z" fill="url(#g)"/>
<path d="M680 190v96a54 54 0 0 0 54 54h96z" fill="{D}" opacity=".3"/>
<g fill="{D}"><rect x="270" y="410" width="380" height="48" rx="24"/><rect x="270" y="520" width="440" height="48" rx="24"/><rect x="270" y="630" width="260" height="48" rx="24"/></g>
<path d="M752 560 622 770h104l-28 150 156-226H748z" fill="url(#c)" stroke="{D}" stroke-width="26" stroke-linejoin="round"/>'''),
    # Planning : liste cochée.
    'plan-studio': svg(
        grad('g', '#f9a8d4', '#a855f7'),
        f'''<rect x="176" y="176" width="672" height="672" rx="120" fill="url(#g)"/>
<g fill="{D}"><circle cx="330" cy="352" r="58"/><circle cx="330" cy="512" r="58"/><circle cx="330" cy="672" r="58"/><rect x="430" y="326" width="300" height="52" rx="26"/><rect x="430" y="486" width="240" height="52" rx="26"/><rect x="430" y="646" width="280" height="52" rx="26"/></g>
<path d="m300 354 22 22 42-46M300 514l22 22 42-46" fill="none" stroke="#22d3ee" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="330" cy="672" r="24" fill="none" stroke="#f9a8d4" stroke-width="14"/>'''),
    # Document PDF avec une signature.
    'pdf-studio': svg(
        grad('g', '#fda4af', '#dc2626') + grad('c', '#22d3ee', '#818cf8', 1, 0),
        f'''<path d="M300 150h300l184 184v456a84 84 0 0 1-84 84H300a84 84 0 0 1-84-84V234a84 84 0 0 1 84-84z" fill="url(#g)"/>
<path d="M600 150v116a68 68 0 0 0 68 68h116z" fill="{D}" opacity=".3"/>
<text x="500" y="560" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="176" fill="{D}" letter-spacing="-6">PDF</text>
<path d="M300 720c40-56 70-56 90-10s40 50 74-6 64-46 84 4 54 30 100-20" fill="none" stroke="url(#c)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>'''),
    # Deux flèches en boucle autour d'un fichier.
    'convert-studio': svg(
        grad('g', '#5eead4', '#0ea5e9') + grad('h', '#22d3ee', '#818cf8'),
        f'''<path d="M232 470a280 280 0 0 1 470-196" fill="none" stroke="url(#g)" stroke-width="96" stroke-linecap="round"/>
<path d="M796 242 794 380 652 372z" fill="#0ea5e9" stroke="#0ea5e9" stroke-width="24" stroke-linejoin="round"/>
<path d="M792 554a280 280 0 0 1-470 196" fill="none" stroke="url(#h)" stroke-width="96" stroke-linecap="round"/>
<path d="M228 782 230 644 372 652z" fill="#6f8ff5" stroke="#6f8ff5" stroke-width="24" stroke-linejoin="round"/>
<path d="M452 420h86l50 50v120a26 26 0 0 1-26 26H452a26 26 0 0 1-26-26V446a26 26 0 0 1 26-26z" fill="#fff"/>'''),
    # Palette de peintre et pinceau.
    'paint-studio': svg(
        grad('g', '#fda4af', '#a855f7') + grad('b', '#e2e8f0', '#94a3b8'),
        f'''<path d="M512 170c-210 0-350 150-350 330 0 170 130 330 300 330 70 0 100-40 100-90 0-60-40-80-40-130 0-44 36-74 90-74h90c90 0 160-60 160-150 0-140-160-216-350-216z" fill="url(#g)"/>
<circle cx="340" cy="420" r="58" fill="#22d3ee"/><circle cx="470" cy="300" r="58" fill="#fde047"/><circle cx="640" cy="320" r="58" fill="#fff"/><circle cx="330" cy="610" r="58" fill="{D}"/>
<path d="M830 520 640 710" stroke="url(#b)" stroke-width="56" stroke-linecap="round"/>
<path d="M640 710c-34-34-90-26-110 18-14 32-10 72-50 96 70 18 150 4 178-44 18-30 10-50-18-70z" fill="#22d3ee"/>'''),
    # Calculatrice avec une courbe à l'écran.
    'calc-studio': svg(
        grad('g', '#a5b4fc', '#6366f1') + grad('c', '#22d3ee', '#a78bfa', 1, 0),
        f'''<rect x="232" y="150" width="560" height="724" rx="104" fill="url(#g)"/>
<rect x="300" y="222" width="424" height="196" rx="44" fill="{D}"/>
<path d="M336 360c40-80 76-110 110-60s70 70 110-10 90-90 132-40" fill="none" stroke="url(#c)" stroke-width="26" stroke-linecap="round"/>
<g fill="{D}"><rect x="300" y="476" width="118" height="104" rx="30"/><rect x="453" y="476" width="118" height="104" rx="30"/><rect x="300" y="618" width="118" height="104" rx="30"/><rect x="453" y="618" width="118" height="104" rx="30"/></g>
<rect x="606" y="476" width="118" height="246" rx="30" fill="#22d3ee"/>
<path d="M640 568h50M665 543v50M640 648h50" stroke="{D}" stroke-width="18" stroke-linecap="round"/>'''),
    # Écran avec un tracé de pouls (mesures en direct).
    'monitor-studio': svg(
        grad('g', '#67e8f9', '#0891b2') + grad('p', '#34d399', '#22d3ee', 1, 0),
        f'''<rect x="150" y="190" width="724" height="504" rx="88" fill="url(#g)"/>
<rect x="206" y="246" width="612" height="392" rx="48" fill="{D}"/>
<path d="M240 452h120l52-120 84 250 70-190 46 60h172" fill="none" stroke="url(#p)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="784" cy="452" r="24" fill="#34d399"/>
<rect x="452" y="694" width="120" height="96" fill="#0ea5c6"/><rect x="332" y="776" width="360" height="62" rx="31" fill="url(#g)"/>'''),
    # Téléphone, ondes Wi-Fi et flèche d'envoi.
    'transfer-studio': svg(
        grad('g', '#7dd3fc', '#6366f1') + grad('c', '#5eead4', '#22d3ee'),
        f'''<rect x="170" y="230" width="300" height="560" rx="70" fill="url(#g)"/>
<rect x="206" y="290" width="228" height="400" rx="26" fill="{D}"/>
<rect x="282" y="722" width="76" height="22" rx="11" fill="{D}"/>
<path d="M560 330c90-40 200-40 290 0M600 400c60-26 150-26 210 0M640 470c34-14 96-14 130 0" fill="none" stroke="url(#c)" stroke-width="40" stroke-linecap="round"/>
<path d="M530 590h300m-90-80 90 80-90 80" fill="none" stroke="#fff" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M266 440h108m-36-38 36 38-36 38" fill="none" stroke="url(#c)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M374 560H266m36-38-36 38 36 38" fill="none" stroke="url(#c)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>'''),
    # Lecteur vidéo, lignes de texte et étincelles (résumé par l'IA).
    'youtube-studio': svg(
        grad('g', '#ff7a8f', '#e11d48') + grad('c', '#22d3ee', '#a78bfa'),
        f'''<rect x="150" y="230" width="600" height="420" rx="120" fill="url(#g)"/>
<path d="M392 332v216l182-108z" fill="#fff" stroke="#fff" stroke-width="28" stroke-linejoin="round"/>
<g fill="#e2e8f0"><rect x="150" y="720" width="440" height="46" rx="23"/><rect x="150" y="806" width="300" height="46" rx="23"/></g>
<path d="M800 470c14 82 40 108 122 122-82 14-108 40-122 122-14-82-40-108-122-122 82-14 108-40 122-122z" fill="url(#c)"/>
<path d="M840 220c8 44 22 58 66 66-44 8-58 22-66 66-8-44-22-58-66-66 44-8 58-22 66-66z" fill="#22d3ee"/>'''),
    # Fenêtre d'éditeur avec </>.
    'snippets-studio': svg(
        grad('g', '#d9f99d', '#16a34a') + grad('c', '#22d3ee', '#3b82f6', 0, 1),
        f'''<rect x="150" y="190" width="724" height="644" rx="110" fill="url(#g)"/>
<g fill="{D}"><circle cx="250" cy="282" r="24"/><circle cx="322" cy="282" r="24"/><circle cx="394" cy="282" r="24"/></g>
<path d="M392 450 270 572l122 122M632 450l122 122-122 122" fill="none" stroke="{D}" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M564 420 460 724" stroke="url(#c)" stroke-width="56" stroke-linecap="round"/>'''),
    # Accolades d'API et flèche de requête.
    'api-studio': svg(
        grad('g', '#fde68a', '#f97316') + grad('c', '#22d3ee', '#818cf8', 1, 0),
        f'''<path d="M352 196c-90 0-130 40-130 120v100c0 50-30 80-80 96 50 16 80 46 80 96v100c0 80 40 120 130 120" fill="none" stroke="url(#g)" stroke-width="80" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M672 196c90 0 130 40 130 120v100c0 50 30 80 80 96-50 16-80 46-80 96v100c0 80-40 120-130 120" fill="none" stroke="url(#g)" stroke-width="80" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M396 512h220m-84-90 96 90-96 90" fill="none" stroke="url(#c)" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>'''),
    # Boîte à outils, avec une clé et un tournevis qui dépassent.
    'devtools-studio': svg(
        grad('g', '#cbd5e1', '#6366f1') + grad('c', '#22d3ee', '#3b82f6'),
        f'''<path d="M384 330v-70a56 56 0 0 1 56-56h144a56 56 0 0 1 56 56v70" fill="none" stroke="#cbd5e1" stroke-width="48"/>
<rect x="150" y="320" width="724" height="500" rx="96" fill="url(#g)"/>
<rect x="150" y="420" width="724" height="40" fill="{D}" opacity=".35"/>
<g transform="translate(358 470) scale(13)"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="{D}" stroke="{D}" stroke-width="1.2" stroke-linejoin="round"/></g>
<circle cx="404" cy="728" r="16" fill="#22d3ee"/>'''),
    # Deux serveurs empilés, voyants allumés.
    'servers-studio': svg(
        grad('g', '#86efac', '#16a34a') + grad('h', '#4ade80', '#0d9488'),
        f'''<rect x="170" y="200" width="684" height="276" rx="78" fill="url(#g)"/>
<rect x="170" y="548" width="684" height="276" rx="78" fill="url(#h)"/>
<g fill="{D}"><rect x="250" y="312" width="300" height="52" rx="26"/><rect x="250" y="660" width="300" height="52" rx="26"/></g>
<circle cx="700" cy="338" r="44" fill="#fff"/><circle cx="700" cy="338" r="22" fill="#22d3ee"/>
<circle cx="700" cy="686" r="44" fill="{D}"/><circle cx="700" cy="686" r="22" fill="#fde047"/>'''),
}

out = os.path.join(os.path.dirname(__file__), 'logos')
os.makedirs(out, exist_ok=True)
for k, v in LOGOS.items():
    with open(os.path.join(out, f'{k}.svg'), 'w', encoding='utf-8') as f:
        f.write(v)
print(len(LOGOS), 'logos')
