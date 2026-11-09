"""Synthetic local storage only; never use on a shared backend."""
import json, urllib.request
URL = 'http://127.0.0.1:3550/api/'
def call(kind, name, args):
    request = urllib.request.Request(URL + kind, data=json.dumps({'path':'fixture:'+name,'args':args,'format':'json'}).encode(), headers={'Content-Type':'application/json'})
    result = json.load(urllib.request.urlopen(request))
    if result['status'] != 'success': raise RuntimeError(result.get('errorMessage', 'error'))
    return result['value']
def denied(fn, message):
    try: fn()
    except RuntimeError as exc:
        assert message in str(exc), str(exc)
        return
    raise AssertionError('expected denial: ' + message)
m=lambda name,args:call('mutation',name,args)
q=lambda name,args:call('query',name,args)
a=lambda name,args:call('action',name,args)
owner=m('create',{}); other=m('create',{}); shared_owner=m('create',{})
files=[a('store',{'userId':owner,'missing':False}) for _ in range(45)]
missing=a('store',{'userId':owner,'missing':True}); otherfile=a('store',{'userId':other,'missing':False})
r2=m('r2',{'userId':owner}); requested=m('request',{'userId':owner}); args={'userId':owner,'expectedRequestedAt':requested}
denied(lambda:m('batch',{'userId':other,'expectedRequestedAt':requested}),'Matching deletion request')
denied(lambda:m('batch',{'userId':owner,'expectedRequestedAt':requested+1}),'Matching deletion request')
denied(lambda:m('uploadGuard',{'userId':owner}),'Account deletion')
denied(lambda:a('uploadPending',{'userId':owner}),'Account deletion')
denied(lambda:m('lateRegister',{'userId':owner,'storageId':otherfile['storageId']}),'Account deletion')
denied(lambda:m('rollback',args),'synthetic rollback')
assert q('inspect',files[0]) == {'row':True,'blob':True}
assert q('progress',{'userId':owner}) is None
rows=[]
for _ in range(10):
    row=m('batch',args); rows.append(row)
    if row['state'] != 'in_progress': break
assert row['state']=='blocked' and row['r2Present'] and row['knownConvexCleared'] and row['untrackedStorageUnverified'] and row['blobsDeleted']==45 and row['missingBlobs']==1
assert next(x for x in q('queue', {})['page'] if x['userId']==owner)['fileDeletion']==row
assert len(rows)>=3 and all(q('inspect',x)=={'row':False,'blob':False} for x in files+[missing])
assert q('inspect',otherfile)=={'row':True,'blob':True}
repeat=m('batch',args); assert repeat['blobsDeleted']==45 and repeat['missingBlobs']==1 and repeat['r2Present']
shared=m('record',{'userId':shared_owner,'storageId':otherfile['storageId']}); shared_time=m('request',{'userId':shared_owner})
shared_result=m('batch',{'userId':shared_owner,'expectedRequestedAt':shared_time})
assert shared_result['state']=='blocked' and shared_result['sharedInScan']==1
assert q('inspect',{'id':shared,'storageId':otherfile['storageId']})=={'row':True,'blob':True}
assert q('inspect',otherfile)=={'row':True,'blob':True}
clean=m('create',{}); cleanfile=a('store',{'userId':clean,'missing':False}); clean_time=m('request',{'userId':clean})
clean_args={'userId':clean,'expectedRequestedAt':clean_time}; finished=m('batch',clean_args)
assert finished['state']=='known_convex_cleared' and finished['knownConvexCleared'] and m('batch',clean_args)==finished
assert q('inspect',cleanfile)=={'row':False,'blob':False}
print('PASS: real blob rollback, bounded cleanup, missing blobs, R2 and shared-object blockers, owner fencing')
