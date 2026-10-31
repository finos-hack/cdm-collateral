"""Render architecture/prototype.architecture.json as a single HTML page with a
hand-laid diagram and a flow selector. Usage:
  python render_architecture_page.py prototype.architecture.json out.html
Coordinates are fixed below; node and flow text comes from the CALM file."""
import json, sys, html
calm = json.load(open(sys.argv[1]))
N = {n['unique-id']: n for n in calm['nodes']}
R = {r['unique-id']: r for r in calm['relationships']}
e = html.escape

# (x, y, w, h, class)
BOX = {
 'pledgor-ops': (20, 120, 150, 46, 'actor'), 'secured-party-ops': (20, 186, 150, 46, 'actor'), 'market-operator': (20, 252, 150, 46, 'actor'),
 'party-console': (230, 150, 170, 70, 'ui'), 'e2e-test-harness': (230, 670, 170, 60, 'test'),
 'collateral-service': (470, 120, 200, 85, 'svc'), 'cdm-object-model': (470, 205, 200, 36, 'data'),
 'workflow-store': (470, 300, 200, 50, 'db'), 'oracle-service': (470, 530, 200, 70, 'svc'), 'mock-market-data': (470, 650, 200, 50, 'ext'),
 'ledger-gateway': (740, 250, 190, 100, 'svc'), 'dev-keystore': (740, 400, 190, 45, 'data'),
 'cdm-payload-store': (740, 500, 190, 56, 'db'),
 'collateral-control-contract': (975, 140, 180, 80, 'sc'), 'tokenized-collateral': (975, 300, 180, 70, 'sc'), 'oracle-feed-contract': (975, 440, 180, 70, 'sc'), 'margin-call-contract': (975, 580, 180, 70, 'sc'),
}
SUB = {'party-console': 'React', 'e2e-test-harness': 'Playwright · test only', 'collateral-service': 'Java · Javalin',
       'cdm-object-model': 'CDM 7.7.0 · Java', 'workflow-store': 'SQLite', 'oracle-service': 'Java · shared', 'mock-market-data': 'JSON files',
       'ledger-gateway': 'TypeScript · Besu adapter', 'dev-keystore': 'own key only', 'cdm-payload-store': 'shared · keyed by cdmHash', 'collateral-control-contract': 'pledge · return · enforce',
       'tokenized-collateral': 'ERC-20 · ISIN/CUSIP · DTI', 'oracle-feed-contract': 'price · rating · default', 'margin-call-contract': 'call · proposal · settled'}
TITLE = {'collateral-service': 'Collateral workflow service', 'collateral-control-contract': 'Collateral control contract'}
EDGE = {
 'pledgor-uses-console': [(170,143),(230,170)], 'secured-party-uses-console': [(170,209),(230,185)], 'operator-uses-console': [(170,275),(230,205)],
 'console-to-service': [(400,165),(470,165)],
 'console-to-oracle': [(400,205),(430,205),(430,580),(470,580)],
 'service-to-oracle': [(470,185),(450,185),(450,555),(470,555)],
 'service-to-payload-store': [(670,198),(688,198),(688,528),(740,528)],
 'service-to-store': [(520,241),(520,300)],
 'oracle-to-market-data': [(570,600),(570,650)],
 'console-to-gateway': [(315,150),(315,95),(500,95),(500,60),(730,60),(730,265),(740,265)],
 'service-to-gateway': [(670,150),(715,150),(715,280),(740,280)],
 'gateway-to-service-events': [(740,295),(700,295),(700,190),(670,190)],
 'oracle-to-gateway': [(670,565),(700,565),(700,320),(740,320)],
 'harness-to-console': [(315,670),(315,220)],
 'harness-to-gateway': [(400,715),(715,715),(715,335),(740,335)],
 'gateway-to-keystore': [(835,350),(835,400)],
 'gateway-to-besu-rpc': [(930,280),(960,280)],
 'gateway-to-besu-events': [(930,320),(960,320)],
 'control-to-tokens': [(1065,220),(1065,300)],
 'control-to-margin-call': [(975,205),(967,205),(967,615),(975,615)],
 'control-to-oracle-feed': [(1155,180),(1163,180),(1163,475),(1155,475)],
}
LABEL = {'gateway-to-besu-rpc': ('RPC', 945, 272), 'gateway-to-besu-events': ('WS', 945, 336),
         'console-to-gateway': ('balances', 615, 54), 'service-to-payload-store': ('CDM docs', 712, 522)}
