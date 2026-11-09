"""Only synthetic users on the disposable loopback backend; no provider calls."""
import concurrent.futures, json, os, pathlib, stat, subprocess, urllib.request, uuid
key = os.environ['E2E_CONVEX_ADMIN_KEY']
assert os.environ.get('E2E_CONVEX_URL') == 'http://127.0.0.1:3540'
assert os.environ.get('E2E_TELEMETRY_DISABLED') == '1'
# The admin mutation bridge may only target the launcher's own fresh backend.
marker=pathlib.Path(os.environ['AGENT_OWNERSHIP_FILE']).resolve()
assert marker.name == 'ownership.json' and marker.parent.parent == pathlib.Path('/private/tmp')
assert stat.S_IMODE(marker.stat().st_mode)==0o600 and stat.S_IMODE(marker.parent.stat().st_mode)==0o700
ownership=json.loads(marker.read_text()); backend=ownership['backend']; launcher=ownership['launcher']
pid=os.getpid(); ancestors=set()
while pid > 1 and pid != launcher:
    ancestors.add(pid)
    fields=subprocess.check_output(['lsof','-nP','-a','-p',str(pid),'-d','cwd','-FpR'],text=True).splitlines()
    parents=[line[1:] for line in fields if line.startswith('R')]
    assert f'p{pid}' in fields and len(parents)==1
    pid=int(parents[0])
assert pid == launcher
fields=subprocess.check_output(['lsof','-nP','-a','-p',str(backend),'-d','cwd','-FpR'],text=True).splitlines()
assert f'p{backend}' in fields and f'R{launcher}' in fields
for port in (3540,3541):
    assert set(subprocess.check_output(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],text=True).split())=={str(backend)}
assert str(marker.parent/'db.sqlite3') == ownership['database']
opened=subprocess.check_output(['lsof','-p',str(backend)],text=True)
assert ownership['database'] in opened
claim=marker.parent/('.paid-claim-checked' if os.environ.get('AGENT_PAID_CLAIM_ONLY') == '1' else '.paid-checked')
claim.mkdir(mode=0o700)
def call(name, args):
    request = urllib.request.Request('http://127.0.0.1:3540/api/function', data=json.dumps({'path':'agentFixture:'+name,'args':args,'format':'json'}).encode(), headers={'Content-Type':'application/json','Authorization':'Convex '+key})
    result=json.load(urllib.request.urlopen(request))
    if result['status'] != 'success': raise RuntimeError(result.get('errorMessage','fixture failed'))
    return result['value']
def rejected(fn, text):
    try: fn()
    except RuntimeError as exc:
        assert text in str(exc), str(exc)
        return
    raise AssertionError('Expected rejection')
if os.environ.get('AGENT_PAID_CLAIM_ONLY') == '1':
    user=call('paidUser',{}); app=str(uuid.uuid4())
    thread=call('paidApp',{'userId':user,'appId':app})
    call('paidEnqueue',{'userId':user,'appId':app,'prompt':'claim protocol'})
    old=call('paidWorkerClaim',{'id':thread,'token':'old'})
    assert old['result'] is None and old['scheduled']==['agent/actions/run:tick']
    assert not call('paidInspect',{'userId':user,'appId':app})['app']['agent'].get('lease')
    current=call('paidWorkerClaim',{'id':thread,'token':'current','activationProtocol':1})
    assert current['result']['lease']['token']=='current' and current['scheduled']==['agent/actions/run:tick']
    assert current['result']['lease']['activationProtocol']==1
    second_app=str(uuid.uuid4()); second_thread=call('paidApp',{'userId':user,'appId':second_app})
    call('paidEnqueue',{'userId':user,'appId':second_app,'prompt':'second current worker'})
    second=call('paidWorkerClaim',{'id':second_thread,'token':'current-2','activationProtocol':1})
    assert second['result']['lease']['activationProtocol']==1
    state=call('paidInspect',{'userId':user,'appId':app}); session=state['sessions'][0]['_id']
    debit=call('paidClaim',{'sessionId':session}); call('paidConfirm',{'debitId':debit['_id']})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        claims=list(pool.map(lambda token:(token,call('activationClaim',{'sessionId':session,'token':token})),['activation-current','activation-current-2']))
    assert sorted(result for _,result in claims)==['claimed','wait']
    winner=next(token for token,result in claims if result=='claimed')
    assert call('activationComplete',{'sessionId':session,'token':winner})
    assert call('activationClaim',{'sessionId':session,'token':'after'})=='ready'
    print('PASS: old paid claim queues current tick; two marked workers contend for one activation')
    raise SystemExit(0)
