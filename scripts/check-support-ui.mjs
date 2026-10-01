import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const profile = await mkdtemp(join(tmpdir(),'medimama-support-'));
// Use dummy connection settings and block all external requests: never touches the live database.
const server = spawn(process.execPath,['node_modules/vite/bin/vite.js','--configLoader','native','--host','127.0.0.1','--port','4187','--strictPort'],{stdio:'ignore',windowsHide:true,env:{...process.env,VITE_SUPABASE_URL:'https://support-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-key'}});
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9247',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws;
try {
  let target;
  for(let i=0;i<100;i++) { try { await fetch('http://127.0.0.1:4187'); target=await(await fetch('http://127.0.0.1:9247/json/new?about:blank',{method:'PUT'})).json();break; }catch{await sleep(100);} }
  assert.ok(target,'Browser and dev server started');
  ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0; const pending=new Map(),faults=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')faults.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);};
  await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*','http://support-test*']});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error(`Timed out: ${expression}`);};
  await send('Page.navigate',{url:'http://127.0.0.1:4187/login'});await wait('Boolean(document.querySelector(".mm-login-page"))');
  await evaluate(`localStorage.setItem('medimama-current-session',JSON.stringify({id:'demo-mother',role:'mother',name:'Demo Mother',demo:true}))`);
  const visit=async(path,text)=>{await send('Page.navigate',{url:'http://127.0.0.1:4187'+path});await wait(`document.body?.innerText.includes(${JSON.stringify(text)})`);};
  await visit('/support/education','Family planning and responsible parenthood');
  assert.equal(await evaluate('document.querySelectorAll(".support-grid article").length'),6);
  await visit('/support/assistant','Your question');
  await evaluate(`(()=>{const input=document.querySelector('.support-form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'family planning');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(100); await evaluate("document.querySelector('.support-form').requestSubmit()");
  await wait("document.querySelector('.support-chat').innerText.includes('informed choices')");
  await evaluate("[...document.querySelectorAll('.assistant-quick-prompts button')].find(b=>b.textContent==='Pagpapasuso').click()");
  await wait("document.querySelector('.support-chat').innerText.includes('exclusive breastfeeding')");
  await visit('/support/concerns','Report a concern');
  await evaluate("document.querySelector('.concern-heading button').click()");
  await wait("Boolean(document.querySelector('.concern-form-footer button'))");
  assert.ok(await evaluate('document.querySelector(".concern-form-footer button").disabled'),'Demo cannot submit concerns');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await writeFile('artifacts/report-form.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),'Report form fits mobile');
  await visit('/support/notifications','Immunization reminders');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await visit('/support/education','Family planning and responsible parenthood');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),'Mobile content fits');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/support-mobile.png',Buffer.from(screenshot.data,'base64'));
  await evaluate(`localStorage.setItem('medimama-current-session',JSON.stringify({id:'demo-admin',role:'admin',name:'Demo Admin',demo:true}))`);
  await visit('/reports','Reports from mothers & caregivers');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),'Admin inbox fits mobile');
  await visit('/reports?tab=summary','Healthcare summary');
  // Demo measurements may belong to the preceding month near month boundaries.
  await evaluate(`(()=>{const input=document.querySelector('input[type="date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2000-01-01');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait('document.querySelectorAll(".support-table tbody tr").length > 0');
  assert.ok(await evaluate('document.querySelectorAll(".support-table tbody tr").length > 0'),'Report displays recorded demo activities');
  await visit('/archives','Archive inactive records');
  await visit('/system','Download clinical backup');
  assert.ok(await evaluate('Boolean(document.querySelector("input[type=file]"))'),'Backup restore file picker is available');
  await visit('/forgot-password','Reset your password');
  assert.ok(await evaluate('Boolean(document.querySelector("input[type=email]"))'),'Password recovery email form is available');
  await visit('/reset-password','Choose a new password');
  assert.ok(await evaluate('document.querySelector("form button").disabled'),'Unauthenticated password update is disabled');
  assert.deepEqual(faults,[]);
  console.log('Support UI passed: education, assistant, concerns, notifications, reports, archives, mobile layout; no live data used.');
} finally {ws?.close();chrome.kill();server.kill();}