missing = [r for r in R if R[r]['relationship-type'].get('connects') or R[r]['relationship-type'].get('interacts')]
missing = [r for r in missing if r not in EDGE]
assert not missing, missing

svg = ['<svg viewBox="0 0 1200 770" role="img" aria-label="Prototype architecture: each participant runs its own party console, collateral workflow service, workflow store, ledger gateway and key; workflow services, built on CDM 7.7.0, exchange CDM documents through a shared content-addressed payload store keyed by the on-chain hash, and use an oracle service and a TypeScript ledger gateway to operate a collateral control contract, tokenized collateral, a margin call contract and an oracle feed on a local four-node Besu network with one validator node per participant, all on one development host (a GitHub Codespace or a Windows machine)."><defs>',
       '<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>',
       '<marker id="ahon" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ahon"/></marker></defs>']
svg.append('<rect x="200" y="20" width="985" height="740" rx="12" class="host"/><text x="214" y="42" class="grp">DEVELOPMENT HOST · CODESPACE OR WINDOWS</text>')
svg.append('<rect x="960" y="60" width="215" height="680" rx="10" class="besu"/><text x="1067" y="84" text-anchor="middle" class="grp">BESU · DOCKER · QBFT ×4</text><text x="1067" y="100" text-anchor="middle" class="sub">one validator node per participant</text>')
svg.append('<rect x="215" y="110" width="730" height="365" rx="10" class="stack"/><text x="229" y="448" class="grp">PER PARTICIPANT · × N STACKS</text><text x="229" y="464" class="sub">own process · own store · own key</text>')
for rid, pts in EDGE.items():
    d = ' '.join(f'{x},{y}' for x, y in pts)
    dash = ' dashed' if rid in ('gateway-to-service-events', 'harness-to-console', 'harness-to-gateway') else ''
    svg.append(f'<polyline id="e-{rid}" data-rel="{rid}" points="{d}" class="edge{dash}" marker-end="url(#ah)"><title>{e(R[rid].get("description",""))}</title></polyline>')
for rid, (t, x, y) in LABEL.items():
    svg.append(f'<text x="{x}" y="{y}" text-anchor="middle" class="elab">{t}</text>')
for nid, (x, y, w, h, cls) in BOX.items():
    n = N[nid]; title = TITLE.get(nid, n['name'])
    rx = 23 if cls == 'actor' else 7
    svg.append(f'<g class="node {cls}" id="n-{nid}" data-node="{nid}"><title>{e(n["description"])}</title><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')
    sub = SUB.get(nid)
    cy = y + h/2 + (-4 if sub else 5)
    svg.append(f'<text x="{x+w/2}" y="{cy}" text-anchor="middle" class="bt">{e(title)}</text>')
    if sub: svg.append(f'<text x="{x+w/2}" y="{cy+16}" text-anchor="middle" class="bs">{e(sub)}</text>')
    svg.append('</g>')
svg.append('<g id="badges"></g></svg>')

flows = calm['flows']
flow_js = json.dumps([{'id': f['unique-id'], 'name': f['name'], 'description': f['description'],
                       'steps': [{'rel': t['relationship-unique-id'], 'n': t['sequence-number'], 'text': t['description']} for t in f['transitions']]} for f in flows])
rel_js = json.dumps({rid: [k for k in (R[rid]['relationship-type'].get('connects', {}).get('source', {}).get('node'),
                                         R[rid]['relationship-type'].get('connects', {}).get('destination', {}).get('node'),
                                         R[rid]['relationship-type'].get('interacts', {}).get('actor'))] + R[rid]['relationship-type'].get('interacts', {}).get('nodes', [])
                     for rid in EDGE})

