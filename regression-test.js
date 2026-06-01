// Quron regression smoke test.
//
// Exercises every search/display/copy/navigation feature and asserts pass/fail.
// Run against a local server:
//   python3 -m http.server 8765 --bind 127.0.0.1 &
//   node regression-test.js
// Exits non-zero if any check fails or the console logs an error.
// Playwright is globally installed (CommonJS) at /opt/node22/lib/node_modules.

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({headless:true});
  const errors=[]; let pass=0, fail=0;
  const pg = await (await b.newContext({viewport:{width:412,height:900}, permissions:['clipboard-read','clipboard-write']})).newPage();
  pg.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!t.includes('CERT')&&!t.includes('net::'))errors.push(t);}});
  pg.on('pageerror',e=>errors.push('PE:'+e.message));
  function ok(name,cond){if(cond)pass++;else{fail++;console.log('  ❌ FAIL: '+name);}}
  async function fill(q){await pg.fill('#searchInput',q);await pg.waitForTimeout(420);}
  async function hits(){return pg.$$eval('#verseHits .result-item',e=>e.length);}
  async function grid(){return pg.$$eval('.sura-card',e=>e.map(x=>x.getAttribute('data-num')));}

  await pg.goto('http://127.0.0.1:8765/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(500);

  console.log('=== 1. HOME GRID ===');
  ok('114 cards', (await grid()).length===114);

  console.log('=== 2. UZBEK SEARCH ===');
  await fill('раҳмон'); ok('раҳмон finds verses', (await hits())>40);

  console.log('=== 3. VERSE REFERENCE (single) ===');
  await fill('Бақара сураси, 25-оят');
  ok('ref card shows', (await pg.$$eval('#refHit .ref-item',e=>e.length))===1);
  ok('ref href #/2/25', (await pg.$eval('#refHit .ref-item',e=>e.getAttribute('href')))==='#/2/25');

  console.log('=== 4. MULTI REFERENCE ===');
  await fill('* Бақара 25 * Бақара 82 * Ол-и Имрон 5');
  ok('multi ref = 3', (await pg.$$eval('#refHit .ref-item',e=>e.length))===3);
  ok('copy-all shows', (await pg.$$eval('#refHit .hits-copy-all',e=>e.length))===1);

  console.log('=== 5. ARABIC SEARCH (harakat-aware) ===');
  await fill('الجَنَّة'); const jH=await hits();
  ok('الجَنَّة excludes An-Nas', !(await pg.$$eval('#verseHits .result-label',e=>e.map(x=>x.textContent))).some(t=>/114\./.test(t)));
  await fill('الجِنّة');
  ok('الجِنّة includes An-Nas', (await pg.$$eval('#verseHits .result-label',e=>e.map(x=>x.textContent))).some(t=>/114\./.test(t)));

  console.log('=== 5b. ARABIC HIGHLIGHT ===');
  await fill('سماعون للكذب');
  const arHits=await pg.$$eval('#verseHits .result-text-ar',e=>e.length);
  const arMarks=await pg.$$eval('#verseHits .result-text-ar mark',e=>e.length);
  ok('arabic results found', arHits>=1);
  ok('every arabic result highlights the match', arMarks>=arHits);
  // opening an arabic hit highlights the word on the detail page too
  await pg.click('#verseHits .result-item'); await pg.waitForTimeout(500);
  ok('detail verse-ar highlighted', (await pg.$$eval('#suraPage .verse-ar mark',e=>e.length))>=1);
  await pg.evaluate(()=>App.goHome());await pg.waitForTimeout(200);

  console.log('=== 6. ARTICLE SUGGESTION ===');
  await fill('المقام'); ok('article sug shows for real word', (await pg.$$eval('#verseHits .ar-sug',e=>e.length))>=1);
  await fill('المصصصص'); ok('article sug hidden for gibberish', (await pg.$$eval('#verseHits .ar-sug',e=>e.length))===0);

  console.log('=== 7. JANNAH SMART SEARCH ===');
  await fill('жаннат');
  ok('jannah button shows', (await pg.$$eval('#verseHits .jannah-sug',e=>e.length))===1);
  await pg.click('#verseHits .jannah-sug'); await pg.waitForTimeout(450);
  const jlbl=await pg.$eval('#verseHits .section-label',e=>e.textContent);
  ok('jannah label 297', jlbl.includes('297'));

  console.log('=== 8. COPY MODES ===');
  await fill('Бақара сураси, 25-оят');
  await pg.click('#refHit .ref-copy'); await pg.waitForTimeout(200);
  let clip=await pg.evaluate(()=>navigator.clipboard.readText());
  ok('default copy has Arabic+ref', /[؀-ۿ]/.test(clip)&&clip.includes('25-оят'));
  // switch to ref-only
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  await pg.click('#copySeg button[data-cm="ref"]'); await pg.waitForTimeout(150);
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  await fill('Бақара сураси, 25-оят');
  await pg.click('#refHit .ref-copy'); await pg.waitForTimeout(200);
  clip=await pg.evaluate(()=>navigator.clipboard.readText());
  ok('ref-only copy = reference', clip.trim()==='Бақара сураси, 25-оят');
  // reset copy mode
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  await pg.click('#copySeg button[data-cm="both"]'); await pg.waitForTimeout(150);
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);

  console.log('=== 9. OPEN SURA + BACK PRESERVES SEARCH ===');
  await fill('раҳмон'); const before=await hits();
  await pg.click('#verseHits .result-item'); await pg.waitForTimeout(450);
  ok('sura opened', (await pg.$eval('#suraPage',e=>e.className))==='visible');
  await pg.click('#backBtn'); await pg.waitForTimeout(350);
  ok('search preserved after back', (await pg.inputValue('#searchInput'))==='раҳмон' && (await hits())===before);

  console.log('=== 10. CYRILLIC/LATIN TOGGLE ===');
  await fill('');
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  await pg.click('#scrLat'); await pg.waitForTimeout(400);
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  ok('header latin', (await pg.$eval('.logo-text',e=>e.textContent))==="Qur'on");
  ok('card1 latin', (await pg.$eval('.sura-card .card-name-cy',e=>e.textContent))==='Fotiha');
  await fill('Baqara'); ok('latin search works', (await grid()).includes('2'));
  // toggle back
  await fill('');
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  await pg.click('#scrCyr'); await pg.waitForTimeout(400);
  await pg.click('#settingsBtn'); await pg.waitForTimeout(150);
  ok('cyrillic restored', (await pg.$eval('.logo-text',e=>e.textContent))==='Қуръон');

  console.log('=== 11. THEME + FONT ===');
  await pg.click('#themeBtn'); await pg.waitForTimeout(200);
  ok('light theme', (await pg.$eval('body',e=>e.classList.contains('light'))));
  await pg.click('#themeBtn'); await pg.waitForTimeout(200);
  ok('dark theme back', !(await pg.$eval('body',e=>e.classList.contains('light'))));

  console.log('=== 12. PWA INSTALL BANNER ===');
  ok('banner hidden by default', (await pg.$eval('#install-banner',e=>e.hidden)));
  await pg.evaluate(()=>{var e=new Event('beforeinstallprompt');e.prompt=function(){};e.userChoice=Promise.resolve({});window.dispatchEvent(e);});
  await pg.waitForTimeout(200);
  ok('banner shows on beforeinstallprompt', !(await pg.$eval('#install-banner',e=>e.hidden)));
  await pg.click('#install-banner-close'); await pg.waitForTimeout(150);
  ok('banner closes + persists dismiss', (await pg.$eval('#install-banner',e=>e.hidden)) && !!(await pg.evaluate(()=>localStorage.getItem('quron_install_dismissed_at'))));
  await pg.evaluate(()=>localStorage.removeItem('quron_install_dismissed_at'));

  console.log('=== 13. NO-RESULTS GATING ===');
  await fill('فمن عفي له');
  ok('arabic-only verse match hides "nothing found"',
     (await hits())>=1 && (await pg.$$eval('#suraGrid .no-results',e=>e.length))===0);
  await fill('zzqxqx');
  ok('true miss still shows "nothing found"',
     (await pg.$$eval('#suraGrid .no-results',e=>e.length))===1 && (await hits())===0);
  await fill('');

  console.log('=== 14. SEARCH CLEAR BUTTON ===');
  ok('clear button hidden when empty', (await pg.$eval('#searchClear',e=>e.hidden)));
  await fill('раҳмон');
  ok('clear button visible with text', !(await pg.$eval('#searchClear',e=>e.hidden)));
  await pg.click('#searchClear'); await pg.waitForTimeout(300);
  ok('clear empties input, restores grid, hides button',
     (await pg.inputValue('#searchInput'))==='' && (await grid()).length===114
     && (await hits())===0 && (await pg.$eval('#searchClear',e=>e.hidden)));

  console.log('\n=== RESULT ===');
  console.log('PASS:',pass,' FAIL:',fail);
  console.log('CONSOLE ERRORS:', errors.length?JSON.stringify(errors):'none');
  await b.close();
  process.exit(fail>0||errors.length>0?1:0);
})();
