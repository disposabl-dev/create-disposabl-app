"""Synthetic app-level email/password test. Never sends provider email."""
import json, re, urllib.parse, urllib.request, uuid

URL = 'http://127.0.0.1:3540/api/'
def call(kind, name, args, token=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request(URL+kind, data=json.dumps({'path':'fixture:'+name,'args':args,'format':'json'}).encode(), headers=headers)
    out=json.load(urllib.request.urlopen(req, timeout=20))
    if out['status']!='success': raise RuntimeError(name+': '+out.get('errorMessage','failure'))
    return out['value']
def code(email):
    text=call('query','message',{'to':email})
    assert text
    match=re.search(r'http://127\.0\.0\.1:3541/[^\s]+',text)
    assert match
    return urllib.parse.parse_qs(urllib.parse.urlparse(match.group()).query)['code'][0]
def signup(email, password):
    start=call('mutation','signUpWithEmailPassword',{'email':email,'password':password})
    assert start['success']
    finish=call('mutation','completeSignUp',{'emailCode':code(email),'browserSecret':start['browserSecret']})
    assert finish['status']=='complete'
    return finish['tokens']['accessToken']
def login(email,password):
    return call('mutation','signInWithEmailPassword',{'email':email,'password':password})
email='unaffected-'+uuid.uuid4().hex+'@example.test'
password='Fixture-'+uuid.uuid4().hex+'!'
second='Changed-'+uuid.uuid4().hex+'!'
third='Recovered-'+uuid.uuid4().hex+'!'
token=signup(email,password)
session=login(email,password); assert session['status']=='complete'
change=call('mutation','changePassword',{'currentPassword':password,'newPassword':second},session['tokens']['accessToken']); assert change['success']
assert login(email,second)['status']=='complete'
start=call('mutation','startPasswordRecovery',{'email':email}); assert start['success']
proof={'emailCode':code(email),'browserSecret':start['browserSecret']}
assert call('query','checkPasswordRecovery',proof)['success']
recovered=call('mutation','completePasswordRecovery',{**proof,'newPassword':third}); assert recovered['status']=='complete'
assert login(email,third)['status']=='complete'
assert not call('query','checkPasswordRecovery',proof)['success']
print('PASS: unaffected real email signup, verification, login, password change and recovery')
old='erased-'+uuid.uuid4().hex+'@example.test'
oldpass='Fixture-'+uuid.uuid4().hex+'!'
oldtoken=signup(old,oldpass)
pending=call('mutation','startPasswordRecovery',{'email':old}); assert pending['success']
oldproof={'emailCode':code(old),'browserSecret':pending['browserSecret']}
assert call('query','checkPasswordRecovery',oldproof)['success']
result=call('mutation','erase',{},oldtoken)
assert result['password']['complete'] and result['email']['complete']
assert not call('query','checkPasswordRecovery',oldproof)['success']
reset=call('mutation','completePasswordRecovery',{**oldproof,'newPassword':third}); assert reset['status']=='error'
assert login(old,oldpass)['status']=='error'
change=call('mutation','changePassword',{'currentPassword':oldpass,'newPassword':second},oldtoken); assert not change['success']
assert not call('mutation','startPasswordRecovery',{'email':old})['success']
assert login(email,third)['status']=='complete'
print('PASS: erased account denies pending recovery, fresh recovery, login and session password change; unaffected account remains usable')
print('BOUNDARY: anonymous recovery challenge is unattributed; denial does not prove that row was purged')
