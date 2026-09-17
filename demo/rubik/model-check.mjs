// All six one-turn cases, actual model; no correctness claim if the test completes.
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=process.env.DEMO_URL||'http://127.0.0.1:8788';
const path=fileURLToPath(new URL('../../artifacts/',import.meta.url));await mkdir(path,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const trials=[];
try{
 for(const [i,scramble] of ['U',"U'",'R',"R'",'F',"F'"].entries()){
  const page=await browser.newPage();
  await page.addInitScript(value=>{Math.random=()=>value;},(i+.1)/6);
  await page.goto(`${base}/demo/rubik/`);await page.waitForFunction(()=>!!window.demoController);
  await page.locator('#single-step').click();await page.waitForFunction(()=>window.demoController.records.length===1&&!window.demoController.isBusy(),{},{timeout:120000});
  const record=await page.evaluate(()=>window.demoController.records[0]);trials.push({scramble,record});console.log({scramble,action:record.action,won:record.gameAfter?.won,error:record.error});await page.close();
 }
 await writeFile(`${path}rubik-net-actions.json`,JSON.stringify(trials,null,2));
}finally{await browser.close();}
