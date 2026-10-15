"""Collateral management flow diagrams, one per agreement family.

Each model below lists lanes (parties), groups, boxes and arrows on a fixed
coordinate grid. Box classes carry the CDM 7.6.0 coverage score from the
coverage matrices in docs/analysis:
  logic = score 3-5 (functions, events or samples), types = 2 (data types only),
  none = 0-1 (absent or enum only), ctx = not scored.

Usage:
  python3 collateral_diagrams.py <out_dir>            # static SVGs for GitHub
  python3 collateral_diagrams.py <out_dir> --themed   # SVGs styled by page CSS
"""
import os
import sys
from xml.sax.saxutils import escape as e

FILLS = {'logic': ('#d8eedd', '#2e7a47', ''), 'types': ('#f7e7bf', '#a0720f', ''),
         'none': ('#ffffff', '#7d8590', ' stroke-dasharray="5 4"'), 'ctx': ('#ffffff', '#5b6470', '')}
LEGEND_DEFAULT = [('logic', 'executable: functions, events or samples'), ('types', 'data types only'),
                  ('none', 'not modelled'), ('ctx', 'not scored')]
LEGEND_X_DEFAULT = [410, 680, 820, 945]


def render(m, themed):
    W, H = m['size']
    o = []
    o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{e(m["aria"])}"'
             + ('' if themed else ' font-family="Helvetica, Arial, sans-serif"') + '>')
    st = (lambda c, s: f'class="{c}"') if themed else (lambda c, s: s)
    if not themed:
        o.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    mk = 'currentColor' if themed else '#3b424b'
    o.append(f'<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{mk}"/></marker></defs>')
    for (x, y, w, h, t, s) in m['lanes']:
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" {st("lane", "fill=\"#f3f5f8\" stroke=\"#c9ced6\"")}/>')
        o.append(f'<text x="{x+w/2}" y="{y+26}" text-anchor="middle" {st("lanet", "font-size=\"15\" font-weight=\"700\" fill=\"#1d2228\"")}>{e(t)}</text>')
        o.append(f'<text x="{x+w/2}" y="{y+44}" text-anchor="middle" {st("lanes", "font-size=\"11\" fill=\"#5b6470\"")}>{e(s)}</text>')
    grpt = st("grpt", "font-size=\"10.5\" letter-spacing=\"0.6\" fill=\"#5b6470\"")
    for (x, y, w, h, t, pos) in m['groups']:
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" {st("grp", "fill=\"none\" stroke=\"#9aa2ad\" stroke-dasharray=\"2 3\"")}/>')
        ty, tx, ta = (y + 16, x + w - 10, 'end') if pos == 'top' else (y + h - 8, x + 10, 'start')
        o.append(f'<text x="{tx}" y="{ty}" text-anchor="{ta}" {grpt}>{e(t)}</text>')
    for (x, y, t) in m.get('labels', []):
        o.append(f'<text x="{x}" y="{y}" {grpt}>{e(t)}</text>')
    for a in m['arrows']:
        pts, label, lp = a[0], a[1] if len(a) > 1 else None, a[2] if len(a) > 2 else None
        opts = a[3] if len(a) > 3 else {}
        d = ' '.join(f'{x},{y}' for x, y in pts)
        dash = ' stroke-dasharray="6 4"' if opts.get('dashed') else ''
        start = ' marker-start="url(#ah)"' if opts.get('both') else ''
        o.append(f'<polyline points="{d}" fill="none"{start} marker-end="url(#ah)"{dash} ' + st('edge', 'stroke="#3b424b" stroke-width="1.4"') + '/>')
        if label:
            lx, ly, an = lp
            o.append(f'<text x="{lx}" y="{ly}" text-anchor="{an}" ' + st('elab', 'font-size="11" fill="#2a2f36" stroke="#ffffff" stroke-width="4" paint-order="stroke"') + f'>{e(label)}</text>')
    for i, (x, y, w, h, title, sub, cls) in m['boxes'].items():
        f, s, da = FILLS[cls]
        o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" ' + st(f'b {cls}', f'fill="{f}" stroke="{s}" stroke-width="1.5"{da}') + '/>')
        lh_t, lh_s = 15, 12.5
        total = len(title) * lh_t + len(sub) * lh_s
        cy = y + h / 2 - total / 2
        for t in title:
            cy += lh_t
            o.append(f'<text x="{x+w/2}" y="{cy-3}" text-anchor="middle" ' + st('bt', 'font-size="13" font-weight="600" fill="#1d2228"') + f'>{e(t)}</text>')
        for t in sub:
            cy += lh_s
            o.append(f'<text x="{x+w/2}" y="{cy-2}" text-anchor="middle" ' + st('bs', 'font-size="10.5" fill="#3d444d"') + f'>{e(t)}</text>')
    ly = m['legend_y']
    o.append(f'<text x="260" y="{ly}" {grpt}>CDM 7.6.0 COVERAGE</text>')
    items = m.get('legend', LEGEND_DEFAULT)
    for (cls, t), x in zip(items, m.get('legend_x', LEGEND_X_DEFAULT)):
        f, s, da = FILLS[cls]
        o.append(f'<rect x="{x}" y="{ly-11}" width="22" height="14" rx="3" ' + st(f'b {cls}', f'fill="{f}" stroke="{s}" stroke-width="1.5"{da}') + '/>')
        o.append(f'<text x="{x+30}" y="{ly}" ' + st('bs', 'font-size="11" fill="#3d444d"') + f'>{e(t)}</text>')
    for k, line in enumerate(m.get('footnote', [])):
        o.append(f'<text x="260" y="{ly+32+k*16}" ' + st('bs', 'font-size="11" fill="#3d444d"') + f'>{e(line)}</text>')
    o.append('</svg>')
    return '\n'.join(o)


