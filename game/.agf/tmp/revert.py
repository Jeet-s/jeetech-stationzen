import sys,re
# revert.py file "Level Name" "Next Level Name"
f,name,nxt=sys.argv[1:4]
pre=open('/tmp/szpre/src/game/chapters/'+f).read(); cur=open('src/game/chapters/'+f).read()
def blk(s,name,nxt):
    a=s.index('      name: "%s"'%name); b=s.index('      name: "%s"'%nxt, a); return a,b
pa,pb=blk(pre,name,nxt)
# current may have renamed; locate by position of next
ca=cur.index('      name: "%s"'%(sys.argv[4] if len(sys.argv)>4 else name)); cb=cur.index('      name: "%s"'%nxt, ca)
open('src/game/chapters/'+f,'w').write(cur[:ca]+pre[pa:pb]+cur[cb:])
