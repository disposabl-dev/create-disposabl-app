import os,subprocess,tempfile,pathlib,json,textwrap
root=pathlib.Path(__file__).resolve().parents[2]
tmp=pathlib.Path(tempfile.mkdtemp(prefix='play-bundle-inert-')); b=tmp/'bin';b.mkdir(); sha='a'*40
scripts={'git':f'#!/bin/sh\necho {sha}\n','gh':'#!/bin/sh\ncase "$*" in *compare*) echo "${COMPARISON-identical}" ;; *) echo "${MAIN_SHA:-'+sha+'}" ;; esac\nexit "${GH_EXIT:-0}"\n','bun':'#!/bin/sh\nprintf \'%s\\n\' \'{"android":{"package":"com.yastai.disposabl","runtimeVersion":{"policy":"fingerprint"}},"extra":{"eas":{"projectId":"7609475b-183a-4488-b1b0-0d7cc35aaaf0"},"disposablAndroidPayments":true,"disposablAndroidArchitectures":["arm64-v8a","x86_64"]},"updates":{"url":"https://u.expo.dev/7609475b-183a-4488-b1b0-0d7cc35aaaf0","requestHeaders":{"expo-channel-name":"production"}}}\'\n','node':'#!/bin/sh\ntest -f "$ANDROID_KEYSTORE_PATH"\ntest "$PLAY_UPLOAD_CERT_SHA256" = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\necho helper-invoked\n'}
for name,data in scripts.items(): p=b/name;p.write_text(data);p.chmod(0o755)
e={**os.environ,'PATH':str(b)+':/usr/bin:/bin','STORAGE_BUDGET_VERIFIED':'true','GITHUB_REF':'refs/heads/main','EXPECTED_SOURCE_SHA':sha,'GITHUB_SHA':sha,'GITHUB_REPOSITORY':'example/repo','UPDATE_POLICY':'expo','EXPO_PROJECT_ID':'7609475b-183a-4488-b1b0-0d7cc35aaaf0','EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED':'true','PLAY_UPLOAD_CERT_SHA256':'B'*64,'RUNNER_TEMP':str(tmp),'DISPOSABL_ANDROID_SIGNING':json.dumps({'keystoreBase64':'YQ==','storePassword':'synthetic-secret-one','keyAlias':'synthetic-secret-two','keyPassword':'synthetic-secret-three'})}
for name in ['EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY','EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT','EXPO_PUBLIC_REVENUECAT_ANDROID_APP_ID','EXPO_PUBLIC_REVENUECAT_ANDROID_TOPUP_PRODUCT']:
 e[name]='fixture'
for name in ['EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY','EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT','EXPO_PUBLIC_REVENUECAT_ANDROID_APP_ID','EXPO_PUBLIC_REVENUECAT_ANDROID_TOPUP_PRODUCT']:
 r=subprocess.run(['bash',str(root/'.github/scripts/play-bundle.sh'),'build'],cwd=root,env={**e,name:'  '},capture_output=True,text=True)
 assert r.returncode != 0 and f'Missing {name}' in r.stderr
for case,overrides,ok in [('valid',{},True),('queued-main',{'COMPARISON':'ahead','MAIN_SHA':'b'*40},True),('rewritten-main',{'COMPARISON':'diverged'},False),('api-failure',{'GH_EXIT':'1'},False),('wrong-sha',{'GITHUB_SHA':'b'*40},False),('analytics-disabled',{'EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED':'false'},False),('wrong-ref',{'GITHUB_REF':'refs/heads/other'},False),('bad-policy',{'UPDATE_POLICY':'disabled'},False),('bad-signing',{'DISPOSABL_ANDROID_SIGNING':'{}'},False),('e2e',{'EXPO_PUBLIC_E2E':'true'},False)]:
 r=subprocess.run(['bash',str(root/'.github/scripts/play-bundle.sh'),'build'],cwd=root,env={**e,**overrides},capture_output=True,text=True)
 assert (r.returncode==0)==ok,(case,r.returncode,r.stderr)
 assert not (tmp/'play-upload.jks').exists(),case
 if ok: assert 'helper-invoked' in r.stdout
 print(case,'PASS')
