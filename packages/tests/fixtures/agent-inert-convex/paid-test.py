"""Only synthetic users on the disposable loopback backend; no provider calls."""
import concurrent.futures, json, os, urllib.request, uuid
key = os.environ['E2E_CONVEX_ADMIN_KEY']
assert os.environ.get('E2E_CONVEX_URL') == 'http://127.0.0.1:3540'
assert os.environ.get('E2E_TELEMETRY_DISABLED') == '1'
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