user=call('paidUser',{}); apps=[str(uuid.uuid4()),str(uuid.uuid4())]
for app in apps: call('paidApp',{'userId':user,'appId':app})
low={'userId':user,'appId':apps[0],'prompt':'synthetic work','balance':9}
rejected(lambda:call('paidSend',low),'At least 10 credits')
low_state=call('paidInspect',{'userId':user,'appId':apps[0]})
assert low_state['sessions']==[] and low_state['debits']==[] and low_state['app']['agent']['pending']==[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    sent=list(pool.map(lambda app:call('paidSend',{'userId':user,'appId':app,'prompt':'synthetic work','balance':20}),apps))
assert all(x['status']=='processing' for x in sent)
first=call('paidInspect',{'userId':user,'appId':apps[0]}); second=call('paidInspect',{'userId':user,'appId':apps[1]})
assert len(first['sessions'])==1 and len(second['sessions'])==1
session=first['sessions'][0]['_id']
assert first['app']['agent']['computeSessionId']==session==second['app']['agent']['computeSessionId']
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    claims=list(pool.map(lambda _:call('paidClaim',{'sessionId':session}),range(2)))
assert sum(x is not None for x in claims)==1
debit=next(x for x in claims if x is not None)
assert not call('paidAllowed',{'userId':user,'sessionId':session})
call('paidUnknown',{'debitId':debit['_id']})
assert call('paidInspect',{'userId':user,'appId':apps[0]})['sessions'][0]['state']=='hold'
assert not call('paidAllowed',{'userId':user,'sessionId':session})
assert call('paidClaim',{'sessionId':session}) is None
before=call('paidInspect',{'userId':user,'appId':apps[0]})
rejected(lambda:call('paidSend',{**low,'balance':20}),'reconciliation')
after=call('paidInspect',{'userId':user,'appId':apps[0]})
assert len(after['sessions'])==1 and len(after['debits'])==1
assert after['debits'][0]['_id']==debit['_id'] and after['debits'][0]['state']=='unknown'
assert after['app']['agent']['pending']==before['app']['agent']['pending']
print('PASS: insufficient balance, concurrent shared admission and one debit claim, unknown hold')

# A separate synthetic user exercises the confirmed starting window.
confirmed_user=call('paidUser',{}); confirmed_apps=[str(uuid.uuid4()),str(uuid.uuid4())]
for app in confirmed_apps: call('paidApp',{'userId':confirmed_user,'appId':app})
start={'userId':confirmed_user,'appId':confirmed_apps[0],'prompt':'synthetic paid window','balance':20}
call('paidSend',start)
state=call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[0]})
confirmed_session=state['sessions'][0]['_id']
confirmed_debit=call('paidClaim',{'sessionId':confirmed_session})
assert confirmed_debit and confirmed_debit['state']=='dispatching'
call('paidConfirm',{'debitId':confirmed_debit['_id']})
state=call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[0]})
assert state['sessions'][0]['state']=='active' and state['debits'][0]['state']=='confirmed'
paid_until=state['sessions'][0]['paidUntil']
assert not call('paidAllowed',{'userId':confirmed_user,'sessionId':confirmed_session})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    claims=list(pool.map(lambda token: (token,call('activationClaim',{'sessionId':confirmed_session,'token':token})),['activation-a','activation-b']))
assert sorted(value for _,value in claims)==['claimed','wait']
winning=next(token for token,value in claims if value=='claimed')
assert call('activationComplete',{'sessionId':confirmed_session,'token':winning})
assert call('paidAllowedAt',{'userId':confirmed_user,'sessionId':confirmed_session,'now':paid_until-1})
assert not call('paidAllowedAt',{'userId':confirmed_user,'sessionId':confirmed_session,'now':paid_until})
assert not call('paidAllowedAt',{'userId':confirmed_user,'sessionId':confirmed_session,'now':paid_until+1})
second={**start,'appId':confirmed_apps[1]}
rejected(lambda:call('paidSend',{**second,'balance':9}),'At least 10 credits')
assert call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[1]})['app']['agent']['pending']==[]
call('paidSend',second)
state=call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[1]})
assert state['app']['agent']['computeSessionId']==confirmed_session and len(state['sessions'])==1 and len(state['debits'])==1
assert call('paidClaim',{'sessionId':confirmed_session,'expectedDebit':confirmed_debit['_id']}) is None
assert call('activationArchive',{'sessionId':confirmed_session})
assert not call('paidAllowed',{'userId':confirmed_user,'sessionId':confirmed_session})
rejected(lambda:call('paidSend',second),'sandbox is stopping')
assert call('paidClaim',{'sessionId':confirmed_session,'expectedDebit':confirmed_debit['_id']}) is None
expired=call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[1]})
assert expired['sessions'][0]['state']=='stopping' and len(expired['debits'])==1
print('PASS: confirmed window, concurrent activation claim, same-window balance recheck, archived stop without new debit')

