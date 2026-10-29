#!/usr/bin/env python3
"""Generate deterministic, high-resolution visual captures from the checked-in World Model data.

These are visual QA captures, not screenshots of the Phaser runtime. The npm registry is
unavailable in the current build environment, so this renderer demonstrates the current data
and editor states without claiming a successful app/browser run.
"""
from __future__ import annotations
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'docs' / 'qa'
OUT_W, OUT_H, UPSCALE = 1365, 900, 2
W, H = OUT_W * UPSCALE, OUT_H * UPSCALE


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))

project = load_json(ROOT / 'public/data/worlds/klein-berlin/project.json')
world = load_json(ROOT / 'public' / project['worldIndex'])
asset_catalog = load_json(ROOT / 'public' / project['assetCatalog'])
modules = {}
for district in world['districts']:
    for reference in district['modules']:
        modules[reference['id']] = load_json(ROOT / 'public' / reference['document'])
projection = project['projection']
refs = [(ref, modules[ref['id']]) for district in world['districts'] for ref in district['modules']]
COLORS = {
    'road-centerline': '#3a4656', 'walkway': '#8a949b', 'waterway': '#307f9b',
    'parcel': '#9d8a53', 'building-footprint': '#c17d57', 'plaza': '#87919a',
    'park': '#3f7956', 'walkable-area': '#368f9b', 'collision-area': '#c04f5b',
}
MODULE_COLORS = ['#1c2d32', '#202a39', '#243126', '#28253a']

font_base = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font_bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font_mono = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

def font(size, bold=False, mono=False):
    file = font_mono if mono else (font_bold if bold else font_base)
    return ImageFont.truetype(file, size * UPSCALE)

def px(v): return int(round(v * UPSCALE))
def hex_rgb(col):
    col = col.lstrip('#')
    return tuple(int(col[i:i+2], 16) for i in (0, 2, 4))
def rgba(hex_color, alpha=255): return (*hex_rgb(hex_color), alpha)

def local_world(p, ref):
    x, y = float(p['x']), float(p['y'])
    rot = ref['rotationDegrees']
    if rot == 90: x, y = -y, x
    elif rot == 180: x, y = -x, -y
    elif rot == 270: x, y = y, -x
    return {'x': ref['originMeters']['x'] + x, 'y': ref['originMeters']['y'] + y,
            'z': ref['originMeters']['z'] + float(p.get('z', 0))}

def proj(p):
    return {'x': (p['x'] - p['y']) * projection['tileWidthPx'] / (2 * projection['referenceCellMeters']),
            'y': (p['x'] + p['y']) * projection['tileHeightPx'] / (2 * projection['referenceCellMeters']) - p['z'] * projection['elevationPxPerMeter']}

def proj_local(p, ref, z=0): return proj(local_world({**p, 'z': z}, ref))

all_corners = []
for ref, module in refs:
    bw, bd = module['boundsMeters']['width'], module['boundsMeters']['depth']
    for p in [{'x': 0, 'y': 0}, {'x': bw, 'y': 0}, {'x': bw, 'y': bd}, {'x': 0, 'y': bd}]:
        all_corners.append(proj_local(p, ref))
BOUNDS = {
    'minX': min(p['x'] for p in all_corners), 'maxX': max(p['x'] for p in all_corners),
    'minY': min(p['y'] for p in all_corners), 'maxY': max(p['y'] for p in all_corners),
}
BOUNDS['width'] = BOUNDS['maxX'] - BOUNDS['minX']
BOUNDS['height'] = BOUNDS['maxY'] - BOUNDS['minY']


def pill(draw, xy, text, bg, fg, border=None, fnt=None, padding=(10, 6), radius=8):
    x, y = xy; fnt = fnt or font(11, bold=True)
    b = draw.textbbox((px(x), px(y)), text, font=fnt)
    tw = (b[2]-b[0]) / UPSCALE; th = (b[3]-b[1]) / UPSCALE
    box = (px(x), px(y), px(x + tw + padding[0]*2), px(y + th + padding[1]*2))
    draw.rounded_rectangle(box, radius=px(radius), fill=bg, outline=border, width=px(1) if border else 1)
    draw.text((px(x+padding[0]), px(y+padding[1]-1)), text, font=fnt, fill=fg)
    return (x + tw + padding[0]*2, y + th + padding[1]*2)


