import json,sys
d=json.loads(open(sys.argv[1]).read().strip().split('\n')[-1])['difficulty']
n=len(d);k=max(3,round(n*0.2))
e=sum(d[:k])/k;l=sum(d[-k:])/k
rx=list(range(n));order=sorted(range(n),key=lambda i:d[i]);ry=[0]*n
for pos,i in enumerate(order): ry[i]=pos
rho=1-6*sum((rx[i]-ry[i])**2 for i in range(n))/(n*(n*n-1))
print(f"early {e:.3f} late {l:.3f} ratio {l/e:.2f} rho {rho:.2f}")
print("early levels:", [(i+1,d[i]) for i in range(k)])
print("late levels:", [(i+1,d[i]) for i in range(n-k,n)])
