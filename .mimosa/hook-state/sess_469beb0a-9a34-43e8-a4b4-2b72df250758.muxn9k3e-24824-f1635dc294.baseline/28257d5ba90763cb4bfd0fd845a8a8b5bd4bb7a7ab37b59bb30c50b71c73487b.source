from pathlib import Path
import json,re,base64,io,html
from fontTools.ttLib import TTFont,TTCollection
from fontTools import subset
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'docs/media'
scenes=json.loads((OUT/'scenes/timeline.json').read_text()); D=27
texts='FITGROUP 健友同行 每一次训练，都算数。练完，留下你的进步。动作记录 / 能力分析 / 战绩海报 本地演示数据 0123456789 /'
raws=[]
for s in scenes:
 raw=(OUT/f"scenes/{s['name']}.svg").read_text(); raws.append(raw);texts+=html.unescape(re.sub('<[^>]+>','',raw))+s['title']+s['subtitle']
fonts=[]
ping=next(Path('/System/Library/AssetsV2').glob('com_apple_MobileAsset_Font*/*/AssetData/PingFang.ttc'))
collection=TTCollection(ping)
for f in collection.fonts:
 if f['name'].getDebugName(1)=='PingFang SC':
  print(f['name'].getDebugName(2))
for weight,bold in [(400,False),(900,True)]:
 f=next(f for f in TTCollection(ping).fonts if f['name'].getDebugName(1)=='PingFang SC' and f['name'].getDebugName(2)==('Semibold' if bold else 'Regular'))
 options=subset.Options();options.flavor='woff2';sub=subset.Subsetter(options=options);sub.populate(text=texts);sub.subset(f);f.flavor='woff2';buf=io.BytesIO();f.save(buf)
 fonts.append(f"@font-face{{font-family:PromoCN;font-weight:{weight};src:url(data:font/woff2;base64,{base64.b64encode(buf.getvalue()).decode()})}}")
 f=TTFont('/System/Library/Fonts/Supplemental/Arial'+(' Bold' if bold else '')+'.ttf');sub=subset.Subsetter(options=options);sub.populate(text=texts);sub.subset(f);f.flavor='woff2';buf=io.BytesIO();f.save(buf)
 fonts.append(f"@font-face{{font-family:PromoLatin;font-weight:{weight};src:url(data:font/woff2;base64,{base64.b64encode(buf.getvalue()).decode()})}}")
def anim(points,attr='opacity'):
 return f'<animate attributeName="{attr}" dur="{D}s" repeatCount="indefinite" keyTimes="'+ ';'.join(f'{t/D:.6f}' for t,v in points)+'" values="'+';'.join(str(v) for t,v in points)+'" calcMode="linear"/>'
def window(start,end):
 p=[(0,1 if start==0 else 0)]
 if start>0:p +=[(max(.001,start-.2),0),(start+.15,1)]
 p += [(end-.2,1),(end+.15,0),(D,0)] if end<D-.2 else [(D-.35,1),(D,0)]
 return anim(p)
def text(x,y,t,size=48,fill='#000',weight=900):return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}">{html.escape(t)}</text>'
out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><title>FitGroup / 每一次训练，都算数</title><desc>27 秒循环功能演示。真实组件与本地虚构数据。SVG、内嵌字体与矢量图标，无外部资源。</desc><style>{"".join(fonts)} text{{font-family:PromoLatin,PromoCN,sans-serif!important}}</style><defs><clipPath id="screen"><rect x="0" y="0" width="390" height="844" rx="13"/></clipPath></defs><rect width="1080" height="1920" fill="#f4f4f4"/><path d="M64 68H1016V76H64Z" fill="black"/>',text(64,132,'FITGROUP',36),text(780,132,'健友同行',32),'<rect x="64" y="179" width="15" height="136" fill="#dfff00"/>']
for i,s in enumerate(scenes):
 end=scenes[i+1]['time'] if i+1<len(scenes) else 26.4
 out +=[f'<g opacity="0">{window(s["time"],end)}',text(102,226,s['subtitle'],27, '#555'),text(102,300,s['title'],50),'</g>']
out+=['<rect x="235" y="424" width="642" height="1379" rx="40" fill="#000"/><rect x="215" y="402" width="650" height="1388" rx="40" fill="#000"/><rect x="226" y="413" width="628" height="1366" rx="31" fill="#fff"/>','<g transform="translate(228 423) scale(1.6)"><g clip-path="url(#screen)">']
for i,(s,raw) in enumerate(zip(scenes,raws)):
 end=scenes[i+1]['time'] if i+1<len(scenes) else 26.4
 inner=re.sub(r'^<svg[^>]*>|</svg>$','',raw)
 # Namespace all original component IDs across scene states.
 ids=re.findall(r'\bid="([^"]+)"',inner)
 for ident in ids:inner=inner.replace('"'+ident+'"','"s'+str(i)+'-'+ident+'"').replace('#'+ident+')','#s'+str(i)+'-'+ident+')')
 out.append(f'<g opacity="0">{window(s["time"],end)}{inner}</g>')
# Return to opening frame at the end of the loop.
inner=re.sub(r'^<svg[^>]*>|</svg>$','',raws[0]);out.append(f'<g opacity="0">{anim([(0,0),(26.2,0),(26.65,1),(27,1)])}{inner}</g>')
out+=['</g>']
for s in scenes:
 if 'click' not in s:continue
 c=s['click'];t=c['time'];x=c['x'];y=c['y']
 out.append(f'<g transform="translate({x} {y})" opacity="0">{anim([(0,0),(t-.3,0),(t-.12,1),(t+.12,1),(t+.35,0),(D,0)])}<circle r="17" fill="#dfff00" fill-opacity=".28" stroke="#000" stroke-width="2"/><circle r="5" fill="#000"/><path d="M7 8L17 32L21 23L30 22Z" fill="white" stroke="black" stroke-width="2"/></g>')
out+=['</g>',text(64,1857,'动作记录 / 能力分析 / 战绩海报',28),text(64,1896,'本地演示数据',19,'#777',400),'<rect x="64" y="1820" width="952" height="5" fill="#ddd"/><rect x="64" y="1820" height="5" fill="#000">'+anim([(0,0),(27,952)],'width')+'</rect>',f'<g opacity="0">{anim([(0,0),(26.2,0),(26.65,1),(27,1)])}<rect x="88" y="179" width="930" height="142" fill="#f4f4f4"/>'+text(102,226,scenes[0]['subtitle'],27,'#555')+text(102,300,scenes[0]['title'],50)+'</g></svg>']
(OUT/'promo.svg').write_text(''.join(out))
(OUT/'preview.html').write_text('''<!doctype html><meta charset="utf-8"><title>FitGroup 动画预览</title><style>body{margin:0;background:#202020;display:flex;justify-content:center}img{height:100vh;max-width:100vw;object-fit:contain}</style><img src="promo.svg" alt="FitGroup 27 秒功能演示">''')
print(OUT/'promo.svg')
