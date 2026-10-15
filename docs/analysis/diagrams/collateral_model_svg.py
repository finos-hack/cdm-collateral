# Generates the collateral conceptual model SVG in two variants:
#   themed  -> classes styled by the HTML page's CSS tokens
#   static  -> inline colours on a white ground, for GitHub
import sys
from xml.sax.saxutils import escape as e

W, H = 1240, 920
B = {}  # id -> (x, y, w, h, [title lines], [sub lines], cls)
def box(i, x, y, w, h, title, sub, cls): B[i] = (x, y, w, h, title, sub, cls)

# lanes: Pledgor 20..230, Secured party 990..1200 ; centre 260..960
LX, RX, LW = 20, 990, 210
# Agreements
box('MA',   275, 78, 160, 60, ['ISDA Master','Agreement'], ['close-out netting'], 'ctx')
box('CSA',  505, 78, 210, 60, ['Credit support document'], ['CSA · CSD · CTA/SA','threshold · MTA · IA · rounding'], 'logic')
box('ELIG', 785, 78, 160, 60, ['Eligible collateral','schedule'], ['criteria · haircuts · limits'], 'logic')
# Calculation
box('TR',   275, 216, 120, 56, ['Trades'], ['netting set'], 'ctx')
box('EXP',  455, 216, 150, 56, ['Exposure'], ['VM: net MTM','IM: SIMM or schedule'], 'types')
box('CSAMT',650, 216, 130, 56, ['Credit Support','Amount'], [], 'logic')
box('DRA',  825, 216, 120, 56, ['Delivery / Return','Amount'], [], 'logic')
# Lane boxes
box('RESP', 35, 330, 180, 56, ['Respond'], ['agree · partial · dispute'], 'types')
box('CALL', 1005, 330, 180, 56, ['Issue margin call'], ['amount · deadline'], 'types')
box('ALLOC',35, 530, 180, 56, ['Select assets'], ['allocation / optimisation'], 'none')
box('SUB',  35, 630, 180, 56, ['Request substitution'], ['swap posted assets'], 'types')
box('RINT', 35, 760, 180, 56, ['Receive interest'], [], 'ctx')
# Dispute row
box('RECON',275, 440, 130, 56, ['Portfolio','reconciliation'], [], 'none')
box('DISP', 470, 440, 150, 56, ['Dispute resolution'], [], 'types')
# Transfer row
box('TRF',  455, 530, 170, 56, ['Collateral transfer'], ['delivery or return'], 'types')
box('ACCT', 690, 530, 200, 56, ['Collateral account'], ['secured party (VM)','or custodian (IM)'], 'types')
box('BAL',  690, 650, 200, 56, ['Collateral balance'], ['valued after haircuts'], 'types')
box('INT',  690, 760, 200, 56, ['Interest on cash'], ['accrues on cash balance'], 'types')

A = []  # (points, label, (lx, ly, anchor), dashed, emph)
def arr(pts, label=None, lp=None, dashed=False): A.append((pts, label, lp, dashed))
arr([(505,108),(435,108)], 'supplements', (470,101,'middle'))
arr([(715,108),(785,108)], 'contains', (750,101,'middle'))
arr([(355,138),(355,216)], 'governs', (362,182,'start'))
arr([(610,138),(690,216)], 'threshold · IA', (656,170,'start'))
arr([(395,244),(455,244)], 'netting', (425,237,'middle'))
arr([(605,244),(650,244)])
arr([(780,244),(825,244)])
# DRA -> issue call
arr([(885,272),(885,314),(1095,314),(1095,330)], 'if ≥ MTA', (990,309,'middle'))
# negotiation pair
arr([(1005,346),(215,346)], 'margin call', (610,339,'middle'))
arr([(215,372),(1005,372)], 'response', (610,365,'middle'))
# disputed part
arr([(150,386),(150,415),(545,415),(545,440)], 'disputed part', (300,408,'middle'))
arr([(405,468),(470,468)], 'evidence', (437,461,'middle'))
arr([(620,468),(1060,468),(1060,386)], 'resolved: recalculate, re-call', (840,461,'middle'), dashed=True)
# agreed amount -> select assets
arr([(80,386),(80,530)], 'agreed', (86,470,'start'))
arr([(80,401),(80,401)])  # placeholder no-op removed below
A.pop()
arr([(215,558),(455,558)], 'posting', (335,551,'middle'))
arr([(625,558),(690,558)], 'settles', (657,551,'middle'))
arr([(790,586),(790,650)], 'updates', (797,622,'start'))
arr([(790,706),(790,760)], 'cash portion', (797,737,'start'))
arr([(690,788),(215,788)], 'paid or credited', (450,781,'middle'))
arr([(215,658),(540,658),(540,586)], 'new delivery + return', (378,651,'middle'))
# balance feeds the next calculation (outside right lane)
arr([(890,678),(1222,678),(1222,244),(945,244)], 'feeds next call', (940,671,'middle'))