# A separate real transaction sequence models a lost activation reply.
fence_user=call('paidUser',{}); fence_app=str(uuid.uuid4())
call('paidApp',{'userId':fence_user,'appId':fence_app})
call('paidSend',{'userId':fence_user,'appId':fence_app,'prompt':'fence fixture','balance':20})
fence_state=call('paidInspect',{'userId':fence_user,'appId':fence_app}); fence_session=fence_state['sessions'][0]['_id']
fence_debit=call('paidClaim',{'sessionId':fence_session}); call('paidConfirm',{'debitId':fence_debit['_id']})
assert call('activationClaim',{'sessionId':fence_session,'token':'lost'})=='claimed'
assert call('activationArchive',{'sessionId':fence_session})
assert not call('activationStop',{'sessionId':fence_session,'token':'stop'})
assert not call('activationComplete',{'sessionId':fence_session,'token':'lost'})
call('activationExpireLease',{'sessionId':fence_session})
assert call('activationStop',{'sessionId':fence_session,'token':'stop'})
print('PASS: lost activation blocks stop until simulated expiry; late completion rejected')

# Normalize more than two batches; inject an unresolved legacy write between claims.
legacy_user=call('paidUser',{}); legacy_app=str(uuid.uuid4())
call('paidApp',{'userId':legacy_user,'appId':legacy_app})
call('paidSend',{'userId':legacy_user,'appId':legacy_app,'prompt':'legacy fixture','balance':20})
legacy_state=call('paidInspect',{'userId':legacy_user,'appId':legacy_app}); legacy_session=legacy_state['sessions'][0]['_id']
legacy_debit=call('paidClaim',{'sessionId':legacy_session}); call('paidConfirm',{'debitId':legacy_debit['_id']})
call('activationSeedLegacy',{'userId':legacy_user,'count':111})
assert call('activationClaim',{'sessionId':legacy_session,'token':'legacy'})=='wait'
call('activationLegacyDelivery',{'userId':legacy_user,'index':110})
for _ in range(8):
    state=call('activationClaim',{'sessionId':legacy_session,'token':'legacy'})
    if state=='blocked': break
    assert state=='wait'
else: raise AssertionError('legacy work was not fenced')
assert call('paidInspect',{'userId':legacy_user,'appId':legacy_app})['sessions'][0]['state']=='stopping'
print('PASS: bounded legacy batches retain an intervening unresolved marker')

# Simultaneous requests: the final persisted classification must reflect the real patchThread write.
race_user=call('paidUser',{}); race_app=str(uuid.uuid4())
call('paidApp',{'userId':race_user,'appId':race_app})
call('activationSeedLegacy',{'userId':race_user,'count':70})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    futures=[pool.submit(call,'activationNormalize',{'userId':race_user}),pool.submit(call,'activationPatchApp',{'userId':race_user,'appId':race_app})]
    for future in futures: future.result()
for _ in range(5):
    observed=call('activationNormalize',{'userId':race_user})
    if not observed['pending']: break
assert not observed['pending'] and observed['unresolved']
state=call('paidInspect',{'userId':race_user,'appId':race_app})['app']
assert state['agentRemoteUnresolved'] and state['agentResumeBusy'] and state['agent']['delivery']=='simultaneous-delivery'
print('PASS: simultaneous normalization and patchThread preserve final unresolved classification (overlap not measured)')

# Deletion stop checks a displaced activation lease and an old worker without session ID.
del_user=call('paidUser',{}); deletion=call('deletionSeed',{'userId':del_user}); d={'userId':del_user,'token':'deletion'}
assert not call('deletionClaim',d)
call('deletionExpire',{**deletion,'kind':'activation'})
assert not call('deletionClaim',d)
call('deletionExpire',{**deletion,'kind':'worker'})
assert call('deletionClaim',d)
call('deletionRenewWorker',{'app':deletion['app']})
assert not call('deletionFinish',d)
call('deletionExpire',{**deletion,'kind':'worker'})
assert call('deletionFinish',d)
print('PASS: deletion fences displaced activation and old worker, rejects stale archived result')