def lanes2(t1, s1, t2, s2, y=20, h=820):
    return [(20, y, 210, h, t1, s1), (990, y, 210, h, t2, s2)]


MODELS = {}

# ---------------------------------------------------------------- ISDA CSA
MODELS['csa'] = dict(
    size=(1240, 920),
    aria='Conceptual model of bilateral collateral management under an ISDA credit support document: agreements set the terms, trades are netted into an exposure, the exposure becomes a delivery or return amount, the secured party issues a margin call, the pledgor responds, agreed amounts are posted into a collateral account, and the collateral balance feeds the next calculation. Boxes are coloured by how far CDM 7.6.0 models each element.',
    lanes=lanes2('Pledgor', 'posts collateral', 'Secured party', 'calls for collateral'),
    groups=[(260, 52, 705, 100, 'AGREEMENTS · signed by both parties', 'top'),
            (260, 190, 705, 112, 'CALCULATION · each valuation date · by the calculation agent', 'bottom')],
    labels=[(275, 430, 'LIFECYCLE')],
    boxes={
        'MA': (275, 78, 160, 60, ['ISDA Master', 'Agreement'], ['close-out netting elections'], 'types'),
        'CSA': (505, 78, 210, 60, ['Credit support document'], ['CSA · CSD · CTA/SA', 'threshold · MTA · IA · rounding'], 'logic'),
        'ELIG': (785, 78, 160, 60, ['Eligible collateral', 'schedule'], ['criteria · haircuts · limits'], 'logic'),
        'TR': (275, 216, 120, 56, ['Netting set'], ['trades under one MA'], 'none'),
        'EXP': (455, 216, 150, 56, ['Exposure'], ['VM: net MTM', 'IM: SIMM or schedule'], 'types'),
        'CSAMT': (650, 216, 130, 56, ['Credit Support', 'Amount'], [], 'logic'),
        'DRA': (825, 216, 120, 56, ['Delivery / Return', 'Amount'], [], 'logic'),
        'RESP': (35, 330, 180, 56, ['Respond'], ['agree · partial · dispute'], 'types'),
        'CALL': (1005, 330, 180, 56, ['Issue margin call'], ['amount · deadline'], 'types'),
        'ALLOC': (35, 530, 180, 56, ['Select assets'], ['allocation / optimisation'], 'none'),
        'SUB': (35, 630, 180, 56, ['Request substitution'], ['swap posted assets'], 'types'),
        'RINT': (35, 760, 180, 56, ['Receive interest'], [], 'ctx'),
        'RECON': (275, 440, 130, 56, ['Portfolio', 'reconciliation'], [], 'none'),
        'DISP': (470, 440, 150, 56, ['Dispute resolution'], [], 'types'),
        'TRF': (455, 530, 170, 56, ['Collateral transfer'], ['delivery or return'], 'types'),
        'ACCT': (690, 530, 200, 56, ['Collateral account'], ['secured party (VM)', 'or custodian (IM)'], 'types'),
        'BAL': (690, 650, 200, 56, ['Collateral balance'], ['valued after haircuts'], 'types'),
        'INT': (690, 760, 200, 56, ['Interest on cash'], ['accrues on cash balance'], 'types'),
    },
    arrows=[
        ([(505, 108), (435, 108)], 'supplements', (470, 101, 'middle')),
        ([(715, 108), (785, 108)], 'contains', (750, 101, 'middle')),
        ([(355, 138), (355, 216)], 'governs', (362, 182, 'start')),
        ([(610, 138), (690, 216)], 'threshold · IA', (656, 170, 'start')),
        ([(395, 244), (455, 244)], 'net', (425, 237, 'middle')),
        ([(605, 244), (650, 244)],),
        ([(780, 244), (825, 244)],),
        ([(885, 272), (885, 314), (1095, 314), (1095, 330)], 'if ≥ MTA', (990, 309, 'middle')),
        ([(1005, 346), (215, 346)], 'margin call', (610, 339, 'middle')),
        ([(215, 372), (1005, 372)], 'response', (610, 365, 'middle')),
        ([(150, 386), (150, 415), (545, 415), (545, 440)], 'disputed part', (300, 408, 'middle')),
        ([(405, 468), (470, 468)], 'evidence', (437, 461, 'middle')),
        ([(620, 468), (1060, 468), (1060, 386)], 'resolved: recalculate, re-call', (840, 461, 'middle'), {'dashed': True}),
        ([(80, 386), (80, 530)], 'agreed', (86, 470, 'start')),
        ([(215, 558), (455, 558)], 'posting', (335, 551, 'middle')),
        ([(625, 558), (690, 558)], 'settles', (657, 551, 'middle')),
        ([(790, 586), (790, 650)], 'updates', (797, 622, 'start')),
        ([(790, 706), (790, 760)], 'cash portion', (797, 737, 'start')),
        ([(690, 788), (215, 788)], 'paid or credited', (450, 781, 'middle')),
        ([(215, 658), (540, 658), (540, 586)], 'new delivery + return', (378, 651, 'middle')),
        ([(890, 678), (1222, 678), (1222, 244), (945, 244)], 'feeds next call', (940, 671, 'middle')),
    ],
    legend_y=868,
    footnote=['Not shown: triparty agents, CCP margin, repo (GMRA), securities lending (GMSLA), rehypothecation of posted collateral, close-out on default, regulatory reporting.'],
)

