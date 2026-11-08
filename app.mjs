import { restaurants } from './catalog.mjs';
import { beginRanking, compare, finishRanking, moods, opponent, progress, score } from './ranking.mjs';
import { mapSearchLinks } from './maps.mjs';

const key = 'table-notes-v1';
const empty = { ranked: [], saved: [], recent: [] };
const view = document.querySelector('#view');
const dialog = document.querySelector('#dialog');
const form = document.querySelector('#rating-form');
const fields = document.querySelector('#details-form');
const comparison = document.querySelector('#comparison');
const extras = document.querySelector('#extras');
const submit = form.querySelector('[type="submit"]');
const status = document.querySelector('#status');
const error = document.querySelector('#dialog-error');
const labels = { liked: '喜歡', fine: '普通', disliked: '不喜歡' };
const all = [...restaurants.values()];
const filters = { district: '', cuisine: '', price: '' };
const tour = [
  { title: '記錄', summary: '將吃過和想去的店整理成排行、清單與地圖。' },
  { title: '分享', summary: '回看這次和誰吃了什麼，挑選哪些用餐紀錄出現在動態。' },
  { title: '探索', summary: '累積評價，看看你的口味可能會喜歡哪些店。' },
];
let noticeTimer;
let page = 'search';
let listMap = false;
let tourStep = 0;
let selected = null;
let ratingId = null;
let ratingSession = 0;
let draft = null;
let query = '';
let mapQuery = '台中市 餐廳';
let state = load();

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (!value) return empty;
    const validRank = row => row && restaurants.has(row.id) && moods.includes(row.mood)
      && Number.isFinite(row.value) && Array.isArray(row.tags)
      && row.tags.every(tag => typeof tag === 'string');
    if (![value.ranked, value.saved, value.recent].every(Array.isArray)
        || !value.ranked.every(validRank)
        || ![...value.saved, ...value.recent].every(id => restaurants.has(id))) {
      throw new Error('Invalid stored records');
    }
    return value;
  } catch {
    notify('讀取本機紀錄失敗，暫以空白清單顯示。');
    return empty;
  }
}

function notify(message) {
  clearTimeout(noticeTimer);
  status.textContent = message;
  noticeTimer = setTimeout(() => { status.textContent = ''; }, 4500);
}

function save(next, message) {
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    (dialog.open ? error : status).textContent = '無法儲存。請確認瀏覽器允許本機儲存，或換一張較小的照片。';
    return false;
  }
  state = next;
  if (message) notify(message);
  return true;
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function rows(places) {
  if (!places.length) return '<p class="muted">這裡目前沒有店家。</p>';
  return '<ul class="rows">' + places.map(place => {
    const ranked = state.ranked.find(entry => entry.id === place.id);
    const pos = ranked ? state.ranked.findIndex(entry => entry.value === ranked.value) : -1;
    const isSaved = state.saved.includes(place.id);
    const rating = score(place.id, state.ranked);
    const rank = pos === -1 ? '' : ' · 第 ' + (pos + 1) + ' 名' + (rating ? ' · ' + rating + ' 分' : '');
    return '<li class="row">' + (ranked ? '<span class="rank-badge ' + ranked.mood + '" aria-hidden="true">'
      + (rating || '#' + (pos + 1)) + '</span>' : '')
      + '<button type="button" class="title" data-detail="' + place.id + '">'
      + '<strong>' + escape(place.name) + '</strong><small>' + place.district + ' · ' + place.cuisine + ' · ' + '＄'.repeat(place.price) + rank + '</small></button>'
      + '<button type="button" data-rate="' + place.id + '" aria-label="' + escape((pos < 0 ? '評價 ' : '重評 ') + place.name) + '">'
      + (pos < 0 ? '＋' : '重評') + '</button>'
      + '<button type="button" class="bookmark" data-bookmark="' + place.id + '" aria-pressed="' + isSaved + '" aria-label="' + escape('想去 ' + place.name) + '">想去</button></li>';
  }).join('') + '</ul>';
}

function drawResults() {
  const term = query.trim().toLowerCase();
  const places = term ? all.filter(place => [place.name, place.cuisine, place.district]
    .some(value => value.toLowerCase().includes(term))) : all;
  const recent = state.recent.map(id => restaurants.get(id));
  document.querySelector('#results').innerHTML = (!term && recent.length
    ? '<h3>最近搜尋</h3>' + rows(recent) : '')
    + '<h3>' + (term ? '搜尋結果' : '附近範例店家') + '</h3>' + rows(places);
}

