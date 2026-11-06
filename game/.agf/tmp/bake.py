# bake tuning scale into chapter st strings for given levels: python3 bake.py 9 24 ...
import json,re,sys,glob
tun=json.load(open('src/game/tuning.json'))
files=sorted(glob.glob('src/game/chapters/c*-*.ts'), key=lambda f:int(re.search(r'/c(\d+)-',f).group(1)))
# map global level -> (file, nth level in file)
idx=[]
for f in files:
    s=open(f).read()
    for m in re.finditer(r'\n      name: "', s): idx.append(f)
def jsround(x): 
    import math
    return math.floor(x+0.5)
for n in map(int,sys.argv[1:]):
    t=tun.get(str(n),{}); sc=t.get('scale',1)
    if sc==1: print('L',n,'scale 1'); continue
    f=idx[n-1]; k=sum(1 for g in idx[:n-1] if g==f)
    s=open(f).read()
    starts=[m.start() for m in re.finditer(r'\n      name: "', s)]
    a=starts[k]; b=starts[k+1] if k+1<len(starts) else len(s)
    seg=s[a:b]
    m=re.search(r'st: \{([^}]*)\}', seg)
    def fix(mm):
        body=mm.group(0)
        def num(x): return str(max(1,jsround(int(x.group(1))*sc)))+x.group(2)
        # only the demand tokens after the glyph+options inside each quoted string
        def q(qm):
            v=qm.group(1)
            head=v[0]; rest=v[1:]
            rest=re.sub(r'(?<![@*\d])(\d+)([LDKNMYCS])', num, rest)
            return '"'+head+rest+'"'
        return re.sub(r'"([^"]*)"', q, body)
    seg2=seg[:m.start()]+fix(m)+seg[m.end():]
    s=s[:a]+seg2+s[b:]
    open(f,'w').write(s)
    t.pop('scale',None); tun[str(n)]=t
    print('L',n,'baked scale',sc, re.search(r'st: \{([^}]*)\}', seg2).group(0))
open('src/game/tuning.json','w').write(json.dumps(tun,separators=(',',':')).replace('},"','},\n"'))
