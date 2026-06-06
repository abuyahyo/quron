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
  // snippet: match past the ~260-char card cut must still be highlighted (2:258
  // is ~989 chars with "сен" near the end). Card windows around the match.
  await fill('сен');
  const senMarks=await pg.$$eval('#verseHits .result-item',items=>items.slice(0,8).map(it=>it.querySelectorAll('.result-text mark').length));
  ok('every visible сен result highlights the word', senMarks.every(n=>n>=1));
  // page in more hits until the long verse 2:258 is rendered
  for(let k=0;k<5;k++){
    const has=await pg.evaluate(()=>[...document.querySelectorAll('#verseHits .result-label')].some(e=>/Бақара · 258/.test(e.textContent)));
    if(has)break;
    const more=await pg.$('#verseHits .hits-more');if(!more)break;
    await more.click();await pg.waitForTimeout(250);
  }
  const v258=await pg.evaluate(()=>{
    const it=[...document.querySelectorAll('#verseHits .result-item')].find(x=>/Бақара · 258/.test(x.querySelector('.result-label').textContent));
    if(!it)return null;const t=it.querySelector('.result-text');
    return {marks:t.querySelectorAll('mark').length,pre:t.textContent.trim().startsWith('…')};
  });
  ok('long verse 2:258 highlights сен via snippet', v258&&v258.marks>=1&&v258.pre);
  // match living only in the hidden "Изоҳ:" note must still be highlighted
  // (2:228 has "ҳаққи" only in its note); snippet falls back to the full text.
  await fill('ҳаққ');
  const v228=await pg.evaluate(()=>{
    const it=[...document.querySelectorAll('#verseHits .result-item')].find(x=>/Бақара · 228/.test(x.querySelector('.result-label').textContent));
    if(!it)return null;const t=it.querySelector('.result-text');
    return {marks:t.querySelectorAll('mark').length};
  });
  ok('note-only match 2:228 highlights ҳаққ', v228&&v228.marks>=1);
  // word-boundary: search hits word starts only, so "ҳаққ" matches
  // "ҳаққи"/"ҳаққингизни" but NOT the middle of "муҳаққақки" (2:269).
  const wb=await pg.evaluate(()=>{
    const labels=[...document.querySelectorAll('#verseHits .result-label')].map(e=>e.textContent);
    return {has269:labels.some(l=>/Бақара · 269/.test(l)),has188:labels.some(l=>/Бақара · 188/.test(l)),
      midMark:[...document.querySelectorAll('#verseHits mark')].some(m=>/му/i.test(m.textContent))};
  });
  ok('ҳаққ excludes mid-word муҳаққақки (2:269)', !wb.has269);
  ok('ҳаққ keeps word-start ҳаққингизни (2:188)', wb.has188);
  ok('no highlight inside a longer word', !wb.midMark);
  // Latin-typed query highlights the Cyrillic text it matched (via _tll map).
  await fill('alloh');
  const lat=await pg.$$eval('#verseHits .result-item',its=>its.slice(0,10).map(it=>it.querySelectorAll('.result-text mark').length));
  ok('Latin query alloh highlights Cyrillic results', lat.length>0&&lat.every(n=>n>=1));
  const latTxt=await pg.$eval('#verseHits .result-text mark',m=>m.textContent);
  ok('Latin highlight wraps Cyrillic Аллоҳ', /Аллоҳ/i.test(latTxt));

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
  // long-Arabic windowing: every visible الله result must show its match even
  // when it sits past the card cut (hlAr windows around the hit).
  await fill('الله');
  const arCov=await pg.$$eval('#verseHits .result-text-ar',els=>els.filter(e=>e.querySelectorAll('mark').length===0).length);
  ok('every الله result highlights (windowed)', arCov===0);
  // opening an arabic hit highlights the word on the detail page too
  await pg.click('#verseHits .result-item'); await pg.waitForTimeout(500);
  ok('detail verse-ar highlighted', (await pg.$$eval('#suraPage .verse-ar mark',e=>e.length))>=1);
  await pg.evaluate(()=>App.goHome());await pg.waitForTimeout(200);

  console.log('=== 5c. ARABIC WORD-BOUNDARY (no cross-word matches) ===');
  // Loose Arabic normalization keeps spaces, so a query can't bridge two words.
  // ملتنا (مِلَّتِنَا "our religion") must match Аъроф 88-89 / Иброҳим 13-14 but
  // NOT the مَّ‿لَا‿تُن span of ثُمَّ لَا تُنظِرُونِ in Ҳуд 54-55.
  await fill('ملتنا');
  const mlLabels=await pg.$$eval('#verseHits .result-label',e=>e.map(x=>x.textContent));
  ok('ملتنا keeps real word match (Аъроф 88-89)', mlLabels.some(t=>/Аъроф · 88-89/.test(t)));
  ok('ملتنا excludes cross-word span (Ҳуд 54-55)', !mlLabels.some(t=>/Ҳуд · 54-55/.test(t)));
  const mlNoMark=await pg.$$eval('#verseHits .result-text-ar',els=>els.filter(e=>e.querySelectorAll('mark').length===0).length);
  ok('every ملتنا arabic result highlights the match', mlNoMark===0);
  // The query ends with alif, which the loose skeleton drops — the highlight must
  // still cover the trailing ا of مِلَّتِنَا, not stop at مِلَّتِنَ.
  const mlMarks=await pg.$$eval('#verseHits .result-text-ar mark',e=>e.map(m=>m.textContent));
  ok('ملتنا highlight includes the trailing alif', mlMarks.length>0&&mlMarks.every(s=>/ا/.test(s)));
  // Article alif at the start must be inside the highlight too (الجنة -> ٱلجنة).
  await fill('الجنة');
  const aljMarks=await pg.$$eval('#verseHits .result-text-ar mark',e=>e.map(m=>m.textContent).slice(0,6));
  ok('الجنة highlight includes the leading article alif', aljMarks.length>0&&aljMarks.every(s=>/^[اٱ]/.test(s)));
  // A bare-consonant query must NOT over-grab a trailing alif it never typed.
  await fill('ملت');
  const mltMarks=await pg.$$eval('#verseHits .result-text-ar mark',e=>e.map(m=>m.textContent.replace(/[ً-ْٰۖ-ۭ]/g,'')));
  ok('ملت does not over-extend onto a trailing alif', mltMarks.length>0&&mltMarks.every(s=>!/ا$/.test(s)));

  console.log('=== 5d. TA-MARBUTA IS NOT HAA ===');
  // ة and ه are distinct letters (Quran spelling is canonical), so a ة query must
  // not collide with a pronoun ه: حية (snake / تحية) must hit Тоҳа 20:20 حَيَّةٌ but
  // NOT نُوحِيهِ (Ол-и-Имрон 44) or أَحْيَاهُم (Бақара 243).
  await fill('حية');
  const tmLabels=await pg.$$eval('#verseHits .result-label',e=>e.map(x=>x.textContent));
  ok('حية finds the snake verse Тоҳа 20', tmLabels.some(t=>/Тоҳа · 20-оят/.test(t)));
  ok('حية excludes pronoun-haa نوحيه (Ол-и-Имрон 44)', !tmLabels.some(t=>/Имрон · 44-оят/.test(t)));
  ok('حية excludes pronoun-haa أحياهم (Бақара 243)', !tmLabels.some(t=>/Бақара · 243-оят/.test(t)));
  const tmMarks=await pg.$$eval('#verseHits .result-text-ar mark',e=>e.map(m=>m.textContent.replace(/[ً-ٟۖ-ۭ]/g,'')));
  ok('every حية highlight actually contains ة', tmMarks.length>0&&tmMarks.every(s=>/ة/.test(s)));

  console.log('=== 5e. ARABIC WORD-START (proclitic-aware) ===');
  // Arabic search anchors at word starts (allowing و/ف/ب/ك/ل + the article ال),
  // like the Uzbek search — so حية matches the word حَيَّة but NOT the tail of
  // تَحِيَّة (Нисо 86 / Нур 61 / Фурқон 75).
  await fill('حية');
  const wbLabels=await pg.$$eval('#verseHits .result-label',e=>e.map(x=>x.textContent));
  ok('حية matches the standalone word (Тоҳа 20)', wbLabels.some(t=>/Тоҳа · 20-оят/.test(t)));
  ok('حية does NOT match the tail of تحية (Нур 61)', !wbLabels.some(t=>/Нур · 61-оят/.test(t)));
  ok('حية does NOT match the tail of تحية (Нисо 86)', !wbLabels.some(t=>/Нисо · 86-оят/.test(t)));
  // Proclitic-prefixed words must still be found (وَ/الْ etc.), so a common word
  // like الله is not broken by the word-start anchor.
  await fill('الله'); ok('الله still finds many verses (proclitics intact)', (await hits())>50);

  console.log('=== 6. ARTICLE SUGGESTION ===');
  await fill('المقام'); ok('article sug shows for real word', (await pg.$$eval('#verseHits .ar-sug',e=>e.length))>=1);
  await fill('المصصصص'); ok('article sug hidden for gibberish', (await pg.$$eval('#verseHits .ar-sug',e=>e.length))===0);

  console.log('=== 7. NO JANNAH SUGGESTION (feature removed) ===');
  await fill('жаннат');
  ok('no jannah suggestion button', (await pg.$$eval('#verseHits .jannah-sug',e=>e.length))===0);
  ok('жаннат still finds verses normally', (await hits())>0);

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