# Every stage verifies the immutable event checkout remains on main, including
# builds that were queued while a newer push advanced main.
for command in ['verify-source', 'verify-submission-source']:
 for status,api_exit,ok in [('ahead','0',True),('identical','0',True),('diverged','0',False),('behind','0',False),('','0',False),('unknown','0',False),('ahead','1',False)]:
  r=subprocess.run(['bash',str(root/'.github/scripts/play-bundle.sh'),command],cwd=root,env={**e,'COMPARISON':status,'GH_EXIT':api_exit},capture_output=True,text=True)
  assert (r.returncode==0)==ok,(command,status,api_exit,r.stderr)
print('source succession PASS')
workflow=(root/'.github/workflows/pipeline.yml').read_text()
assert not (root/'.github/workflows/play-bundle.yml').exists()
assert '  android-play:\n' not in workflow and 'DISPOSABL_ANDROID_PLAY_ENABLED' not in workflow
assert "needs.changes.outputs.android == 'true'" in workflow
assert "UPDATE_POLICY: ${{ github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app' && 'expo' || '' }}" in workflow
build=workflow.split('  android:',1)[1].split('  android-submit:',1)[0]
job=workflow.split('  android-submit:',1)[1].split('  android-failure:',1)[0]
assert build.count('android-build') == 1 and "vars.ANDROID_PLAY_SUBMIT == 'true'" in job
assert 'verify-submission-source' in job and 'com.yastai.disposabl' in job
assert 'SHA1: 9E:8B:A8:A6:CC:91:07:8A:46:4F:BE:F2:52:86:0B:C8:FE:FB:18:B2' in job
assert 'android-signatures.mjs dist/release/android.aab 92ad2c5b65aad964b622a4b4fede94b40a31dcae0eb537b9201ea464689a9fb9' in job
assert 'name: Upload release artifacts' in build and job.index('download-artifact') < job.index('Verify product Play identity') < job.index('Submit Android bundle')
version_step=workflow.split('      - name: Allocate product Android version',1)[1].split('      - name: Expo',1)[0]
allocation=textwrap.dedent(version_step.split('        run: |\n',1)[1]).replace('echo "DISPOSABL_ANDROID_VERSION_CODE=$version" >> "$GITHUB_ENV"', 'export DISPOSABL_ANDROID_VERSION_CODE=$version').replace('echo "version=$version" >> "$GITHUB_OUTPUT"', '')
for number,attempt,expected in [('1','1',1101),('1','2',1102),('2','1',1201),('20999989','99',2099999999),('20999990','1',None),('1','100',None)]:
 r=subprocess.run(['/bin/bash','-c',allocation+'\nprintf "allocated=%s" "$DISPOSABL_ANDROID_VERSION_CODE"'],env={**e,'GITHUB_RUN_NUMBER':number,'GITHUB_RUN_ATTEMPT':attempt},capture_output=True,text=True)
 assert (r.returncode==0)==(expected is not None),(number,attempt,r.stderr)
 if expected is not None: assert f'allocated={expected}' in r.stdout
print('version attempts PASS')
config_script='const c=require("./apps/mobile/app.config.js")({config:{updates:{url:"https://old",requestHeaders:{old:"value"}}}}); console.log(JSON.stringify(c))'
for policy in ['disabled', '']:
 result=subprocess.run(['node','-e',config_script],cwd=root,env={**os.environ,'EXPO_PROJECT_ID':'project-id','DISPOSABL_MOBILE_CHANNEL':'production','UPDATE_POLICY':policy},capture_output=True,text=True,check=True)
 config=json.loads(result.stdout)
 assert config['android']['runtimeVersion']=={'policy':'fingerprint'}
 if policy == 'disabled':
  assert config['updates']['enabled'] is False and 'url' not in config['updates'] and 'requestHeaders' not in config['updates']
 else:
  assert config['updates']['url']=='https://u.expo.dev/project-id' and config['updates']['requestHeaders']['expo-channel-name']=='production'
print('update policy PASS')
assert 'eas-cli@27.2.0 build' not in job
profile=json.loads((root/'apps/mobile/eas.json').read_text())['submit']['production']['android']
assert profile == {'track':'production','releaseStatus':'completed'}
print('workflow/profile PASS')
print('fixture',tmp)