def draw_ui(img, mode, geometry_count):
    d = ImageDraw.Draw(img, 'RGBA')
    # Header chrome
    d.rectangle((0, 0, W, px(68)), fill=(15, 23, 42, 247))
    d.line((0, px(67), W, px(67)), fill=(148, 163, 184, 75), width=px(1))
    pill(d, (14, 17), 'WORLD V1.4', (16, 185, 129, 34), '#6ee7b7', (52, 211, 153, 120), font(10, bold=True, mono=True), (8, 5), 7)
    d.text((121*UPSCALE, 17*UPSCALE), 'KLEIN BERLIN', font=font(14, bold=True), fill='#e2e8f0')
    name_w = d.textbbox((121*UPSCALE, 17*UPSCALE), 'KLEIN BERLIN', font=font(14, bold=True))[2]/UPSCALE
    d.text(((121+name_w+10)*UPSCALE, 19*UPSCALE), '· City Builder', font=font(12), fill='#94a3b8')
    buttons = [('Raster AN', False), ('Geometrien AN', False), ('Anschlüsse AN', False), ('Zoom +', False), ('Zoom −', False), ('Bearbeiten AN' if mode != 'world' else 'Bearbeiten', mode != 'world'), ('Zentrieren', False)]
    x = 455
    for text, active in buttons:
        x, _ = pill(d, (x, 17), text, (2, 132, 199, 50) if active else (15, 23, 42, 255), '#bae6fd' if active else '#cbd5e1', (56,189,248,150) if active else (51,65,85,255), font(10, bold=True), (8,5), 8)
        x += 5
    panel_h = 0
    if mode != 'world':
        panel_h = 91
        d.rectangle((0, px(68), W, px(68+panel_h)), fill=(10, 18, 31, 249))
        d.line((0, px(68+panel_h-1), W, px(68+panel_h-1)), fill=(56, 189, 248, 90), width=px(1))
        d.text((px(14), px(80)), 'WERKZEUG', font=font(10, bold=True, mono=True), fill='#7dd3fc')
        x = 92
        tools = [('Auswahl', False), ('Straße zeichnen', mode == 'editor'), ('Fläche zeichnen', mode == 'edited'), ('Gebäudegrundriss', False)]
        for text, active in tools:
            x, _ = pill(d, (x, 75), text, (5,150,105,60) if active else (15,23,42,255), '#d1fae5' if active else '#cbd5e1', (52,211,153,180) if active else (51,65,85,255), font(10,bold=True), (9,6), 8)
            x += 5
        pill(d, (770, 75), 'Flächentyp  Park / Grünfläche  ▾', (15,23,42,255), '#a9b9ca', (51,65,85,255), font(10,bold=True), (9,6), 8)
        pill(d, (1067, 75), 'Rückgängig', (15,23,42,255), '#cbd5e1', (51,65,85,255), font(10,bold=True), (8,6), 8)
        pill(d, (1174, 75), 'JSON exportieren', (15,23,42,255), '#cbd5e1', (51,65,85,255), font(10,bold=True), (8,6), 8)
        hint = 'Startpunkt gesetzt. Klicke im selben Modul den Endpunkt.' if mode == 'editor' else 'Entwurf wird lokal gespeichert · letzte Änderung kann rückgängig gemacht oder exportiert werden.'
        d.text((px(14), px(119)), hint, font=font(10), fill='#9fb0c4')
    return 68 + panel_h