# ---------------------------------------------------------------- Repo (GMRA)
MODELS['repo'] = dict(
    size=(1240, 1010),
    aria='Repo under the ICMA GMRA: the seller delivers securities against the purchase price and later pays the repurchase price for equivalent securities. Margin is maintained on the net exposure across all transactions, by margin transfers or by repricing or adjusting single transactions. Boxes are coloured by how far CDM 7.6.0 models each element.',
    lanes=lanes2('Seller', 'delivers securities, borrows cash', 'Buyer', 'pays cash, holds securities', h=895),
    groups=[(260, 52, 705, 100, 'AGREEMENT · signed by both parties', 'top'),
            (260, 190, 705, 112, 'TRANSACTION · per repo trade', 'top')],
    labels=[(460, 330, 'DAILY · MARGIN MAINTENANCE'), (275, 530, 'DURING THE TERM'), (275, 730, 'START AND END LEGS · DvP')],
    boxes={
        'GMRA': (275, 78, 170, 60, ['GMRA'], ['Annex I elections', 'default and close-out'], 'none'),
        'BASKET': (505, 78, 210, 60, ['Eligible collateral'], ['basket · criteria'], 'logic'),
        'MR': (785, 78, 160, 60, ['Margin ratio /', 'haircut'], [], 'logic'),
        'TX': (275, 216, 150, 56, ['Repo transaction'], ['purchase and repurchase date', 'repo rate'], 'logic'),
        'PP': (480, 216, 170, 56, ['Purchase price'], ['market value ÷ margin ratio'], 'logic'),
        'RP': (705, 216, 240, 56, ['Repurchase price'], ['purchase price + interest at repo rate'], 'logic'),
        'REPRICE': (275, 340, 140, 56, ['Reprice /', 'adjustment'], ['per transaction'], 'logic'),
        'NETEXP': (455, 340, 250, 56, ['Net exposure (netting)'], ['all transactions: repurchase price', 'vs market value of securities'], 'none'),
        'SMT': (35, 430, 180, 56, ['Margin transfer'], ['cash or securities'], 'types'),
        'MT': (455, 430, 250, 56, ['Margin transfer'], ['to the party with net exposure'], 'types'),
        'BMT': (1005, 430, 180, 56, ['Margin transfer'], ['cash or securities'], 'types'),
        'SUBR': (35, 545, 180, 56, ['Request substitution'], [], 'logic'),
        'SUB': (455, 545, 250, 56, ['Substitution'], ['new collateral, same transaction'], 'logic'),
        'SUBA': (1005, 545, 180, 56, ['Accept'], ['return old securities'], 'logic'),
        'RINC': (35, 630, 180, 56, ['Receive income'], [], 'ctx'),
        'MP': (455, 630, 250, 56, ['Manufactured payment'], ['coupon passed back to the seller'], 'ctx'),
        'INC': (1005, 630, 180, 56, ['Receive coupon'], ['on purchased securities'], 'ctx'),
        'STS': (35, 745, 180, 56, ['Start leg'], ['deliver securities'], 'logic'),
        'STB': (1005, 745, 180, 56, ['Start leg'], ['pay purchase price'], 'logic'),
        'ENS': (35, 835, 180, 56, ['Repurchase'], ['pay repurchase price'], 'logic'),
        'ENB': (1005, 835, 180, 56, ['Repurchase'], ['return equivalent securities'], 'logic'),
    },
    arrows=[
        ([(350, 138), (350, 216)], 'governs', (357, 182, 'start')),
        ([(560, 138), (405, 216)], 'eligible securities', (488, 170, 'middle')),
        ([(865, 138), (600, 216)], 'margin ratio', (760, 170, 'middle')),
        ([(425, 244), (480, 244)],),
        ([(650, 244), (705, 244)],),
        ([(825, 272), (825, 368), (705, 368)], 'daily', (832, 330, 'start')),
        ([(455, 368), (415, 368)], 'or', (435, 361, 'middle')),
        ([(345, 340), (345, 272)], 'new price or quantity', (352, 315, 'start'), {'dashed': True}),
        ([(580, 396), (580, 430)], 'if above minimum', (587, 418, 'start')),
        ([(455, 458), (215, 458)], 'either direction', (335, 451, 'middle'), {'both': True}),
        ([(705, 458), (1005, 458)], 'either direction', (855, 451, 'middle'), {'both': True}),
        ([(215, 573), (455, 573)], 'new securities', (335, 566, 'middle')),
        ([(705, 573), (1005, 573)], 'new securities', (855, 566, 'middle')),
        ([(1005, 658), (705, 658)], 'coupon', (855, 651, 'middle')),
        ([(455, 658), (215, 658)], 'equal amount', (335, 651, 'middle')),
        ([(215, 761), (1005, 761)], 'purchased securities', (610, 754, 'middle')),
        ([(1005, 787), (215, 787)], 'cash = purchase price', (610, 780, 'middle')),
        ([(215, 851), (1005, 851)], 'cash = repurchase price', (610, 844, 'middle')),
        ([(1005, 877), (215, 877)], 'equivalent securities', (610, 870, 'middle')),
    ],
    legend_y=950,
    legend=[('logic', 'executable: functions, events or samples'), ('types', 'data types only'), ('none', 'absent or enum only'), ('ctx', 'not scored')],
    legend_x=[410, 680, 820, 975],
    footnote=['Not shown: buy/sell-back, triparty (see the triparty diagram), close-out on default, rate changes and interim interest payments.'],
)

