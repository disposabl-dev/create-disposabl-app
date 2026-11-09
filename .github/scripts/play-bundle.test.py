import os,subprocess,tempfile,pathlib,json,textwrap
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
# The active serialized release may finish after main advances, but a forced
# rewrite must not authorize its artifact. New builds still require current main.
(b/'gh').write_text('#!/bin/sh\ncase "$*" in *compare*) echo "$COMPARISON" ;; *) echo "$MAIN_SHA" ;; esac\n')
for command,status,main,ok in [
 ('verify-source','ahead','b'*40,False),
 ('verify-submission-source','ahead','b'*40,True),
 ('verify-submission-source','identical',sha,True),
 ('verify-submission-source','diverged','b'*40,False),
 ('verify-submission-source','behind','b'*40,False),
]:
 r=subprocess.run(['bash',str(root/'.github/scripts/play-bundle.sh'),command],cwd=root,env={**e,'COMPARISON':status,'MAIN_SHA':main},capture_output=True,text=True)
 assert (r.returncode==0)==ok,(command,status,r.stderr)
print('source succession PASS')
workflow=(root/'.github/workflows/pipeline.yml').read_text()
assert not (root/'.github/workflows/play-bundle.yml').exists()
assert workflow.count("needs.changes.outputs.android == 'true' && !(github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app')") == 3
assert "needs.web.outputs.android_build == 'true' && !(github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app')" in workflow
job=workflow.split('  android-play:',1)[1].split('  android-failure:',1)[0]
assert "needs: [changes, web]" in job and "github.event_name == 'push' && github.repository == 'disposabl-dev/create-disposabl-app'" in job
assert 'EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED: "true"' in job and 'UPDATE_POLICY: disabled' in job
assert 'eas-cli@27.2.0 submit --platform android --profile production --path' in job
assert '$((1000 + 100 * GITHUB_RUN_NUMBER + GITHUB_RUN_ATTEMPT))' in job
allocation=textwrap.dedent(job.split('      - name: Build signed production bundle',1)[1].split('        run: |\n',1)[1].split('          bash .github/scripts/play-bundle.sh build',1)[0])
for number,attempt,expected in [('1','1',1101),('1','2',1102),('2','1',1201),('20999989','99',2099999999),('20999990','1',None),('1','100',None)]:
 r=subprocess.run(['/bin/bash','-c',allocation+'\nprintf "allocated=%s" "$DISPOSABL_ANDROID_VERSION_CODE"'],env={**e,'GITHUB_RUN_NUMBER':number,'GITHUB_RUN_ATTEMPT':attempt},capture_output=True,text=True)
 assert (r.returncode==0)==(expected is not None),(number,attempt,r.stderr)
 if expected is not None: assert f'allocated={expected}' in r.stdout
print('version attempts PASS')
assert 'actions/upload-artifact' not in job and 'eas-cli@27.2.0 build' not in job
profile=json.loads((root/'apps/mobile/eas.json').read_text())['submit']['production']['android']
assert profile == {'track':'production','releaseStatus':'completed','applicationId':'com.yastai.disposabl'}
print('workflow/profile PASS')
print('fixture',tmp)
