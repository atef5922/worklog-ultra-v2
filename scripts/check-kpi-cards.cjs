// Isolated React/RSC rendering test; no app server, authentication or employee data.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {createFromReadableStream} from 'next/dist/compiled/react-server-dom-webpack/client.browser';
    import {DashboardKpiCards} from './src/components/dashboard/dashboard-kpi-cards';
    const keys=['planned','completed','inProgress','pending'];
    const make=(count,reverse)=>keys.map(key=>({key,title:key,value:count,href:'/dashboard',icon:null,art:'/icon.svg',iconWrap:'',card:'',border:'',accent:''}))[reverse?'reverse':'slice']();
    const app=createRoot(document.getElementById('root'));
    let trailingCard,controller;
    const encoder=new TextEncoder();
    const stream=new ReadableStream({start(c){controller=c;c.enqueue(encoder.encode('0:{"trailingCard":"$L1"}\\n'));}});
    const render=(show=true,reverse=false,count=0)=>flushSync(()=>app.render(<DashboardKpiCards cards={make(count,reverse)} tasks={[]} currentUserId="synthetic" progress={{planned:count,completed:0,inProgress:0,pending:0}} trailingCard={show?trailingCard:null}/>));
    window.kpiTest={render};
    createFromReadableStream(stream,{}).then(model=>{
      trailingCard=model.trailingCard;
      render();
      // Metadata 2 is React's unkeyed server-child marker. It must not leak into a client sibling list.
      setTimeout(()=>{controller.enqueue(encoder.encode('1:["$","div",null,{"data-dashboard-card":true,"title":"Attendance status","children":"Attendance"},null,null,2]\\n'));controller.close();},40);
    });
  `;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: root, loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
    alias: { 'next/navigation': path.join(__dirname, 'attendance-check/navigation.ts') } });
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url === '/icon.svg') { res.setHeader('Content-Type','image/svg+xml'); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>'); }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><style>.relative{position:relative}.pointer-events-none{pointer-events:none}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>{errors.push(error.message);console.error('Fixture runtime:',error.message);});
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    // The fixture contains no client-module references, but the RSC decoder initializes Webpack's filename hook.
    await page.addInitScript(()=>{
      const requireModule=()=>{throw new Error('Unexpected client-module reference in KPI fixture');};
      requireModule.u=id=>String(id);
      window.__webpack_require__=requireModule;
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByTitle('Attendance status',{exact:true}).waitFor();
    assert.deepEqual(errors,[], 'No console warnings/errors while resolving a server-provided Attendance card');
    assert.equal(await page.locator('section[data-page-section] > [data-dashboard-card]').count(),5);
    await page.evaluate(()=>{window.kpiTest.attendance=document.querySelector('[title="Attendance status"]');window.kpiTest.planned=document.querySelector('[title^="planned"]');window.kpiTest.render(true,true,2);});
    assert.equal(await page.evaluate(()=>window.kpiTest.attendance===document.querySelector('[title="Attendance status"]')&&window.kpiTest.planned===document.querySelector('[title^="planned"]')),true);
    await page.locator('button[title^="planned"]').click();
    await page.getByText('Nothing here for today.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.evaluate(()=>window.kpiTest.render(false));
    assert.equal(await page.locator('section[data-page-section] > [data-dashboard-card]').count(),4);
    await page.evaluate(()=>window.kpiTest.render(true));
    assert.equal(await page.locator('section[data-page-section] > [data-dashboard-card]').count(),5);
    assert.deepEqual(errors,[]);
    console.log('PASS streamed RSC Attendance slot, no key warnings, unchanged grid structure, stable card identity, KPI modal and optional trailing card');
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