function detail(place) {
  const row = state.ranked.find(entry => entry.id === place.id);
  const rank = row ? state.ranked.findIndex(entry => entry.value === row.value) + 1 : null;
  const rating = score(place.id, state.ranked);
  const image = row?.photo && typeof row.photo === 'string' && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(row.photo)
    ? '<img src="' + row.photo + '" alt="此餐紀錄的照片">' : '';
  const isSaved = state.saved.includes(place.id);
  return '<button type="button" class="back-button" data-back>← 返回</button>'
    + '<article class="place"><div class="place-hero">' + drawMap([place]) + '</div><h2 id="view-title">' + place.name + '</h2>'
    + '<p class="muted">' + place.city + ' · ' + place.district + ' · ' + place.cuisine + '</p>'
    + (row ? '<p><strong>第 ' + rank + ' 名</strong> · ' + labels[row.mood]
      + (rating ? ' · ' + rating + ' 分' : ' · 排滿 10 家顯示分數') + '</p>' : '')
    + '<div class="place-actions"><button type="button" class="primary" data-rate="' + place.id + '">' + (row ? '重新評價' : '加入吃過') + '</button> '
    + '<button type="button" class="bookmark" aria-pressed="' + isSaved + '" data-bookmark="' + place.id + '">' + (isSaved ? '已收藏' : '存為想去') + '</button>'
    + '<button type="button" data-page="explore">街區地圖</button></div>'
    + mapSearchPanel()
    + '<section class="score-grid" aria-label="我的評價摘要"><div><strong>' + (rank ? '#' + rank : '—') + '</strong>我的排名</div>'
    + '<div><strong>' + (rating || '—') + '</strong>' + (rating ? '我的分數' : '滿 10 家顯示分數') + '</div>'
    + '<div><strong>' + (row ? labels[row.mood] : '未評價') + '</strong>用餐感受</div></section>'
    + (row ? '<h3>我的用餐紀錄</h3>' : '<p class="muted">吃過這家嗎？記下感受，讓下一次選餐更簡單。</p>')
    + (row?.dish ? '<p class="record-detail"><small>喜歡的菜</small>' + escape(row.dish) + '</p>' : '')
    + (row?.date ? '<p class="record-detail"><small>用餐日期</small>' + escape(row.date) + '</p>' : '')
    + (row?.companions ? '<p class="record-detail"><small>同行者</small>' + escape(row.companions) + '</p>' : '')
    + (row?.tags.length ? '<p class="record-detail"><small>標籤</small>' + escape(row.tags.join('、')) + '</p>' : '')
    + (row?.note ? '<p class="record-detail"><small>筆記</small>' + escape(row.note) + '</p>' : '') + image
    + (row && state.ranked.length === 1 ? '<section class="first-rank"><h3>你記下第一家店了</h3>'
      + '<p>再評一家，就能開始累積自己的口味排行。</p>'
      + '<button type="button" data-next>再評一家</button></section>' : '')
    + '</article>';
}

function mapSearchPanel() {
  const links = mapQuery.trim() ? mapSearchLinks(mapQuery) : null;
  return '<section class="map-search-panel" aria-labelledby="map-search-title"><h3 id="map-search-title">到地圖找真實店家</h3>'
    + '<p id="map-search-help">示範店家沒有真實地址。輸入店名、地址或城市與料理，開啟地圖查看位置。</p>'
    + '<label for="map-query">真實店名或地址</label><input id="map-query" type="text" maxlength="200" value="' + escape(mapQuery)
    + '" placeholder="例如：台中市咖啡、餐廳名稱或地址" aria-describedby="map-search-help">'
    + '<div class="map-links"><a data-map-provider="google"' + (links ? ' href="' + escape(links.google) + '"' : ' aria-disabled="true"')
    + ' target="_blank" rel="noopener noreferrer">Google Maps <span aria-hidden="true">↗</span></a>'
    + '<a data-map-provider="apple"' + (links ? ' href="' + escape(links.apple) + '"' : ' aria-disabled="true"')
    + ' target="_blank" rel="noopener noreferrer">Apple 地圖 <span aria-hidden="true">↗</span></a></div></section>';
}