rows = ''.join(f'<tr><td>{e(N[n]["name"])}</td><td><code>{e(N[n]["node-type"])}</code></td><td>{e(N[n]["description"])}</td></tr>' for n in N)
page = f'''<title>Prototype Architecture</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
/* Layout: header, flow selector, diagram (scrolls sideways on phones), step list, component table. */
:root {{ --bg:#fbfbfa; --fg:#1d2228; --muted:#5b6470; --rule:#d9dde3; --panel:#eef1f5; --box:#ffffff; --edge:#7a838e;
  --hi:#0b7a75; --hi-soft:#d5efed; --ui:#e7eefb; --ui-s:#3d63b8; --svc:#ffffff; --svc-s:#4a535e; --sc:#e9f5ec; --sc-s:#2e7a47; --db:#f7efdd; --db-s:#9a6b12;
  --f-d:"IBM Plex Sans Condensed","Arial Narrow",sans-serif; --f-b:"IBM Plex Sans","Helvetica Neue",Arial,sans-serif; --f-m:"IBM Plex Mono",ui-monospace,Menlo,monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#15181c; --fg:#e6e9ed; --muted:#9aa3ae; --rule:#2c3238; --panel:#1d2228; --box:#1a1e23; --edge:#7d8792;
  --hi:#4fd1c5; --hi-soft:#123634; --ui:#1b2640; --ui-s:#7f9fe6; --svc:#1a1e23; --svc-s:#9aa3ae; --sc:#16301f; --sc-s:#5fbf80; --db:#33290f; --db-s:#d9a640; color-scheme:dark }} }}
:root[data-theme="dark"] {{ --bg:#15181c; --fg:#e6e9ed; --muted:#9aa3ae; --rule:#2c3238; --panel:#1d2228; --box:#1a1e23; --edge:#7d8792;
  --hi:#4fd1c5; --hi-soft:#123634; --ui:#1b2640; --ui-s:#7f9fe6; --svc:#1a1e23; --svc-s:#9aa3ae; --sc:#16301f; --sc-s:#5fbf80; --db:#33290f; --db-s:#d9a640; color-scheme:dark }}
body {{ background:var(--bg); color:var(--fg); font-family:var(--f-b); font-size:15px; line-height:1.55; padding-block:32px 48px;
  padding-left:max(16px, env(safe-area-inset-left,0px)); padding-right:max(16px, env(safe-area-inset-right,0px)); }}
main {{ max-width:1240px; margin:0 auto; display:grid; gap:24px; }}
.col {{ max-width:70ch; display:grid; gap:10px; min-width:0; }}
h1 {{ font-family:var(--f-d); font-weight:700; font-size:2rem; line-height:1.15; margin:0; text-wrap:balance; }}
h2 {{ font-family:var(--f-d); font-weight:600; font-size:1.15rem; margin:0; }}
.eyebrow {{ font-family:var(--f-m); font-size:.75rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }}
p {{ margin:0; }} .lede {{ color:var(--muted); font-size:1.05rem; }}
.flows {{ display:flex; flex-wrap:wrap; gap:6px; }}
.flows button {{ font-family:var(--f-d); font-size:.95rem; font-weight:600; color:var(--muted); background:none; border:1px solid var(--rule); border-radius:999px; padding:5px 12px; cursor:pointer; }}
.flows button[aria-pressed="true"] {{ color:var(--bg); background:var(--hi); border-color:var(--hi); }}
.flows button:focus-visible {{ outline:2px solid var(--hi); outline-offset:2px; }}
.scroll {{ overflow-x:auto; border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); padding-block:10px; }}
.scroll svg {{ display:block; width:100%; min-width:900px; height:auto; color:var(--edge); font-family:var(--f-d); }}
.host {{ fill:none; stroke:var(--rule); stroke-width:1.5; stroke-dasharray:3 4; }}
.besu {{ fill:var(--panel); stroke:var(--rule); }}
.stack {{ fill:none; stroke:var(--hi); stroke-width:1.2; stroke-dasharray:6 4; opacity:.7; }}
.grp {{ font-family:var(--f-m); font-size:11px; letter-spacing:.6px; fill:var(--muted); }}
.sub, .elab {{ font-size:11px; fill:var(--muted); }}
.edge {{ fill:none; stroke:var(--edge); stroke-width:1.4; transition:stroke .15s, opacity .15s; }}
.edge.dashed {{ stroke-dasharray:6 4; }}
.node rect {{ stroke-width:1.5; transition:opacity .15s; }}
.node text {{ transition:opacity .15s; }}
.actor rect {{ fill:var(--box); stroke:var(--fg); }} .ui rect {{ fill:var(--ui); stroke:var(--ui-s); }}
.svc rect {{ fill:var(--svc); stroke:var(--svc-s); }} .sc rect {{ fill:var(--sc); stroke:var(--sc-s); }}
.db rect, .data rect {{ fill:var(--db); stroke:var(--db-s); }} .ext rect {{ fill:var(--box); stroke:var(--muted); stroke-dasharray:4 3; }}
.test rect {{ fill:var(--box); stroke:var(--muted); stroke-dasharray:6 4; }}
.bt {{ font-size:13.5px; font-weight:600; fill:var(--fg); }} .bs {{ font-size:11px; fill:var(--muted); }}
svg.focus .edge {{ opacity:.18; }} svg.focus .node rect, svg.focus .node text {{ opacity:.35; }}
svg.focus .edge.on {{ opacity:1; stroke:var(--hi); stroke-width:2.4; }}
svg.focus .node.on rect, svg.focus .node.on text {{ opacity:1; }} svg.focus .node.on rect {{ stroke:var(--hi); stroke-width:2.2; }}
.ahon {{ fill:var(--hi); }}
.badge circle {{ fill:var(--hi); }} .badge text {{ fill:var(--bg); font-size:11px; font-weight:700; font-family:var(--f-m); }}
.steps {{ display:grid; gap:6px; margin:0; padding:0; list-style:none; max-width:90ch; }}
.steps li {{ display:grid; grid-template-columns:2.2em 1fr; gap:10px; align-items:baseline; }}
.steps .n {{ font-family:var(--f-m); font-size:.8rem; font-weight:700; color:var(--bg); background:var(--hi); border-radius:999px; text-align:center; line-height:1.7; }}
.steps .rel {{ font-family:var(--f-m); font-size:.75rem; color:var(--muted); }}
table {{ border-collapse:collapse; width:100%; font-size:.9rem; }} th, td {{ text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--rule); }}
th {{ font-family:var(--f-d); font-weight:600; }} td:first-child {{ white-space:nowrap; font-weight:600; }}
.tbl {{ overflow-x:auto; }} code {{ font-family:var(--f-m); font-size:.85em; }}
.src {{ font-size:.85rem; color:var(--muted); border-top:1px solid var(--rule); padding-top:12px; }}
@media (prefers-reduced-motion: reduce) {{ .edge, .node rect, .node text {{ transition:none; }} }}
</style>
<main>
  <div class="col">
    <span class="eyebrow">CDM collateral · architecture · CALM 1.2 · sketch</span>
    <h1>Prototype Architecture</h1>
    <p class="lede">The local prototype for CDM-based initial margin with tokenized collateral on Besu. Pick a flow to see its path and steps.</p>
  </div>
  <div class="flows" role="group" aria-label="Flow">
    <button type="button" data-flow="" aria-pressed="true">All components</button>
    {''.join(f'<button type="button" data-flow="{e(f["unique-id"])}" aria-pressed="false">{e(f["name"])}</button>' for f in flows)}
  </div>
  <figure style="margin:0;display:grid;gap:8px;min-width:0">
    <div class="scroll">{''.join(svg)}</div>
    <figcaption id="cap" class="lede" style="font-size:.95rem">Hover a box or line for its description. Dashed lines: event callbacks and test-only paths.</figcaption>
  </figure>
  <section class="col" id="stepsec" hidden><h2 id="flowname"></h2><p id="flowdesc"></p><ol class="steps" id="steps"></ol></section>
  <section style="display:grid;gap:10px"><h2>Components</h2><div class="tbl"><table><thead><tr><th>Component</th><th>CALM type</th><th>Description</th></tr></thead><tbody>{rows}</tbody></table></div></section>
  <p class="src">Source: <code>architecture/prototype.architecture.json</code> in denisurusov/cdm-collateral (CALM release 1.2, validated with <code>calm validate --strict</code>). Design only; nothing built.</p>
</main>
<script>
(function(){{
  var FLOWS={flow_js}, ENDS={rel_js};
  var svg=document.querySelector('.scroll svg'), badges=document.getElementById('badges');
  var NS='http://www.w3.org/2000/svg';
  function show(id){{
    document.querySelectorAll('.flows button').forEach(function(b){{b.setAttribute('aria-pressed', b.dataset.flow===id?'true':'false');}});
    svg.querySelectorAll('.on').forEach(function(x){{x.classList.remove('on');}});
    svg.querySelectorAll('.edge').forEach(function(x){{x.setAttribute('marker-end','url(#ah)');}});
    while(badges.firstChild) badges.removeChild(badges.firstChild);
    var sec=document.getElementById('stepsec');
    if(!id){{ svg.classList.remove('focus'); sec.hidden=true; return; }}
    var f=FLOWS.filter(function(x){{return x.id===id;}})[0]; if(!f) return;
    svg.classList.add('focus');
    var byRel={{}};
    f.steps.forEach(function(s){{
      var el=document.getElementById('e-'+s.rel); if(!el) return;
      el.classList.add('on'); el.setAttribute('marker-end','url(#ahon)');
      (ENDS[s.rel]||[]).forEach(function(n){{ if(n){{ var g=document.getElementById('n-'+n); if(g) g.classList.add('on'); }} }});
      (byRel[s.rel]=byRel[s.rel]||[]).push(s.n);
    }});
    Object.keys(byRel).forEach(function(rel){{
      var el=document.getElementById('e-'+rel), L=el.getTotalLength(), p=el.getPointAtLength(L/2);
      var label=byRel[rel].join(','), w=Math.max(18, 8+label.length*7);
      var g=document.createElementNS(NS,'g'); g.setAttribute('class','badge');
      var r=document.createElementNS(NS,'rect'); r.setAttribute('x',p.x-w/2); r.setAttribute('y',p.y-9); r.setAttribute('width',w); r.setAttribute('height',18); r.setAttribute('rx',9);
      r.setAttribute('style','fill:var(--hi)');
      var t=document.createElementNS(NS,'text'); t.setAttribute('x',p.x); t.setAttribute('y',p.y+4); t.setAttribute('text-anchor','middle'); t.textContent=label;
      g.appendChild(r); g.appendChild(t); badges.appendChild(g);
    }});
    document.getElementById('flowname').textContent=f.name;
    document.getElementById('flowdesc').textContent=f.description;
    var ol=document.getElementById('steps'); ol.innerHTML='';
    f.steps.forEach(function(s){{
      var li=document.createElement('li'), n=document.createElement('span'), b=document.createElement('div'), r=document.createElement('div');
      n.className='n'; n.textContent=s.n; b.textContent=s.text; r.className='rel'; r.textContent=s.rel; b.appendChild(r);
      li.appendChild(n); li.appendChild(b); ol.appendChild(li);
    }});
    sec.hidden=false;
  }}
  document.querySelectorAll('.flows button').forEach(function(b){{ b.addEventListener('click', function(){{ show(b.dataset.flow); try{{history.replaceState(null,'', b.dataset.flow ? '#'+b.dataset.flow : '#');}}catch(e){{}} }}); }});
  var h=(location.hash||'').slice(1); if(h) show(h);
}})();
</script>'''
open(sys.argv[2], 'w').write(page)