def draw_capture(mode: str, filename: str):
    img = Image.new('RGB', (W, H), '#0b1120')
    draw = ImageDraw.Draw(img, 'RGBA')
    viewport_top = draw_ui(img, mode, 5 + (3 if mode == 'edited' else 0))
    footer_h = 28
    view_h = OUT_H - viewport_top - footer_h
    view_w = OUT_W
    # Viewport background and subtle points
    draw.rectangle((0, px(viewport_top), W, px(viewport_top+view_h)), fill='#101720')
    for x in range(12, OUT_W, 28):
        for y in range(viewport_top+12, viewport_top+view_h, 28):
            draw.ellipse((px(x),px(y),px(x)+px(1),px(y)+px(1)), fill=(36,50,66,150))
    zoom = min((view_w - 170) / max(1, BOUNDS['width']), (view_h - (205 if mode != 'world' else 130)) / max(1, BOUNDS['height']))
    zoom = min(0.48, max(0.12, zoom))
    off_x = (view_w - BOUNDS['width']*zoom)/2 - BOUNDS['minX']*zoom
    off_y = viewport_top + (view_h - BOUNDS['height']*zoom)/2 - BOUNDS['minY']*zoom + 8

    def screen(p): return (px(off_x + p['x']*zoom), px(off_y + p['y']*zoom))
    def line(points, color, width, alpha=255):
        pts=[screen(p) for p in points]
        if len(pts)>=2: draw.line(pts, fill=rgba(color,alpha), width=max(1,px(width)), joint='curve')
    def polygon(points, fill, outline, width=1):
        pts=[screen(p) for p in points]
        if len(pts)>=3:
            draw.polygon(pts, fill=fill)
            draw.line(pts+[pts[0]], fill=outline, width=max(1,px(width)), joint='curve')

    # Module footprints and raster
    for idx,(ref,module) in enumerate(refs):
        bw,bd=module['boundsMeters']['width'],module['boundsMeters']['depth']
        corners=[proj_local(p,ref) for p in [{'x':0,'y':0},{'x':bw,'y':0},{'x':bw,'y':bd},{'x':0,'y':bd}]]
        polygon(corners, rgba(MODULE_COLORS[idx%len(MODULE_COLORS)], 234), rgba('#6d8391', 245), 2.2)
        cell=projection['referenceCellMeters']
        for xx in range(0, int(bw)+1, int(cell)):
            line([proj_local({'x':xx,'y':0},ref),proj_local({'x':xx,'y':bd},ref)], '#90a4b7', 0.65, 70)
        for yy in range(0, int(bd)+1, int(cell)):
            line([proj_local({'x':0,'y':yy},ref),proj_local({'x':bw,'y':yy},ref)], '#90a4b7', 0.65, 70)

    # Geometry from the saved data.
    for ref,module in refs:
        for feature in module['geometries']:
            color=COLORS.get(feature['kind'],'#87919a')
            level=next((l for l in module['levels'] if l['id']==feature['levelId']),None)
            z=level['zMeters'] if level else 0
            geom=feature['geometry']
            if geom['type']=='LineString':
                pts=[proj_local(p,ref,z) for p in geom['pointsMeters']]
                width=feature.get('widthMeters',1)*projection['tileHeightPx']/projection['referenceCellMeters']*zoom
                if feature['kind']=='road-centerline':
                    line(pts,'#7d8993',width+2.5,244)
                    line(pts,color,max(2,width),250)
                    if width>18: line(pts,'#d1b76b',max(1.2,width*.018),185)
                else: line(pts,color,max(1.5,width),210)
            elif geom['type']=='Polygon' and geom['ringsMeters']:
                points=geom['ringsMeters'][0]
                projected=[proj_local(p,ref,z) for p in points]
                fill_alpha=25 if feature['kind']=='parcel' else (185 if feature['kind']=='building-footprint' else 155)
                polygon(projected,rgba(color,fill_alpha),rgba(color,248),2 if feature['kind']=='building-footprint' else 1.2)

    # Project the semantic connectors as markers.
    for ref,module in refs:
        for connector in module['connectors']:
            p=screen(proj_local(connector['positionMeters'],ref))
            color='#39d98a' if connector.get('target') else '#fbbf24'
            rad=px(7)
            draw.ellipse((p[0]-rad*2,p[1]-rad*2,p[0]+rad*2,p[1]+rad*2), fill=rgba(color,55))
            draw.ellipse((p[0]-rad,p[1]-rad,p[0]+rad,p[1]+rad), fill=rgba(color,250), outline=rgba('#e2e8f0',220), width=px(1.5))

    # Module labels, like the in-engine preview.
    for ref,module in refs:
        center=proj_local({'x':module['boundsMeters']['width']/2,'y':module['boundsMeters']['depth']*.10},ref)
        sx,sy=screen(center)
        short=module['name'].replace(' – World Model Fixture','')
        label=ref['id']
        for text,y,color in [(short,sy,'#e2e8f0'),(label,sy+px(16),'#8edcf8')]:
            f=font(10 if text==label else 11,bold=True)
            b=draw.textbbox((0,0),text,font=f); tw=b[2]-b[0]; th=b[3]-b[1]
            x=sx-tw//2
            draw.rounded_rectangle((x-px(7),y-th//2-px(4),x+tw+px(7),y+th//2+px(4)),radius=px(5),fill=(16,23,32,222))
            draw.text((x,y-th//2),text,font=f,fill=color)

    # Example unsaved draft geometry: clearly separate from the checked-in base map.
    if mode == 'edited':
        east=next(ref for ref,module in refs if ref['id']=='kb-innenstadt-ost')
        line([proj_local({'x':12,'y':25},east),proj_local({'x':86,'y':25},east)],'#f0a25b',8*projection['tileHeightPx']/projection['referenceCellMeters']*zoom,246)
        polygon([proj_local(p,east) for p in [{'x':10,'y':66},{'x':30,'y':66},{'x':30,'y':82},{'x':10,'y':82}]],rgba('#38bdf8',76),rgba('#38bdf8',250),2)
        polygon([proj_local(p,east) for p in [{'x':55,'y':33},{'x':73,'y':33},{'x':73,'y':47},{'x':55,'y':47}]],rgba('#f97316',85),rgba('#fb923c',255),2)

    if mode == 'editor':
        east=next(ref for ref,module in refs if ref['id']=='kb-innenstadt-ost')
        p=screen(proj_local({'x':20,'y':30},east))
        r=px(7)
        draw.ellipse((p[0]-px(16),p[1]-px(16),p[0]+px(16),p[1]+px(16)),outline=(251,191,36,125),width=px(2))
        draw.ellipse((p[0]-r,p[1]-r,p[0]+r,p[1]+r),fill='#fbbf24',outline='#101720',width=px(2))

    # Telemetry overlay
    d=ImageDraw.Draw(img,'RGBA')
    tele_y=viewport_top+14
    if mode != 'world': tele_y=viewport_top+14
    tw,th=500,93
    if mode != 'world': tw,th=525,95
    d.rounded_rectangle((px(14),px(tele_y),px(14+tw),px(tele_y+th)),radius=px(13),fill=(15,23,42,232),outline=(148,163,184,70),width=px(1))
    d.text((px(27),px(tele_y+11)),'World Model · Innenstadt',font=font(12,bold=True),fill='#7dd3fc')
    status = ('Weltmodell geladen und validiert · 2 Stadtmodule · 5 bestehende Geometrien · 2 verbundene Straßenanschlüsse' if mode=='world'
              else ('Bearbeitungsmodus · Startpunkt für Straße gesetzt · Endpunkt im selben Modul wählen' if mode=='editor'
                    else 'Entwurf: 2 Module · 3 neue Geometrien · lokal gespeichert und exportierbar'))
    words=status.split(); status_lines=[]; line_text=''
    for word in words:
        candidate=(line_text+' '+word).strip()
        if len(candidate)>70 and line_text:
            status_lines.append(line_text); line_text=word
        else: line_text=candidate
    if line_text: status_lines.append(line_text)
    for index, status_line in enumerate(status_lines[:2]):
        d.text((px(27),px(tele_y+34+index*15)),status_line,font=font(10),fill='#d1d9e3')
    line2=('Weltposition: —' if mode=='world' else ('Startpunkt: X 20.0 m / Y 30.0 m' if mode=='editor' else 'Entwurf: Straße + Grünfläche + Gebäude'))
    d.text((px(27),px(tele_y+71)),line2,font=font(9,mono=True),fill='#94a3b8')
    # Footer
    d.rectangle((0,px(OUT_H-footer_h),W,H),fill=(11,17,32,255))
    d.line((0,px(OUT_H-footer_h),W,px(OUT_H-footer_h)),fill=(148,163,184,65),width=px(1))
    footer=('Ziehen: Karte verschieben · Scrollen: zoomen · Klick: Weltkoordinate anzeigen' if mode=='world'
            else 'Straße: zwei Punkte · Fläche: zwei Ecken · Gebäude: Mittelpunkt · Rückgängig / JSON exportieren')
    b=d.textbbox((0,0),footer,font=font(9))
    d.text(((W-(b[2]-b[0]))//2,px(OUT_H-footer_h+7)),footer,font=font(9),fill='#94a3b8')

    # Downsample for crisp anti-aliased final PNG.
    img=img.resize((OUT_W,OUT_H),Image.Resampling.LANCZOS)
    target=QA/filename
    img.save(target,optimize=True)
    print(f'Wrote {target.relative_to(ROOT)} ({target.stat().st_size:,} bytes)')

if __name__ == '__main__':
    QA.mkdir(parents=True,exist_ok=True)
    draw_capture('world','world-model-view.png')
    draw_capture('editor','world-editor-tools.png')
    draw_capture('edited','world-editor-draft-example.png')
