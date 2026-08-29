const EVENT_ID = '10';
const SEARCH_URL = `https://aipri.jp/event/search.html?event_id=${EVENT_ID}`;
const RESULT_URL = 'https://aipri.jp/event/result.html';
const prefectures = [
['1','北海道'],['2','青森県'],['3','岩手県'],['4','宮城県'],['5','秋田県'],['6','山形県'],['7','福島県'],['8','茨城県'],['9','栃木県'],['10','群馬県'],['11','埼玉県'],['12','千葉県'],['13','東京都'],['14','神奈川県'],['15','新潟県'],['16','富山県'],['17','石川県'],['18','福井県'],['19','山梨県'],['20','長野県'],['21','岐阜県'],['22','静岡県'],['23','愛知県'],['24','三重県'],['25','滋賀県'],['26','京都府'],['27','大阪府'],['28','兵庫県'],['29','奈良県'],['30','和歌山県'],['31','鳥取県'],['32','島根県'],['33','岡山県'],['34','広島県'],['35','山口県'],['36','徳島県'],['37','香川県'],['38','愛媛県'],['39','高知県'],['40','福岡県'],['41','佐賀県'],['42','長崎県'],['43','熊本県'],['44','大分県'],['45','宮崎県'],['46','鹿児島県'],['47','沖縄県']
];
const numerals = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'method_not_allowed'});
  try {
    const results = (await Promise.all(prefectures.map(async ([id,name]) => fetchPrefecture(id,name)))).flat();
    results.forEach((shop, i) => { shop.id = `shop-${i+1}`; shop.events.forEach((e,j) => e.id = `shop-${i+1}-event-${j+1}`); });
    return res.status(200).json({
      eventName: 'お店でアイプリチャレンジ！メルヘンフェスコーデをゲット',
      eventId: EVENT_ID,
      challengeId: 'aipri-challenge-202609',
      prefecture: '全国',
      sourceUrl: 'https://aipri.jp/event/e2608271/',
      sourceUrls: prefectures.map(([id]) => buildUrl(id,1)),
      fetchedAt: new Date().toISOString(),
      shops: results,
    });
  } catch (e) {
    return res.status(500).json({error:'refresh_failed',message:e instanceof Error ? e.message : String(e)});
  }
}

async function fetchPrefecture(id, prefecture) {
  const first = await fetchHtml(buildUrl(id,1));
  const countMatch = first.match(/pageLink__count">\s*\d+\/(\d+)/);
  const pages = Math.min(countMatch ? Number(countMatch[1]) : 1, 20);
  const htmls = [first];
  for (let page=2; page<=pages; page++) htmls.push(await fetchHtml(buildUrl(id,page)));
  return htmls.flatMap(extractBlocks).map((block, i) => parseShop(block, prefecture, i)).filter(s => s.name && s.address && s.events.length);
}

async function fetchHtml(url) {
  const r = await fetch(url, {headers:{'User-Agent':'AipriChallengeMap202609/1.0','Accept':'text/html'}});
  if (!r.ok) throw new Error(`official page ${r.status}: ${url}`);
  return r.text();
}

function buildUrl(prefId,page) {
  const u = new URL(RESULT_URL);
  u.searchParams.append('event_id[]', EVENT_ID);
  u.searchParams.set('key_word','');
  u.searchParams.set('pref_id',prefId);
  u.searchParams.set('event_year','2026');
  u.searchParams.set('event_month','9');
  u.searchParams.set('event_date','');
  u.searchParams.append('shop_flag[]','1');
  u.searchParams.set('page',String(page));
  return u.toString();
}

function extractBlocks(html) {
  return html.split('<div class="shopResult__item">').slice(1).map(b => b.split('<div class="pageLink">')[0]);
}

function parseShop(block, prefecture, index) {
  const name = first(block, /<h3 class="ttl ttl--shopResult">([\s\S]*?)<\/h3>/);
  const address = first(block, /<p class="shopResult__address">([\s\S]*?)<\/p>/);
  const mapsSearchUrl = attr(block, /<a href="([^"]*google\.com\/maps\/search[^"]*)"/);
  const fields = dlFields(block);
  const lists = Object.fromEntries(Object.entries({
    date: fields['開催日程'], age: fields['年齢制限'], start: fields['開催時間'], reg: fields['参加受付時間'], lottery: fields['抽選開始時間'], note: fields['備考']
  }).map(([k,v]) => [k, splitParts(v)]));
  const count = Math.max(1,...Object.values(lists).map(a=>a.length));
  const events = Array.from({length:count}, (_,i) => ({
    id: '', label: lists.date[i]?.label || lists.age[i]?.label || (count>1 ? `大会${numerals[i] || i+1}` : '大会'),
    date: parseDate(valueAt(lists.date,i,count)), dateDisplay:valueAt(lists.date,i,count), ageLimit:valueAt(lists.age,i,count), startTime:valueAt(lists.start,i,count), registrationTime:valueAt(lists.reg,i,count), lotteryTime:valueAt(lists.lottery,i,count), note:valueAt(lists.note,i,count)
  }));
  return {id:'',name,address,prefecture,machineTypes:machineTypes(block),participation:fields['参加方法']||'',mapsSearchUrl,events};
}

function dlFields(block) { const out={}; const re=/<dt class="searchedList__term">([\s\S]*?)<\/dt>\s*<dd class="searchedList__desc">([\s\S]*?)<\/dd>/g; for(const m of block.matchAll(re)) out[text(m[1])]=text(m[2]); return out; }
function splitParts(v) { if(!v) return []; return v.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(line=>{ const m=line.match(/^大会\s*([①②③④⑤⑥⑦⑧⑨⑩]|\d+)\s*(.*)$/); if(!m)return {label:'',value:line}; const n=/^\d+$/.test(m[1])?Number(m[1]):numerals.indexOf(m[1])+1; return {label:`大会${numerals[n-1]||n}`,value:m[2].trim()}; }); }
function valueAt(parts,i,count) { if(!parts.length)return ''; if(parts.length===count)return parts[i]?.value||''; if(parts.length===1&&!parts[0].label)return parts[0].value; return parts[i]?.value||''; }
function parseDate(v) { const m=String(v||'').match(/(\d{2,4})年\s*(\d{1,2})月\s*(\d{1,2})日/); if(!m)return ''; return `${m[1].length===2?'20'+m[1]:m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`; }
function machineTypes(block) { return [['himitsu','おねがいアイプリ'],['verse','アイプリバース'],['hiroba','アイプリステーション']].filter(([k])=>block.includes(`shopResultType__img--${k}`)).map(([,v])=>v); }
function first(s,re){const m=s.match(re);return m?text(m[1]):'';}
function attr(s,re){const m=s.match(re);return m?decode(m[1]):'';}
function text(v){return decode(String(v||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').trim());}
function decode(v){return v.replace(/&(nbsp|amp|lt|gt|quot);|&#039;/g,m=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#039;':"'"}[m]||m));}
