import json,struct,numpy as np,sys
sys.argv=['x']
src=open('vcheck.py').read()
exec(src.split("mi=[i for i")[0])
res={}
import os; SM=int(os.environ.get('SM','6'))
for NMm in ('Body','Bikini'):
    mi=[i for i,n in enumerate(N) if n.get('name')==NMm][0]; node=N[mi]; mesh=j['meshes'][node['mesh']]; pr=mesh['primitives'][0]
    names=mesh['extras']['targetNames']; print(NMm,names)
    pos=acc(pr['attributes']['POSITION']).astype(float); J=acc(pr['attributes']['JOINTS_0']).astype(int); W=acc(pr['attributes']['WEIGHTS_0']).astype(float)
    nb=acc(pr['attributes']['NORMAL']).astype(float)
    idx=acc(pr['indices']).astype(int).reshape(-1,3)
    tg={nm:acc(t['POSITION']).astype(float) for nm,t in zip(names,pr['targets'])}
    sk=j['skins'][node['skin']]; ibm=acc(sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    # weld by position
    key=np.round(pos*1e5).astype(np.int64); _,inv=np.unique(key,axis=0,return_inverse=True); inv=inv.ravel()
    import scipy.sparse as sp
    E=np.concatenate([idx[:,[0,1]],idx[:,[1,2]],idx[:,[2,0]]]); E=inv[E]; E=E[E[:,0]!=E[:,1]]
    nw=inv.max()+1; A=sp.coo_matrix((np.ones(len(E)),(E[:,0],E[:,1])),shape=(nw,nw)).tocsr(); A=((A+A.T)>0).astype(float)
    deg=np.asarray(A.sum(1)).ravel()+1e-9
    def vnormals(P,sm=0):
        n=vnormals0(P)
        if sm:
            u=np.zeros((nw,3)); u[inv]=n
            for _ in range(sm): u=0.5*u+0.5*(A@u)/deg[:,None]
            n=u[inv]; n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-20
        return n
    def vnormals0(P):
        fn=np.cross(P[idx[:,1]]-P[idx[:,0]],P[idx[:,2]]-P[idx[:,0]])  # area weighted
        acc_=np.zeros((inv.max()+1,3))
        for k in range(3): np.add.at(acc_,inv[idx[:,k]],fn)
        n=acc_[inv]; return n/(np.linalg.norm(n,axis=1,keepdims=True)+1e-20)
    out=np.zeros((len(names),len(pos),3),np.float32)
    for ti,nm in enumerate(names):
        key_=nm.replace('fix_','')
        for k in S: S[k]=1.0 if k==key_ else 0.0
        v['slider_bust_bounce']=0; v['slider_glute_run']=0
        Wm=[world(jn) for jn in sk['joints']]; M=np.array([Wm[k]@ibm[k] for k in range(len(Wm))])
        p2=pos+tg[nm]
        out_p=np.zeros_like(p2); Mb=np.zeros((len(pos),3,3))
        for k in range(4):
            Mk=M[J[:,k]]; out_p+=W[:,k:k+1]*(np.einsum('nab,nb->na',Mk[:,:3,:3],p2)+Mk[:,:3,3]); Mb+=W[:,k,None,None]*Mk[:,:3,:3]
        npst=vnormals(out_p,SM)
        nr=np.einsum('nba,nb->na',Mb,npst); nr/=np.linalg.norm(nr,axis=1,keepdims=True)+1e-20
        # fall back to base normal where the matrix is near singular
        out[ti]=(nr-vnormals(pos,SM)).astype(np.float32)
        print(nm,'max |delta n|',np.abs(out[ti]).max(),'mean',np.abs(out[ti]).mean())
    np.save(f'/workspace/poser_build/nrm_{NMm}.npy',out); res[NMm]=names
json.dump(res,open('/workspace/poser_build/nrm_names.json','w'))