# ---------------------------------------------------------------- Securities lending (GMSLA)
MODELS['seclending'] = dict(
    size=(1240, 1270),
    aria='Securities lending under the ISLA GMSLA: the lender delivers securities and the borrower posts collateral worth the loan value times the margin. The loan is marked to market daily, the borrower pays a fee or receives a rebate on cash collateral, manufactured payments pass income back to the lender, and on return or recall the securities and collateral go back. Boxes are coloured by how far CDM 7.6.0 models each element.',
    lanes=lanes2('Lender', 'lends securities, holds collateral', 'Borrower', 'borrows securities, posts collateral', h=1155),
    groups=[(260, 52, 705, 100, 'AGREEMENT · signed by both parties', 'top'),
            (260, 190, 705, 112, 'LOAN · per transaction', 'bottom')],
    labels=[(275, 330, 'DAILY · MARKING TO MARKET'), (275, 530, 'DURING THE LOAN'), (275, 990, 'LOAN START AND RETURN')],
    boxes={
        'GMSLA': (275, 78, 170, 60, ['GMSLA'], ['elections · clause library'], 'types'),
        'SCHED': (505, 78, 210, 60, ['Collateral schedule'], ['eligible collateral · margin'], 'logic'),
        'NET': (785, 78, 160, 60, ['Netting and', 'aggregation'], ['para 5.4 · 5.6 elections'], 'types'),
        'LOAN': (275, 216, 150, 56, ['Loan'], ['securities · term or open'], 'logic'),
        'LV': (480, 216, 170, 56, ['Loan value'], ['market value of securities'], 'ctx'),
        'REQ': (705, 216, 240, 56, ['Required collateral'], ['loan value × margin'], 'logic'),
        'MTM': (455, 340, 250, 56, ['Mark to market'], ['posted collateral vs required'], 'types'),
        'LMC': (35, 430, 180, 56, ['Margin delivery'], ['collateral either way'], 'types'),
        'MC': (455, 430, 250, 56, ['Collateral call'], ['deliver more or return excess'], 'types'),
        'BMC': (1005, 430, 180, 56, ['Margin delivery'], ['collateral either way'], 'types'),
        'LFEE': (35, 545, 180, 56, ['Receive fee'], [], 'logic'),
        'FEE': (455, 545, 250, 56, ['Lending fee'], ['billing and invoice'], 'logic'),
        'BFEE': (1005, 545, 180, 56, ['Pay fee'], ['non-cash collateral'], 'logic'),
        'LREB': (35, 630, 180, 56, ['Pay rebate'], [], 'types'),
        'REB': (455, 630, 250, 56, ['Rebate'], ['interest on cash collateral'], 'types'),
        'BREB': (1005, 630, 180, 56, ['Receive rebate'], ['cash collateral'], 'types'),
        'LSUB': (35, 715, 180, 56, ['Accept'], ['return old collateral'], 'logic'),
        'SUB': (455, 715, 250, 56, ['Substitution'], ['replace posted collateral'], 'logic'),
        'BSUB': (1005, 715, 180, 56, ['Request substitution'], [], 'logic'),
        'LINC': (35, 800, 180, 56, ['Receive income'], [], 'ctx'),
        'MP': (455, 800, 250, 56, ['Manufactured payment'], ['dividend or coupon passed back'], 'types'),
        'BINC': (1005, 800, 180, 56, ['Receive dividend'], ['on borrowed securities'], 'ctx'),
        'LREC': (35, 885, 180, 56, ['Recall'], ['securities needed back'], 'types'),
        'BREC': (1005, 885, 180, 56, ['Return on recall'], [], 'types'),
        'LST': (35, 1005, 180, 56, ['Loan start'], ['deliver securities'], 'logic'),
        'BST': (1005, 1005, 180, 56, ['Loan start'], ['deliver collateral'], 'logic'),
        'LRT': (35, 1095, 180, 56, ['Return'], ['return collateral'], 'logic'),
        'BRT': (1005, 1095, 180, 56, ['Return'], ['return equivalent securities'], 'logic'),
    },
    arrows=[
        ([(350, 138), (350, 216)], 'governs', (357, 182, 'start')),
        ([(610, 138), (780, 216)], 'margin', (700, 170, 'start')),
        ([(425, 244), (480, 244)],),
        ([(650, 244), (705, 244)], '× margin', (677, 237, 'middle')),
        ([(825, 272), (825, 368), (705, 368)], 'daily', (832, 330, 'start')),
        ([(580, 396), (580, 430)], 'if above minimum', (587, 418, 'start')),
        ([(455, 458), (215, 458)], 'either direction', (335, 451, 'middle'), {'both': True}),
        ([(705, 458), (1005, 458)], 'either direction', (855, 451, 'middle'), {'both': True}),
        ([(1005, 573), (705, 573)], 'fee', (855, 566, 'middle')),
        ([(455, 573), (215, 573)],),
        ([(215, 658), (455, 658)], 'rebate', (335, 651, 'middle')),
        ([(705, 658), (1005, 658)],),
        ([(1005, 743), (705, 743)], 'new collateral', (855, 736, 'middle')),
        ([(455, 743), (215, 743)], 'new collateral', (335, 736, 'middle')),
        ([(1005, 828), (705, 828)], 'income', (855, 821, 'middle')),
        ([(455, 828), (215, 828)], 'equal amount', (335, 821, 'middle')),
        ([(215, 913), (1005, 913)], 'recall notice', (610, 906, 'middle')),
        ([(215, 1021), (1005, 1021)], 'loaned securities', (610, 1014, 'middle')),
        ([(1005, 1047), (215, 1047)], 'collateral: cash or securities', (610, 1040, 'middle')),
        ([(1005, 1111), (215, 1111)], 'equivalent securities', (610, 1104, 'middle')),
        ([(215, 1137), (1005, 1137)], 'collateral returned', (610, 1130, 'middle')),
    ],
    legend_y=1210,
    legend=[('logic', 'executable: functions, events or samples'), ('types', 'data types only'), ('none', 'absent or enum only'), ('ctx', 'not scored')],
    legend_x=[410, 680, 820, 975],
    footnote=['Lenders often act through an agent lender who allocates loans across many lenders (trade allocation is modelled in CDM; not shown).',
              'Not shown: triparty (see the triparty diagram), pledge structure (GMSLA 2018), close-out on default.'],
)