function drawMap(places) {
  // shortcut: schematic coordinates only; replace with geocoded places when a real catalog is available.
  const pins = places.map(place => {
    const i = Number(place.id) - 1;
    const x = 17 + Math.floor(i / 6) * 33 + (i % 2 ? 7 : -7);
    const y = 31 + Math.floor(i % 6 / 2) * 24 + (i % 2 ? 7 : 0);
    return '<button type="button" class="map-pin" data-detail="' + place.id
      + '" aria-label="地圖上的 ' + escape(place.name) + '" style="--x:' + x + '%;--y:' + y + '%">'
      + (score(place.id, state.ranked) || place.id) + '</button>';
  }).join('');
  return '<div class="map" aria-label="虛構街區示意圖">'
    + '<svg aria-hidden="true" viewBox="0 0 480 230" preserveAspectRatio="none">'
    + '<path d="M0 146Q145 185 257 128T480 154" fill="none" stroke="#c5dcdf" stroke-width="28"/>'
    + '<path d="M143 0v230M338 0v230M0 76h480M0 198h480M86 0v115M404 92v138" fill="none" stroke="#fff" stroke-width="9"/>'
    + '<rect x="163" y="14" width="110" height="40" rx="8" fill="#d3e0bc"/></svg>'
    + '<div class="map-labels"><span>北巷</span><span>中街</span><span>南埕</span></div>' + pins + '</div>';
}

function filterSelect(key, label) {
  const options = [...new Set(all.map(place => String(place[key])))];
  return '<label>' + label + '<select data-filter="' + key + '"><option value="">全部</option>'
    + options.map(value => '<option value="' + escape(value) + '"' + (filters[key] === value ? ' selected' : '')
      + '>' + (key === 'price' ? '＄'.repeat(Number(value)) : escape(value)) + '</option>').join('')
    + '</select></label>';
}

function exploration() {
  const { count, target, unlocked } = progress(state.ranked);
  const completed = Math.min(count, target);
  const favorite = state.ranked.find(row => row.mood === 'liked')?.cuisine;
  const matches = place => Object.entries(filters).every(([key, value]) => !value || String(place[key]) === value);
  const unseen = all.filter(place => matches(place) && !state.ranked.some(row => row.id === place.id));
  const suggestions = unseen.filter(place => place.cuisine === favorite);
  return '<h2 id="view-title">探索</h2><p class="muted">示意地圖 · 三個虛構街區</p>'
    + '<div class="filters">' + filterSelect('district', '街區') + filterSelect('cuisine', '料理')
    + filterSelect('price', '價位') + '</div>' + mapSearchPanel() + drawMap(state.ranked.filter(matches))
    + '<section class="progress-box"><h3>個人化推薦進度</h3>'
    + '<progress aria-label="個人化推薦進度" value="' + completed + '" max="' + target + '"></progress>'
    + '<p><strong>' + completed + ' / ' + target + '</strong></p>'
    + (unlocked ? '<p>已解鎖本機推薦</p>' + rows((suggestions.length ? suggestions : unseen).slice(0, 4))
      : '<p>評價 ' + target + ' 家就能解鎖。</p><button type="button" class="primary" data-next>繼續評價</button>')
    + '</section>';
}

function drawTour() {
  const step = tour[tourStep];
  return '<section class="place tour-card"><p class="eyebrow">' + (tourStep + 1) + ' / ' + tour.length + '</p>'
    + '<h2 id="view-title">' + step.title + '</h2><p>' + step.summary + '</p>'
    + drawMap([]) + '<div class="tour-actions">'
    + '<button type="button" data-tour-step="-1"' + (tourStep === 0 ? ' disabled' : '') + '>上一張</button>'
    + '<button type="button" data-tour-step="1"' + (tourStep === tour.length - 1 ? ' disabled' : '') + '>下一張</button>'
    + '<button type="button" class="primary" data-next>開始試用</button></div></section>';
}

