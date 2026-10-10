"""Pack image_gen atlases without recoloring or removing generated alpha.
Usage: python multiplayer-farm/build/pack-nature.py source-manifest.json
Sources contain id/path/prompt. Crops follow transparent gutters, not leaf edges.
"""
import hashlib, json, sys
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2] / 'public/assets/nature'
STAGES = ['seedling','young','mature','giant','guardian','summer','autumn','winter']
TREES = ['cherry','pine','maple','willow','birch','oak','bamboo','metasequoia']
DEBRIS = {
 'twigs':['twig_a','twig_b','twig_c','forked_twig','leafy_branch','thick_branch'],
 'stones':['stone_a','stone_b','moss_stone','flat_stone','dark_stone','small_stone_cluster'],
 'weeds':['weed','weed_b','weed_c','clover','tall_grass','short_grass'],
}
FLOWERS=['farm_white_wildflower','farm_yellow_wildflower','farm_pink_wildflower','farm_purple_wildflower',
 'flower_daisy','flower_poppy','flower_bluebell','flower_hydrangea','flower_lavender']
CROPS=['pinktulip','sweetpea','springonion','coolcucumber','watermelon','lavender','rubybeet','chrysanthemum','scarletbean','icelettuce','snowpea','frostflower']

def cuts(projection, count):
 size=len(projection); out=[0]
 for i in range(1,count):
  center=i*size/count; lo=round(center-size/count*.32); hi=round(center+size/count*.32)
  out.append(min(range(lo,hi),key=lambda x:(projection[max(0,x-1):x+2].sum(),abs(x-center))))
 return out+[size]

def split(im, columns, rows, key):
 # The pine atlas has staggered rows; use inspected transparent cell bounds.
 if key=='pine':
  boxes=[(0,0,442,409),(443,0,801,443),(801,0,1247,443),(1247,0,1774,456),
         (0,409,529,887),(529,456,927,887),(927,456,1341,887),(1341,456,1774,887)]
  return [im.crop(b) for b in boxes]
 mask=np.array(im.getchannel('A'))>48
 ys=cuts(mask.sum(axis=1),rows); cells=[]
 for r in range(rows):
  xs=cuts(mask[ys[r]:ys[r+1]].sum(axis=0),columns)
  cells.extend(im.crop((xs[c],ys[r],xs[c+1],ys[r+1])) for c in range(columns))
 return cells

def save(cell,path,size,base=.94):
 if path.exists() and path.stat().st_size:
  try:
   Image.open(path).verify(); return
  except Exception: pass
 # Determine a useful bound, retaining the original RGBA within that rectangle.
 box=cell.getchannel('A').point(lambda x:255 if x>16 else 0).getbbox()
 if not box: raise ValueError(f'Empty cell {path}')
 cell=cell.crop(box)
 w,h=size; cell.thumbnail((round(w*.94),round(h*(base-.03))),Image.Resampling.LANCZOS)
 out=Image.new('RGBA',size)
 out.alpha_composite(cell,((w-cell.width)//2,round(h*base)-cell.height))
 path.parent.mkdir(parents=True,exist_ok=True)
 temporary=path.with_suffix('.tmp')
 out.save(temporary,'WEBP',quality=90,method=6)
 Image.open(temporary).verify()
 temporary.replace(path)

sources=json.load(open(sys.argv[1])); prompts=[]
for s in sources:
 key=s['id']; im=Image.open(s['path'])
 if im.mode!='RGBA' or im.getchannel('A').getextrema()[0]!=0: raise ValueError(f'No transparent alpha: {key}')
 if key in TREES:
  sizes=[(56,72),(128,172),(256,320),(344,424),(432,540)]+[(256,320)]*3
  for stage,cell,size in zip(STAGES,split(im,4,2,key),sizes):save(cell,ROOT/'trees'/f'tree_{key}_{stage}.webp',size)
 elif key in DEBRIS:
  for name,cell in zip(DEBRIS[key],split(im,3,2,key)):save(cell,ROOT/'debris'/f'farm_{name}.webp',(80,52) if key=='twigs' else (68,68))
 elif key=='flowers':
  for name,cell in zip(FLOWERS,split(im,3,3,key)):
   save(cell,ROOT/('debris' if name.startswith('farm_') else 'flowers')/f'{name}.webp',(68,68) if name.startswith('farm_') else (112,104))
 elif key=='crops':
  for name,cell in zip(CROPS,split(im,4,3,key)):save(cell,ROOT/'crops'/f'{name}.webp',(80,104),.8)
 prompts.append({'id':key,'prompt':s['prompt'],'tool':'built-in image_gen','transparent_background':True,'source_sha256':hashlib.sha256(Path(s['path']).read_bytes()).hexdigest()})
assets=[]
for path in sorted(ROOT.rglob('*.webp')):
 im=Image.open(path)
 assets.append({'path':str(path.relative_to(ROOT)),'size':im.size,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(ROOT/'manifest.json').write_text(json.dumps({'version':1,'assets':assets},indent=2)+'\n')
(ROOT.parents[2]/'multiplayer-farm/NATURE-PROMPTS.json').write_text(json.dumps(prompts,indent=2,ensure_ascii=False)+'\n')
print(f'Packed {len(assets)} original WebP assets, {sum(a["bytes"] for a in assets):,} bytes')