def render(themed):
    o = []
    o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Conceptual model of bilateral collateral management under an ISDA credit support document: agreements set the terms, trades are netted into an exposure, the exposure becomes a delivery or return amount, the secured party issues a margin call, the pledgor responds, agreed amounts are posted into a collateral account, and the collateral balance feeds the next calculation. Boxes are coloured by how far CDM 7.6.0 models each element."' + ('' if themed else ' font-family="Helvetica, Arial, sans-serif"') + '>')
    st = (lambda c, s: f'class="{c}"') if themed else (lambda c, s: s)
    if not themed:
        o.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    mk = 'currentColor' if themed else '#3b424b'
    o.append(f'<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{mk}"/></marker></defs>')
    # lanes
    for x, t, s in ((LX, 'Pledgor', 'posts collateral'), (RX, 'Secured party', 'calls for collateral')):
        o.append(f'<rect x="{x}" y="20" width="{LW}" height="820" rx="10" {st("lane", "fill=\"#f3f5f8\" stroke=\"#c9ced6\"")}/>')
        o.append(f'<text x="{x+LW/2}" y="46" text-anchor="middle" {st("lanet", "font-size=\"15\" font-weight=\"700\" fill=\"#1d2228\"")}>{t}</text>')
        o.append(f'<text x="{x+LW/2}" y="64" text-anchor="middle" {st("lanes", "font-size=\"11\" fill=\"#5b6470\"")}>{s}</text>')
    # groups
    for (x, y, w, h, t) in ((260, 52, 705, 100, 'AGREEMENTS · signed by both parties'),
                            (260, 190, 705, 112, 'CALCULATION · each valuation date · by the calculation agent')):
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" {st("grp", "fill=\"none\" stroke=\"#9aa2ad\" stroke-dasharray=\"2 3\"")}/>')
        top = y < 100
        ty, tx, ta = (y + 16, x + w - 10, 'end') if top else (y + h - 8, x + 10, 'start')
        o.append(f'<text x="{tx}" y="{ty}" text-anchor="{ta}" {st("grpt", "font-size=\"10.5\" letter-spacing=\"0.6\" fill=\"#5b6470\"")}>{t}</text>')
    o.append(f'<text x="275" y="430" {st("grpt", "font-size=\"10.5\" letter-spacing=\"0.6\" fill=\"#5b6470\"")}>LIFECYCLE</text>')
    # arrows (under boxes)
    for pts, label, lp, dashed in A:
        d = ' '.join(f'{x},{y}' for x, y in pts)
        dash = ' stroke-dasharray="6 4"' if dashed else ''
        o.append(f'<polyline points="{d}" fill="none" marker-end="url(#ah)"{dash} ' + st('edge', 'stroke="#3b424b" stroke-width="1.4"') + '/>')
        if label:
            lx, ly, an = lp
            o.append(f'<text x="{lx}" y="{ly}" text-anchor="{an}" ' + st('elab', 'font-size="11" fill="#2a2f36" stroke="#ffffff" stroke-width="4" paint-order="stroke"') + f'>{e(label)}</text>')
    fills = {'logic': ('#d8eedd', '#2e7a47', ''), 'types': ('#f7e7bf', '#a0720f', ''),
             'none': ('#ffffff', '#7d8590', ' stroke-dasharray="5 4"'), 'ctx': ('#ffffff', '#5b6470', '')}
    for i, (x, y, w, h, title, sub, cls) in B.items():
        f, s, da = fills[cls]
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" ' + st(f'b {cls}', f'fill="{f}" stroke="{s}" stroke-width="1.5"{da}') + '/>')
        n = len(title) + len(sub)
        lh_t, lh_s = 15, 12.5
        total = len(title) * lh_t + len(sub) * lh_s
        cy = y + h / 2 - total / 2
        for t in title:
            cy += lh_t
            o.append(f'<text x="{x+w/2}" y="{cy-3}" text-anchor="middle" ' + st('bt', 'font-size="13" font-weight="600" fill="#1d2228"') + f'>{e(t)}</text>')
        for t in sub:
            cy += lh_s
            o.append(f'<text x="{x+w/2}" y="{cy-2}" text-anchor="middle" ' + st('bs', 'font-size="10.5" fill="#3d444d"') + f'>{e(t)}</text>')
    # legend
    lx = 260
    o.append(f'<text x="{lx}" y="868" ' + st('grpt', 'font-size="10.5" letter-spacing="0.6" fill="#5b6470"') + '>CDM 7.6.0 COVERAGE</text>')
    items = [('logic', 'executable: functions, events or samples'), ('types', 'data types only'), ('none', 'not modelled'), ('ctx', 'not scored')]
    x = lx + 150
    for cls, t in items:
        f, s, da = fills[cls]
        o.append(f'<rect x="{x}" y="857" width="22" height="14" rx="3" ' + st(f'b {cls}', f'fill="{f}" stroke="{s}" stroke-width="1.5"{da}') + '/>')
        o.append(f'<text x="{x+30}" y="868" ' + st('bs', 'font-size="11" fill="#3d444d"') + f'>{e(t)}</text>')
        x = {0: 680, 1: 820, 2: 945}.get(items.index((cls, t)), x)
    o.append(f'<text x="260" y="900" ' + st('bs', 'font-size="11" fill="#3d444d"') + '>Not shown: triparty agents, CCP margin, repo (GMRA), securities lending (GMSLA), rehypothecation of posted collateral, close-out on default, regulatory reporting.</text>')
    o.append('</svg>')
    return '\n'.join(o)

out = sys.argv[1]  # e.g. docs/analysis/collateral-conceptual-model -> <out>.themed.svg, <out>.static.svg
open(out + '.themed.svg', 'w').write(render(True))
open(out + '.static.svg', 'w').write(render(False))
