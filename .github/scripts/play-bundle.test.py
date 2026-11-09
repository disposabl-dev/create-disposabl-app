import os,subprocess,tempfile,pathlib,json
root=pathlib.Path(__file__).resolve().parents[2]
tmp=pathlib.Path(tempfile.mkdtemp(prefix='play-bundle-inert-')); b=tmp/'bin';b.mkdir(); sha='a'*40
scripts={'git':f'#!/bin/sh\necho {sha}\n','gh':f'#!/bin/sh\necho {sha}\n','bun':'#!/bin/sh\nprintf \'%s\\n\' \'{"android":{"package":"com.yastai.disposabl"},"extra":{"disposablAndroidPayments":false,"disposablAndroidArchitectures":["arm64-v8a","x86_64"]},"updates":{}}\'\n','node':'#!/bin/sh\ntest -f "$ANDROID_KEYSTORE_PATH"\ntest "$PLAY_UPLOAD_CERT_SHA256" = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\necho helper-invoked\n'}
for name,data in scripts.items(): p=b/name;p.write_text(data);p.chmod(0o755)
e={**os.environ,'PATH':str(b)+':/usr/bin:/bin','STORAGE_BUDGET_VERIFIED':'true','GITHUB_REF':'refs/heads/main','EXPECTED_SOURCE_SHA':sha,'GITHUB_SHA':sha,'GITHUB_REPOSITORY':'example/repo','UPDATE_POLICY':'disabled','EXPO_PROJECT_ID':'','EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED':'true','PLAY_UPLOAD_CERT_SHA256':'B'*64,'RUNNER_TEMP':str(tmp),'DISPOSABL_ANDROID_SIGNING':json.dumps({'keystoreBase64':'YQ==','storePassword':'synthetic-secret-one','keyAlias':'synthetic-secret-two','keyPassword':'synthetic-secret-three'})}
for case,overrides,ok in [('valid',{},True),('wrong-sha',{'GITHUB_SHA':'b'*40},False),('analytics-disabled',{'EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED':'false'},False),('wrong-ref',{'GITHUB_REF':'refs/heads/other'},False),('bad-policy',{'UPDATE_POLICY':'expo'},False),('bad-signing',{'DISPOSABL_ANDROID_SIGNING':'{}'},False),('e2e',{'EXPO_PUBLIC_E2E':'true'},False)]:
 r=subprocess.run(['bash',str(root/'.github/scripts/play-bundle.sh'),'build'],cwd=root,env={**e,**overrides},capture_output=True,text=True)
 assert (r.returncode==0)==ok,(case,r.returncode,r.stderr)
 assert not (tmp/'play-upload.jks').exists(),case
 if ok: assert 'helper-invoked' in r.stdout
 print(case,'PASS')
workflow=(root/'.github/workflows/pipeline.yml').read_text()
assert not (root/'.github/workflows/play-bundle.yml').exists()
assert workflow.count("needs.changes.outputs.android == 'true' && !(github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app')") == 3
assert "needs.web.outputs.android_build == 'true' && !(github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app')" in workflow
job=workflow.split('  android-play:',1)[1].split('  android-failure:',1)[0]
assert "needs: [changes, web]" in job and "github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app'" in job
assert 'EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED: "true"' in job and 'UPDATE_POLICY: disabled' in job
assert 'eas-cli@27.2.0 submit --platform android --profile production --path' in job
assert '$((1000 + GITHUB_RUN_NUMBER))' in job
assert 'actions/upload-artifact' not in job and 'eas-cli@27.2.0 build' not in job
profile=json.loads((root/'apps/mobile/eas.json').read_text())['submit']['production']['android']
assert profile == {'track':'production','releaseStatus':'completed','applicationId':'com.yastai.disposabl'}
print('workflow/profile PASS')
print('fixture',tmp)