function render() {
  for (const button of document.querySelectorAll('nav [data-page]')) {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (selected) view.innerHTML = detail(restaurants.get(selected));
  else if (page === 'search') {
    view.innerHTML = '<h2 id="view-title">找店</h2><div class="page-tabs"><span class="active">餐廳</span>'
      + '<button type="button" data-page="lists" aria-label="前往我的清單">我的清單</button></div>'
      + '<div class="search-wrap"><span aria-hidden="true">⌕</span><input type="search" id="search" aria-label="搜尋店名或料理" placeholder="搜尋餐廳、料理或街區"></div>'
      + '<p class="search-location"><span aria-hidden="true">⌖</span>示範市<small>北巷 · 中街 · 南埕</small></p>'
      + '<div class="quick-links"><button type="button" data-page="explore">探索地圖</button>'
      + '<button type="button" data-page="explore">口味推薦</button><button type="button" data-page="lists">我的排行</button></div>'
      + '<div id="results"></div><p class="catalog-note">這裡的店家與街區為示範資料。你的用餐紀錄儲存在此瀏覽器。</p>';
    document.querySelector('#search').value = query;
    drawResults();
  } else if (page === 'lists') {
    const been = state.ranked.map(row => restaurants.get(row.id));
    const saved = state.saved.map(id => restaurants.get(id));
    view.innerHTML = '<h2 id="view-title">我的清單</h2><p class="muted">吃過 ' + been.length + ' 家 · 想去 ' + saved.length + ' 家</p><div class="switcher">'
      + '<button type="button" data-list-view="list" aria-pressed="' + !listMap + '">清單</button>'
      + '<button type="button" data-list-view="map" aria-pressed="' + listMap + '">地圖</button></div>'
      + (listMap ? drawMap([...been, ...saved.filter(place => !been.some(row => row.id === place.id))])
        : '<h3>吃過</h3>' + rows(been) + '<h3>想去</h3>' + rows(saved));
  } else if (page === 'activity') {
    const recent = state.ranked.filter(row => !row.hiddenFromActivity)
      .sort((a, b) => (b.ratedAt ?? 0) - (a.ratedAt ?? 0));
    view.innerHTML = '<h2 id="view-title">動態</h2><p class="muted">最近的用餐紀錄</p>'
      + rows(recent.map(row => restaurants.get(row.id)));
  } else if (page === 'profile') {
    const cuisines = [...new Set(state.ranked.map(row => restaurants.get(row.id).cuisine))];
    view.innerHTML = '<h2 id="view-title">個人</h2><section class="place"><div class="profile-head"><div class="avatar" aria-hidden="true">我</div>'
      + '<h3>我的用餐足跡</h3><p class="muted">把每一餐，變成自己的口袋名單。</p></div>'
      + '<div class="profile-stats"><div><strong>' + state.ranked.length + '</strong>吃過</div><div><strong>' + state.saved.length + '</strong>想去</div>'
      + '<div><strong>' + cuisines.length + '</strong>料理種類</div></div>'
      + '<h3>探索過的口味</h3>' + (cuisines.length ? '<div class="chips">' + cuisines.map(cuisine => '<span>' + escape(cuisine) + '</span>').join('') + '</div>'
        : '<p class="muted">從第一家餐廳開始，記下你的口味。</p>')
      + '<div class="place-actions"><button type="button" class="primary" data-page="lists">查看我的清單</button><button type="button" data-page="explore">探索下一家</button></div></section>';
  } else view.innerHTML = page === 'tour' ? drawTour() : exploration();
}

function openRating(id) {
  ratingId = id;
  ratingSession += 1;
  draft = null;
  error.textContent = '';
  form.reset();
  const existing = state.ranked.find(row => row.id === id);
  if (existing) {
    form.elements.mood.value = existing.mood;
    for (const name of ['companions', 'dish', 'date', 'note']) form.elements[name].value = existing[name] ?? '';
    form.elements.tags.value = existing.tags.join('、');
    form.elements.hiddenFromActivity.checked = Boolean(existing.hiddenFromActivity);
  }
  fields.hidden = false;
  comparison.hidden = true;
  extras.open = Boolean(form.elements.mood.value);
  for (const field of extras.querySelectorAll('details')) field.open = false;
  extras.hidden = submit.disabled = !form.elements.mood.value;
  document.querySelector('#dialog-title').textContent = restaurants.get(id).name;
  const place = restaurants.get(id);
  document.querySelector('#dialog-meta').textContent = '＄'.repeat(place.price) + ' · ' + place.cuisine + ' · ' + place.district;
  dialog.showModal();
}

async function thumbnail(file) {
  if (!file.size) return '';
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('請選擇 10 MB 以內的圖片。');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 540 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .72);
  } finally {
    image.close();
  }
}

