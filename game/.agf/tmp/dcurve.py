import json,sys
d=json.loads(open(sys.argv[1]).read().strip().split('\n')[-1])['difficulty']
n=len(d);k=max(3,round(n*0.2));m=lambda a:sum(a)/len(a)
e,l=m(d[:k]),m(d[-k:])
idx=sorted(range(n),key=lambda i:d[i]);r=[0]*n
for pos,i in enumerate(idx): r[i]=pos
rho=1-6*sum((i-r[i])**2 for i in range(n))/(n*(n*n-1))
print(f"ratio {l/e:.2f} rho {rho:.5f} early {e:.2f} late {l:.2f}")
print("early:",[(i+1,d[i]) for i in range(k)])
