"""Offline, reviewable part masks for the fixed 48-frame source atlas.
Run only when that atlas changes. Runtime never guesses regions from RGB.
The authored neck, palm, tool erasure and shoe anchors are part of the rig.
"""
from PIL import Image, ImageDraw
from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parents[1]
path=root.parent/'public/assets/graphics-vertical-slice/player/adult-farmer-48.png'
im=Image.open(path).convert('RGBA')
necks=[45]*16+[38,45,46,46,38,46,46,44,45,46,44,45,46,45,46,45]+[45,41,44,37,45,45,44,44,45,47,49,43,41,46,47,43]
centers=[23]*8+[24]*4+[24]*4+[23]*8+[24]*8+[23,23,23,23,23,23,24,23,23,23,24,27,24,22,23,22]
# Raised arms and forward hands remain above the new face/hair, at the original grip.
foreground={32:[(11,37,19,30,20,24,24,24,33,30,36,37,30,36,25,31,21,30,20,34,16,40)],36:[(13,38,18,28,24,26,29,34,32,38,30,43,15,43)],40:[(11,28,16,25,20,31,19,36,24,39,21,43,15,39,11,34)],44:[(26,36,31,35,35,29,38,27,38,36,33,42,25,43)]}
erase={32:[(0,0,48,0,48,23,0,23)],33:[(23,57,26,57,26,65,23,65),(0,65,48,65,48,72,0,72)],34:[(23,57,26,57,26,63,23,63),(0,62,48,62,48,72,0,72)],35:[(28,53,31,53,48,63,48,72,29,72,29,59),(26,65,48,65,48,72,26,72)],36:[(0,0,48,0,48,24,0,24)],37:[(29,58,35,58,35,72,29,72)],40:[(0,0,48,0,48,24,0,24),(34,55,48,55,48,72,34,72)],41:[(0,61,22,61,22,72,0,72),(0,59,10,57,12,61,0,61)],42:[(0,61,21,61,21,72,0,72)],43:[(0,59,19,53,22,55,17,61,21,65,21,72,0,72)],44:[(32,0,48,0,48,35,33,35,34,27,31,27,31,20,0,20,0,0)],45:[(30,58,48,60,48,72,28,72,28,60)],47:[(31,55,48,60,48,72,28,72,28,60)]}
# Hand regions include the dark skin outline, but exclude the cream cuff.
hands=[[(11,54,16,60),(30,54,36,60)]]*8+[[(24,55,31,62)]]*4+[[(18,55,25,62)]]*4
hands += [[(10,47,15,54),(31,47,37,54)],[(12,54,18,62),(31,50,37,57)],[(10,51,17,58),(30,55,36,63)],[(10,55,17,62),(30,53,36,61)],[(9,47,15,56),(29,47,36,56)],[(10,54,17,61),(29,56,36,64)],[(11,56,17,64),(30,52,37,59)],[(11,50,17,58),(29,54,36,61)]]
hands += [[(16,52,25,60)],[(16,54,25,62)],[(19,50,28,58)],[(21,52,30,61)],[(24,54,32,62)],[(22,53,31,61)],[(24,54,32,62)],[(21,52,30,60)]]
hands += [[(16,25,30,35)],[(19,47,28,56)],[(19,50,28,59)],[(22,46,31,54)],[(16,26,28,34)],[(21,44,29,54)],[(19,48,29,58)],[(19,43,32,54)],[(11,25,20,37)],[(9,52,21,61)],[(11,53,23,62)],[(17,47,26,55)],[(28,31,38,41)],[(23,51,33,60)],[(21,51,33,61)],[(24,48,33,56)]]
frames=[]
def poly_mask(polys):
 m=Image.new('L',(48,72));d=ImageDraw.Draw(m)
 for coords in polys:d.polygon(list(zip(coords[::2],coords[1::2])),fill=255)
 return m
for j in range(48):
 f=im.crop((j%16*48,j//16*72,(j%16+1)*48,(j//16+1)*72));e=poly_mask(erase.get(j,[]));fg=poly_mask(foreground.get(j,[]))
 n=necks[j];cx=centers[j];dy=7 if j in (16,20) else 0
 # The first down/up walk source cells are translated seven pixels upwards.
 # Correct that source defect once; all feet retain the shared y=70 origin.
 def visible(x,y):
  r,g,b,a=f.getpixel((x,y))
  return a>=128 and not e.getpixel((x,y)) and not (b>r*.78 and g<r*.6)
 feet=[]
 for lo,hi in [(10,24),(24,38)]:
  ys=[y for y in range(max(n+9,51),72) for x in range(lo,hi) if visible(x,y)]
  if not ys:continue
  bottom=max(ys)
  xs=[x for x in range(lo,hi) for y in range(bottom-2,bottom+1) if visible(x,y)]
  if not xs:continue
  left,right=min(xs),max(xs)
  if right-left<2:continue
  feet.append([left,bottom+dy,min(8,right-left+1)])
 cells=[0]*(48*72);front=[0]*(48*72)
 for y in range(72):
  for x in range(48):
   if not visible(x,y) or y+dy>71:continue
   is_fg=bool(fg.getpixel((x,y)))
   if y<n and not is_fg:continue
   r,g,b,a=f.getpixel((x,y));lum=.3*r+.59*g+.11*b
   hand=any(l<=x<=rgt and t<=y<=bot for l,t,rgt,bot in hands[j])
   if lum<49:code=25
   else:
    if (hand and (r>g*1.19 or lum<120)) or (abs(x-cx)<=2 and n<=y<n+3 and r>g*1.3):part=0;ref=170
    elif n<=y<=n+9 and g>r*.86 and g>b*1.22 and r<176:part=4;ref=88
    elif y>=n+12 and not is_fg:part=2;ref=111
    elif lum>155 and g>r*.76:part=3;ref=197
    else:part=1;ref=124
    ratio=lum/ref;tone=0 if ratio<.61 else 1 if ratio<.9 else 2 if ratio<1.16 else 3
    code=1+part*4+tone
   # Remove the original boot, including raised toes, before replacing its silhouette.
   if any(l-1<=x<=l+w and bot-dy-4<=y<=bot-dy for l,bot,w in feet):continue
   target=front if is_fg else cells
   target[(y+dy)*48+x]=code
 def rle(data):
  def base36(num):
   s='';digits='0123456789abcdefghijklmnopqrstuvwxyz'
   while num:s=digits[num%36]+s;num//=36
   return s or '0'
  result=[];start=0
  while start<len(data):
   end=start+1
   while end<len(data) and data[end]==data[start]:end+=1
   result.append(base36(end-start)+chr(65+data[start]));start=end
  return ''.join(result)
 frames.append(dict(head=[cx,n+dy-21],neck=n+dy,waist=n+dy+12,feet=feet,body=rle(cells),front=rle(front)))
output='// Fixed atlas masks. Rebuild with scripts/compile-character-masks.py after art review.\n'
output+='// Source SHA256: '+hashlib.sha256(path.read_bytes()).hexdigest()+'\n'
output+='export const CHARACTER_MASKS = '+json.dumps(frames,separators=(',',':'))+' as const;\n'
(root/'client/character-masks.ts').write_text(output)
print('Compiled 48 fixed masks:',len(output),'bytes')