function nextComparison() {
  const pair = opponent(draft);
  if (pair) {
    fields.hidden = true;
    comparison.hidden = false;
    document.querySelector('#comparison-mood').innerHTML = moods.map(mood =>
      '<span class="mini-choice mood-' + mood + (mood === draft.entry.mood ? ' chosen' : '') + '">'
      + '<span class="mood-circle" aria-hidden="true">' + (mood === draft.entry.mood ? '✓' : '') + '</span>'
      + '<small>' + labels[mood] + (mood === draft.entry.mood ? '（已選）' : '') + '</small></span>').join('');
    comparison.querySelector('.pair').innerHTML = '<button type="button" data-choice="new" aria-label="' + escape(draft.entry.name) + '">'
      + escape(draft.entry.name) + '<small>' + escape(draft.entry.district) + '</small></button><button type="button" data-choice="existing" aria-label="' + escape(pair.name) + '">'
      + escape(pair.name) + '<small>' + escape(pair.district) + '</small></button>';
    document.querySelector('#comparison-info').innerHTML = [draft.entry, pair].map(place =>
      '<p><strong>' + escape(place.name) + '</strong><br>' + escape(place.city) + ' · ' + escape(place.district)
      + ' · ' + escape(place.cuisine) + ' · ' + '＄'.repeat(place.price) + '</p>').join('');
    comparison.querySelector('details').open = false;
    document.querySelector('#compare-title').focus();
    return;
  }
  const ranked = finishRanking(draft);
  const result = ranked.find(entry => entry.id === ratingId);
  const rank = ranked.findIndex(entry => entry.value === result.value) + 1;
  if (!save({ ...state, ranked, saved: state.saved.filter(id => id !== ratingId) },
    result.name + '已加入吃過 · 第 ' + rank + ' 名')) return;
  dialog.close();
  render();
}

document.addEventListener('input', event => {
  if (event.target.id === 'map-query') {
    mapQuery = event.target.value;
    const links = mapQuery.trim() ? mapSearchLinks(mapQuery) : null;
    for (const link of document.querySelectorAll('[data-map-provider]')) {
      if (links) {
        link.href = links[link.dataset.mapProvider];
        link.removeAttribute('aria-disabled');
      } else {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
      }
    }
  } else if (event.target.id === 'search') {
    query = event.target.value;
    drawResults();
  } else if (event.target.name === 'mood') {
    extras.hidden = submit.disabled = false;
    extras.open = true;
  }
});

document.addEventListener('change', event => {
  const key = event.target.dataset.filter;
  if (!Object.hasOwn(filters, key)) return;
  filters[key] = event.target.value;
  render();
  document.querySelector('[data-filter="' + key + '"]').focus();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const values = new FormData(form);
  const id = ratingId;
  const session = ratingSession;
  const photo = values.get('photo');
  error.textContent = '';
  submit.disabled = true;
  try {
    const image = photo?.size ? await thumbnail(photo) : state.ranked.find(row => row.id === id)?.photo;
    if (!dialog.open || ratingSession !== session) return;
    draft = beginRanking(state.ranked, {
      ...restaurants.get(id), mood: values.get('mood'), photo: image,
      companions: values.get('companions').trim(), dish: values.get('dish').trim(),
      tags: [...new Set(values.get('tags').split(/[、,，]/).map(tag => tag.trim()).filter(Boolean))],
      date: values.get('date'), note: values.get('note').trim(), ratedAt: Date.now(),
      hiddenFromActivity: values.has('hiddenFromActivity'),
    });
    nextComparison();
  } catch {
    if (dialog.open && ratingSession === session) {
      error.textContent = '照片無法讀取。請選擇 10 MB 以內的 JPEG、PNG 或 WebP，或略過照片。';
    }
  } finally {
    if (dialog.open && ratingSession === session) submit.disabled = false;
  }
});

function navigate() {
  render();
  const title = document.querySelector('#view-title');
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if (data.close !== undefined) dialog.close();
  else if (data.choice) {
    if (data.choice === 'undo' && !draft.history.length) {
      comparison.hidden = true;
      fields.hidden = false;
      submit.focus();
    } else {
      draft = compare(draft, data.choice);
      nextComparison();
    }
  } else if (data.rate) openRating(data.rate);
  else if (data.detail) {
    selected = data.detail;
    if (page === 'search') save({ ...state, recent: [selected, ...state.recent.filter(id => id !== selected)].slice(0, 4) });
    navigate();
  } else if (data.bookmark) {
    const id = data.bookmark;
    const saved = state.saved.includes(id) ? state.saved.filter(value => value !== id) : [...state.saved, id];
    if (save({ ...state, saved }, saved.includes(id) ? '已存為想去' : '已移除收藏')) render();
  } else if (data.listView) {
    listMap = data.listView === 'map';
    render();
  } else if (data.tourStep) {
    tourStep = Math.max(0, Math.min(tour.length - 1, tourStep + Number(data.tourStep)));
    navigate();
  } else if (data.next !== undefined) {
    query = '';
    page = 'search';
    selected = null;
    navigate();
  } else if (data.page || data.back !== undefined) {
    if (data.page) page = data.page;
    if (page === 'tour') tourStep = 0;
    selected = null;
    navigate();
  }
});

render();