# Simulate drained old workers and a confirmed archived stop before a new user message.
for app in confirmed_apps: call('activationDrainApp',{'userId':confirmed_user,'appId':app})
assert call('activationStop',{'sessionId':confirmed_session,'token':'normal-stop'})
call('activationStopComplete',{'sessionId':confirmed_session,'token':'normal-stop'})
assert call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[0]})['sessions'][0]['state']=='stopped'
assert call('paidClaim',{'sessionId':confirmed_session,'expectedDebit':confirmed_debit['_id']}) is None
call('paidSend',start)
new_state=call('paidInspect',{'userId':confirmed_user,'appId':confirmed_apps[0]})
new_session=new_state['app']['agent']['computeSessionId']
assert new_session != confirmed_session and len(new_state['sessions'])==2
new_debit=call('paidClaim',{'sessionId':new_session}); assert new_debit
assert call('paidClaim',{'sessionId':new_session}) is None
call('paidConfirm',{'debitId':new_debit['_id']})
assert call('activationClaim',{'sessionId':new_session,'token':'new-activation'})=='claimed'
assert call('activationComplete',{'sessionId':new_session,'token':'new-activation'})
assert call('paidClaim',{'sessionId':confirmed_session,'expectedDebit':confirmed_debit['_id']}) is None
print('PASS: confirmed stop plus explicit message admits one new session and debit')

# A stale derived flag must not hide another worker's real lease.
lease_user=call('paidUser',{}); lease_apps=[str(uuid.uuid4()),str(uuid.uuid4())]
threads=[call('paidApp',{'userId':lease_user,'appId':app}) for app in lease_apps]
for app in lease_apps: call('paidSend',{'userId':lease_user,'appId':app,'prompt':'lease fixture','balance':20})
lease_session=call('paidInspect',{'userId':lease_user,'appId':lease_apps[0]})['sessions'][0]['_id']
lease_debit=call('paidClaim',{'sessionId':lease_session}); call('paidConfirm',{'debitId':lease_debit['_id']})
seed={'userId':lease_user,'appId':lease_apps[0],'sessionId':lease_session,'token':'old-worker','expire':False}
call('activationSeedWorker',seed)
assert call('paidInspect',{'userId':lease_user,'appId':lease_apps[0]})['app']['agentResumeBusy'] is False
assert call('activationClaim',{'sessionId':lease_session,'token':'activation'})=='wait'
print('PASS: stale busy flag and same-session legacy worker fence (seeded lease)')

# Shared stop cannot acquire its lease while the old worker lease remains live.
stop_user=call('paidUser',{}); stop_app=str(uuid.uuid4())
call('paidApp',{'userId':stop_user,'appId':stop_app})
call('paidSend',{'userId':stop_user,'appId':stop_app,'prompt':'stop fence','balance':20})
stop_session=call('paidInspect',{'userId':stop_user,'appId':stop_app})['sessions'][0]['_id']
stop_debit=call('paidClaim',{'sessionId':stop_session}); call('paidConfirm',{'debitId':stop_debit['_id']})
stop_seed={'userId':stop_user,'appId':stop_app,'sessionId':stop_session,'token':'old','expire':False}
call('activationSeedWorker',stop_seed)
assert call('activationClaim',{'sessionId':stop_session,'token':'blocked'})=='wait'
assert call('activationArchive',{'sessionId':stop_session})
assert not call('activationStop',{'sessionId':stop_session,'token':'stop'})
call('activationSeedWorker',{**stop_seed,'expire':True})
assert call('activationStop',{'sessionId':stop_session,'token':'stop'})
print('PASS: seeded old worker blocks activation and shared stop until simulated expiry')

# Expiry permits exactly one concurrent activation claim.
expiry_user=call('paidUser',{}); expiry_app=str(uuid.uuid4())
call('paidApp',{'userId':expiry_user,'appId':expiry_app})
call('paidSend',{'userId':expiry_user,'appId':expiry_app,'prompt':'expiry','balance':20})
expiry_session=call('paidInspect',{'userId':expiry_user,'appId':expiry_app})['sessions'][0]['_id']
expiry_debit=call('paidClaim',{'sessionId':expiry_session}); call('paidConfirm',{'debitId':expiry_debit['_id']})
expiry_seed={'userId':expiry_user,'appId':expiry_app,'sessionId':expiry_session,'token':'old','expire':False}
call('activationSeedWorker',expiry_seed)
assert call('activationClaim',{'sessionId':expiry_session,'token':'before'})=='wait'
call('activationSeedWorker',{**expiry_seed,'expire':True})
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    outcomes=list(pool.map(lambda token:call('activationClaim',{'sessionId':expiry_session,'token':token}),['after-a','after-b']))
assert sorted(outcomes)==['claimed','wait']
print('PASS: one activation after simulated worker lease expiry')
