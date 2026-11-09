"""Synthetic component tests; uses only the disposable 3540 fixture."""
import concurrent.futures, json, urllib.request, uuid
URL = 'http://127.0.0.1:3540/api/mutation'
def call(name, args):
    req = urllib.request.Request(URL, data=json.dumps({'path':'fixture:'+name,'args':args,'format':'json'}).encode(), headers={'Content-Type':'application/json'})
    result = json.load(urllib.request.urlopen(req))
    if result['status'] != 'success': raise RuntimeError(result.get('errorMessage','failure'))
    return result['value']
def attempt(f):
    try: return ('ok', f())
    except Exception: return ('blocked', None)
user='test'+uuid.uuid4().hex
other='test'+uuid.uuid4().hex
call('setUsername', {'userId':user,'username':user})
call('setUsername', {'userId':other,'username':other})
call('seed', {'userId':user,'count':201})
call('seed', {'userId':other,'count':1})
assert call('counts',{'userId':user})['emails'] == 201
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:
    jobs=[lambda:call('eraseEmail',{'userId':user}),lambda:call('complete',{'userId':user,'index':0}),lambda:call('start',{'userId':user,'email':user+'late@example.test'})]
    outcomes=list(p.map(attempt,jobs))
assert outcomes[0][0]=='ok'
assert attempt(lambda:call('start',{'userId':user,'email':user+'after@example.test'}))[0]=='blocked'
assert not call('complete',{'userId':user,'index':1})['success']
assert not call('recover',{'userId':user})['success']
rows=[outcomes[0][1]]
while not rows[-1]['complete']: rows.append(call('eraseEmail',{'userId':user}))
counts=call('counts',{'userId':user})
assert counts=={'emails':0,'challenges':0,'anonymous':True,'fenced':True}, counts
assert all(r['emailsDeleted']<=100 and r['challengesDeleted']<=100 for r in rows)
assert call('eraseEmail',{'userId':user})=={'emailsDeleted':0,'challengesDeleted':0,'complete':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:
    outcomes=list(p.map(attempt,[lambda:call('eraseUsername',{'userId':user}),lambda:call('setUsername',{'userId':user,'username':user+'late'})]))
assert outcomes[0][0]=='ok' and call('getUsername',{'userId':user}) is None
assert attempt(lambda:call('setUsername',{'userId':user,'username':user}))[0]=='blocked'
assert call('eraseUsername',{'userId':user})=={'deleted':False}
assert call('getUsername',{'userId':other})==other
assert call('recover',{'userId':other})['success']
assert call('complete',{'userId':other,'index':0})['success']
assert call('start',{'userId':other,'email':other+'new@example.test'})['success']
assert not call('counts',{'userId':other})['fenced']
print('PASS: bounded populated email/challenge cleanup, races, replay, username fence, unaffected user, unattributed retention')