# ---------------------------------------------------------------- Triparty
MODELS['triparty'] = dict(
    size=(1240, 960),
    aria='Triparty collateral management: the collateral giver and receiver agree the exposure amount and instruct the triparty agent, which matches the instructions, selects eligible assets from the giver inventory under the collateral profile, settles them on its own books, revalues daily and re-allocates, handles substitutions and reports positions to both parties. Boxes are coloured by how far CDM 7.6.0 models each element.',
    lanes=[(20, 20, 210, 820, 'Collateral giver', 'e.g. repo seller'),
           (470, 170, 280, 670, 'Triparty agent', 'values, allocates, settles'),
           (990, 20, 210, 820, 'Collateral receiver', 'e.g. repo buyer')],
    groups=[(260, 52, 705, 100, 'AGREEMENTS', 'top')],
    boxes={
        'TRADE': (275, 78, 170, 60, ['Repo or securities', 'loan'], ['GMRA or GMSLA'], 'none'),
        'TSA': (525, 78, 170, 60, ['Triparty service', 'agreement'], ['agent with both parties'], 'none'),
        'PROF': (775, 78, 170, 60, ['Collateral profile'], ['eligible basket · haircuts', 'concentration limits'], 'logic'),
        'GI': (35, 250, 180, 56, ['Instruct'], ['amount · term · profile'], 'ctx'),
        'MATCH': (500, 250, 220, 56, ['Match instructions'], ['net exposure to cover'], 'none'),
        'RI': (1005, 250, 180, 56, ['Instruct'], ['amount · term · profile'], 'ctx'),
        'INV': (35, 350, 180, 56, ['Collateral inventory'], ['held at the agent'], 'types'),
        'ALLOC': (500, 350, 220, 56, ['Allocate collateral'], ['select eligible assets'], 'none'),
        'SETTLE': (500, 450, 220, 56, ['Settle on agent books'], ['giver account → receiver account'], 'none'),
        'RACC': (1005, 450, 180, 56, ['Collateral account'], ['at the agent'], 'types'),
        'REVAL': (500, 550, 220, 56, ['Daily revaluation'], ['top up or return excess'], 'none'),
        'SUBR': (35, 650, 180, 56, ['Request substitution'], [], 'types'),
        'SUB': (500, 650, 220, 56, ['Substitute'], ['by the agent'], 'types'),
        'GREP': (35, 750, 180, 56, ['Statements'], [], 'ctx'),
        'REP': (500, 750, 220, 56, ['Report'], ['positions and valuations'], 'none'),
        'RREP': (1005, 750, 180, 56, ['Statements'], [], 'ctx'),
    },
    arrows=[
        ([(610, 138), (610, 170)], 'appoints', (617, 160, 'start')),
        ([(860, 138), (860, 232), (640, 232), (640, 250)], 'eligibility rules', (800, 225, 'middle')),
        ([(215, 278), (500, 278)], 'instruction', (357, 271, 'middle')),
        ([(1005, 278), (720, 278)], 'instruction', (862, 271, 'middle')),
        ([(610, 306), (610, 350)],),
        ([(215, 370), (500, 370)], 'assets', (357, 363, 'middle')),
        ([(610, 406), (610, 450)],),
        ([(720, 478), (1005, 478)], 'collateral', (862, 471, 'middle')),
        ([(610, 506), (610, 550)],),
        ([(500, 578), (485, 578), (485, 392), (500, 392)], 're-allocate', (478, 485, 'end'), {'dashed': True}),
        ([(215, 678), (500, 678)], 'request', (357, 671, 'middle')),
        ([(500, 778), (215, 778)],),
        ([(720, 778), (1005, 778)],),
    ],
    legend_y=880,
    legend=[('logic', 'executable: functions, events or samples'), ('types', 'data types only'), ('none', 'absent or enum only'), ('ctx', 'not scored')],
    legend_x=[410, 680, 820, 975],
    footnote=['Triparty is a way of running repo or securities lending: the parties agree the exposure; the agent selects, values and moves the collateral.',
              'Not shown: corporate actions on collateral, billing by the agent, central bank triparty (SCoRE).'],
)

