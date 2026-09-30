import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const origin=process.env.MD_TEST_ORIGIN||'http://127.0.0.1:5174';
const output=process.env.MD_TEST_OUTPUT||'/tmp/attica-md-browser';
fs.mkdirSync(output,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const markup=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>
  <main id="root" style="max-width:1440px;margin:0 auto;padding:20px"></main><script type="module">
  import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);
  window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;
  const ReactModule=await import('/node_modules/.vite/deps/react.js');
  const React=ReactModule.default||ReactModule;
  const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
  const createRoot=ReactDOM.createRoot||ReactDOM.default?.createRoot;
  if(typeof createRoot!=='function')throw new Error('React createRoot export unavailable');
  await import('/src/index.css');const {default:Report}=await import('/src/components/MdCallReport.tsx');
  createRoot(document.getElementById('root')).render(React.createElement(Report,{fromDate:'2026-09-10',toDate:'2026-09-10',refreshKey:0}));
  </script></body></html>`;
try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,acceptDownloads:true});
    const page=await context.newPage();const errors=[],requests=[];let summary;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',async r=>{if(r.url().includes('/md-dashboard/summary')&&r.ok())summary=await r.json();});
    await page.route('**/md-report-check',route=>route.fulfill({contentType:'text/html',body:markup}));
    // Read-only reporting calls only; isolate the UI from live telephony and logins.
    await page.route('**/api/**',route=>{
      const request=route.request();const url=new URL(request.url());requests.push(url.pathname+url.search);
      if(url.pathname.startsWith('/api/md-dashboard/')&&request.method()==='GET')return route.continue();
      return route.fulfill({contentType:'application/json',body:'[]'});
    });
    await page.goto(`${origin}/md-report-check`);
    const inbound=page.getByRole('button',{name:/^Inbound\s+\d+/});
    await inbound.waitFor({timeout:30000});
    assert.equal(requests.filter(r=>r.includes('/records')).length,0);
    await page.screenshot({path:`${output}/overview-${viewport.width}.png`,fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const firstRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.ok());
    await inbound.click();const first=await (await firstRequest).json();
    assert.equal(first.totalRecords,summary.summary.inbound);assert.equal(first.rows.length,50);
    await page.getByText(`Showing 1 to 50 of ${first.totalRecords}`,{exact:true}).waitFor();
    await page.screenshot({path:`${output}/inbound-${viewport.width}.png`});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const dialog=page.getByRole('dialog');const box=await dialog.boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1);
    assert.ok(box.y>=0&&box.y+box.height<=viewport.height+1);
    const nextRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.ok());
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    const second=await (await nextRequest).json();assert.equal(second.page,2);
    assert.ok(second.rows.every(row=>!first.rows.some(old=>old.id===row.id)));
    const lastRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.ok());
    await page.getByRole('button',{name:'Last page',exact:true}).click();
    const last=await (await lastRequest).json();assert.equal(last.page,last.totalPages);
    await page.getByText(`Showing ${(last.page-1)*50+1} to ${last.totalRecords} of ${last.totalRecords}`,{exact:true}).waitFor();
    const sizeRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.ok());
    await page.getByLabel('Rows per page').selectOption('25');
    const sized=await (await sizeRequest).json();assert.equal(sized.page,1);assert.equal(sized.rows.length,25);
    await page.getByText(`Showing 1 to 25 of ${sized.totalRecords}`,{exact:true}).waitFor();
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export Current Page',exact:true}).click();
    const download=await downloadPromise;assert.equal(await download.failure(),null);
    assert.ok(download.url().includes('scope=page'));assert.ok(download.url().includes('metric=inbound'));
    await download.delete();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    const outboundRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.url().includes('metric=outbound')&&r.ok());
    await page.getByRole('button',{name:/^Outbound\s+\d+/}).click();
    const outbound=await (await outboundRequest).json();
    assert.equal(outbound.totalRecords,summary.summary.outbound);
    assert.ok(outbound.rows.every(row=>row.direction==='outgoing'));
    await page.getByRole('button',{name:'Close',exact:true}).click();
    const language=summary.languages.find(r=>r.calls>0);
    const languageRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.ok());
    await page.getByRole('button',{name:`${language.language} ${language.calls}`,exact:true}).click();
    const filtered=await (await languageRequest).json();assert.equal(filtered.totalRecords,language.calls);
    assert.ok(filtered.rows.every(r=>r.language===language.language));
    await page.getByRole('button',{name:'Close',exact:true}).click();
    const uniqueRequest=page.waitForResponse(r=>r.url().includes('/md-dashboard/records')&&r.ok());
    await page.getByRole('button',{name:/^Unique Callers\s+\d+/}).click();
    const unique=await (await uniqueRequest).json();assert.equal(unique.totalRecords,summary.summary.uniqueCallers);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({viewport,inbound:first.totalRecords,outbound:outbound.totalRecords,unique:unique.totalRecords,reportRequests:requests.filter(r=>r.includes('/md-dashboard/')).length,errors}));
    await context.close();
  }
} finally {await browser.close();}
