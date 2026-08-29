const EVENT_ID = '10';
const SEARCH_URL = 'https://aipri.jp/event/e2608271/';
const RESULT_URL = 'https://aipri.jp/event/result.html';
const prefectures = [
  ['1','北海道'],['2','青森県'],['3','岩手県'],['4','宮城県'],['5','秋田県'],['6','山形県'],['7','福島県'],['8','茨城県'],['9','栃木県'],['10','群馬県'],['11','埼玉県'],['12','千葉県'],['13','東京都'],['14','神奈川県'],['15','新潟県'],['16','富山県'],['17','石川県'],['18','福井県'],['19','山梨県'],['20','長野県'],['21','岐阜県'],['22','静岡県'],['23','愛知県'],['24','三重県'],['25','滋賀県'],['26','京都府'],['27','大阪府'],['28','兵庫県'],['29','奈良県'],['30','和歌山県'],['31','鳥取県'],['32','島根県'],['33','岡山県'],['34','広島県'],['35','山口県'],['36','徳島県'],['37','香川県'],['38','愛媛県'],['39','高知県'],['40','福岡県'],['41','佐賀県'],['42','長崎県'],['43','熊本県'],['44','大分県'],['45','宮崎県'],['46','鹿児島県'],['47','沖縄県']
];
const numerals = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const results = (await mapWithConcurrency(prefectures, 4, ([id, name]) => fetchPrefecture(id, name))).flat();
    results.forEach((shop, i) => {
      shop.id = `shop-${i + 1}`;
      shop.events.forEach((event, j) => { event.id = `shop-${i + 1}-event-${j + 1}`; });
    });
    return res.status(200).json({
      eventName: 'お店でアイプリチャレンジ！メルヘンフェスコーデをゲット',
      eventId: EVENT_ID,
      challengeId: 'aipri-challenge-202609',
      prefecture: '全国',
      sourceUrl: SEARCH_URL,
      sourceUrls: prefectures.map(([id]) => buildUrl(id, 1)),
      fetchedAt: new Date().toISOString(),
      shops: results,
    });
  } catch (error) {
    return res.status(500).json({ error: 'refresh_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function fetchPrefecture(id, prefecture) {
  const first = await fetchHtml(buildUrl(id, 1));
  const countMatch = first.match(/pageLink__count">\s*\d+\/(\d+)/);
  const pages = Math.min(countMatch ? Number(countMatch[1]) : 1, 20);
  const pageNumbers = Array.from({ length: Math.max(0, pages - 1) }, (_, index) => index + 2);
  const rest = await mapWithConcurrency(pageNumbers, 3, (page) => fetchHtml(buildUrl(id, page)));
  return [first, ...rest]
    .flatMap(extractBlocks)
    .map((block, index) => parseShop(block, prefecture, index))
    .filter((shop) => shop.name && shop.address && shop.events.length);
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runner() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
  return results;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AipriChallengeMap202609/1.2', Accept: 'text/html' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`official page ${response.status}: ${url}`);
    return await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`official page timeout: ${url}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(prefId, page) {
  const url = new URL(RESULT_URL);
  url.searchParams.append('event_id[]', EVENT_ID);
  url.searchParams.set('key_word', '');
  url.searchParams.set('pref_id', prefId);
  url.searchParams.set('event_year', '2026');
  url.searchParams.set('event_month', '9');
  url.searchParams.set('event_date', '');
  url.searchParams.append('shop_flag[]', '1');
  url.searchParams.set('page', String(page));
  return url.toString();
}

function extractBlocks(html) {
  return html.split('<div class="shopResult__item">').slice(1).map((block) => block.split('<div class="pageLink">')[0]);
}

function parseShop(block, prefecture, index) {
  const name = first(block, /<h3 class="ttl ttl--shopResult">([\s\S]*?)<\/h3>/);
  const address = first(block, /<p class="shopResult__address">([\s\S]*?)<\/p>/);
  const mapsSearchUrl = attr(block, /<a href="([^"]*google\.com\/maps\/search[^"]*)"/);
  const fields = dlFields(block);
  const lists = Object.fromEntries(Object.entries({
    date: fields['開催日程'], age: fields['年齢制限'], start: fields['開催時間'], reg: fields['参加受付時間'], lottery: fields['抽選開始時間'], note: fields['備考']
  }).map(([key, value]) => [key, splitParts(value)]));
  const count = Math.max(1, ...Object.values(lists).map((parts) => parts.length));
  const events = Array.from({ length: count }, (_, i) => ({
    id: '',
    label: lists.date[i]?.label || lists.age[i]?.label || (count > 1 ? `大会${numerals[i] || i + 1}` : '大会'),
    date: parseDate(valueAt(lists.date, i, count)),
    dateDisplay: valueAt(lists.date, i, count),
    ageLimit: valueAt(lists.age, i, count),
    startTime: valueAt(lists.start, i, count),
    registrationTime: valueAt(lists.reg, i, count),
    lotteryTime: valueAt(lists.lottery, i, count),
    note: valueAt(lists.note, i, count),
  }));
  return { id: '', name, address, prefecture, machineTypes: machineTypes(block), participation: fields['参加方法'] || '', mapsSearchUrl, events };
}

function dlFields(block) {
  const output = {};
  const regex = /<dt class="searchedList__term">([\s\S]*?)<\/dt>\s*<dd class="searchedList__desc">([\s\S]*?)<\/dd>/g;
  for (const match of block.matchAll(regex)) output[text(match[1])] = text(match[2]);
  return output;
}

function splitParts(value) {
  if (!value) return [];
  return value.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^大会\s*([①②③④⑤⑥⑦⑧⑨⑩]|\d+)\s*(.*)$/);
    if (!match) return { label: '', value: line };
    const number = /^\d+$/.test(match[1]) ? Number(match[1]) : numerals.indexOf(match[1]) + 1;
    return { label: `大会${numerals[number - 1] || number}`, value: match[2].trim() };
  });
}

function valueAt(parts, index, count) {
  if (!parts.length) return '';
  if (parts.length === count) return parts[index]?.value || '';
  if (parts.length === 1 && !parts[0].label) return parts[0].value;
  return parts[index]?.value || '';
}

function parseDate(value) {
  const match = String(value || '').match(/(\d{2,4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return '';
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  return `${year}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
}

function machineTypes(block) {
  return [['himitsu', 'おねがいアイプリ'], ['verse', 'アイプリバース'], ['hiroba', 'アイプリステーション']]
    .filter(([key]) => block.includes(`shopResultType__img--${key}`))
    .map(([, label]) => label);
}

function first(source, regex) {
  const match = source.match(regex);
  return match ? text(match[1]) : '';
}

function attr(source, regex) {
  const match = source.match(regex);
  return match ? decode(match[1]) : '';
}

function text(value) {
  return decode(String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim());
}

function decode(value) {
  const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
  return value.replace(/&(nbsp|amp|lt|gt|quot);|&#039;/g, (match) => entities[match] || match);
}