# ---------------------------------------------------------------- CCP margin
MODELS['ccp'] = dict(
    size=(1240, 940),
    aria='Cleared margin at a central counterparty: cleared trades are held as positions in house and client accounts; the CCP computes initial margin with its own model and variation margin from settlement prices and issues a margin call that is not negotiated; the clearing member pays into segregated margin accounts and calls margin from its clients; the CCP pays interest on cash margin and runs default management and porting. Boxes are coloured by how far CDM 7.6.0 models each element.',
    lanes=lanes2('Clearing member', 'and its clients', 'CCP', 'central counterparty', h=810),
    groups=[(260, 52, 705, 100, 'AGREEMENTS', 'top'),
            (260, 190, 705, 112, 'CALCULATION · daily and intraday · by the CCP', 'bottom')],
    labels=[(275, 330, 'MARGIN CALL · not negotiated'), (275, 530, 'CLIENT CLEARING'), (275, 730, 'DEFAULT')],
    boxes={
        'RULE': (275, 78, 170, 60, ['CCP rulebook'], ['membership · margin · default'], 'none'),
        'CDEA': (505, 78, 210, 60, ['Client clearing agreement'], ['e.g. FIA / ISDA CDEA'], 'none'),
        'ELIG': (785, 78, 160, 60, ['Eligible collateral', 'and haircuts'], [], 'logic'),
        'TR': (275, 216, 130, 56, ['Cleared trades'], ['novation or open offer'], 'logic'),
        'ACC': (440, 216, 160, 56, ['Positions (netted)'], ['per house · client account'], 'types'),
        'IM': (635, 216, 130, 56, ['Initial margin'], ['CCP model (SPAN, VaR)'], 'none'),
        'VM': (800, 216, 145, 56, ['Variation margin'], ['settlement prices'], 'types'),
        'PAY': (35, 340, 180, 56, ['Pay margin'], ['cash or eligible securities'], 'types'),
        'CALL': (1005, 340, 180, 56, ['Margin call'], ['IM + VM, by deadline'], 'types'),
        'TRF': (455, 430, 250, 56, ['Collateral transfer'], ['eligible assets, after haircuts'], 'types'),
        'MACC': (1005, 430, 180, 56, ['Margin accounts'], ['house · client'], 'types'),
        'CC': (35, 545, 180, 56, ['Call client margin'], ['at least the CCP amount'], 'ctx'),
        'CLIENT': (455, 545, 250, 56, ['Client'], ['posts margin to the member'], 'ctx'),
        'RINT': (35, 630, 180, 56, ['Receive interest'], [], 'ctx'),
        'INT': (1005, 630, 180, 56, ['Interest on cash'], [], 'types'),
        'RCV': (35, 745, 180, 56, ['Receiving member'], [], 'ctx'),
        'PORT': (455, 745, 250, 56, ['Porting'], ['client positions and margin'], 'none'),
        'DEF': (1005, 745, 180, 56, ['Default management'], ['auction · default fund'], 'none'),
    },
    arrows=[
        ([(340, 138), (340, 216)], 'governs', (347, 182, 'start')),
        ([(610, 138), (540, 216)], 'client accounts', (585, 182, 'start')),
        ([(405, 244), (440, 244)],),
        ([(600, 244), (635, 244)],),
        ([(560, 216), (560, 204), (872, 204), (872, 216)],),
        ([(700, 272), (700, 314), (1060, 314), (1060, 340)],),
        ([(872, 272), (872, 300), (1130, 300), (1130, 340)],),
        ([(1005, 368), (215, 368)], 'margin call', (610, 361, 'middle')),
        ([(125, 396), (125, 458), (455, 458)], 'payment', (290, 451, 'middle')),
        ([(705, 458), (1005, 458)], 'settles', (855, 451, 'middle')),
        ([(215, 573), (455, 573)], 'client margin call', (335, 566, 'middle'), {'both': True}),
        ([(1005, 658), (215, 658)], 'interest on cash margin', (610, 651, 'middle')),
        ([(1005, 773), (705, 773)], 'on member default', (855, 766, 'middle')),
        ([(455, 773), (215, 773)], 'transfer', (335, 766, 'middle')),
    ],
    legend_y=870,
    legend=[('logic', 'executable: functions, events or samples'), ('types', 'data types only'), ('none', 'absent or enum only'), ('ctx', 'not scored')],
    legend_x=[410, 680, 820, 975],
    footnote=['Clients are shown as one box; under individual segregation each client has its own account at the CCP.',
              'Not shown: default fund contributions, intraday calls, clearing of repo and securities lending.'],
)

if __name__ == '__main__':
    out = sys.argv[1]
    themed = '--themed' in sys.argv
    os.makedirs(out, exist_ok=True)
    names = [a for a in sys.argv[2:] if not a.startswith('--')] or list(MODELS)
    for name in names:
        suffix = '.themed.svg' if themed else '.svg'
        with open(os.path.join(out, f'collateral-flow-{name}{suffix}'), 'w') as f:
            f.write(render(MODELS[name], themed))
