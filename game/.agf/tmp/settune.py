import json,sys
p='src/game/tuning.json';t=json.load(open(p))
for a in sys.argv[1:]:
    n,v=a.split('=')
    if v=='del': t.pop(n,None); continue
    parts=v.split(',')
    d={'goal':float(parts[0])}
    if len(parts)>1: d['scale']=float(parts[1])
    t[n]=d
t=dict(sorted(t.items(),key=lambda kv:int(kv[0])))
open(p,'w').write(json.dumps(t,separators=(',',':')).replace('},"','},\n"'))
