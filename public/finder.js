let cars = [];
let features = {};
const defaultFilters = { 'car-search':'', budget:'1500000', 'car-use':'', sort:'price' };
const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 });
const format = value => money.format(value);
const byId = id => cars.find(car => car.id === id);
const onRoad = car => car.base + car.costs;
const saved = new Set();
const required = new Set();
let recommendations;
let requestVersion = 0;
let selectedDealerCar;
let ready = false;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options = {}) {
  const response = await fetch('/api/'+path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Please try again.');
  return payload;
}
const send = (path,method,value) => api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const compared = new Map();
const screens=new Set(['find','matches','compare','saved','requests','detail']);
const photos=new Map([
  ['Maruti Suzuki Swift',['swift','https://www.zigwheels.com/news-features/general-news/2024-maruti-suzuki-swift-explore-its-6-colour-options-in-our-image-gallery/52989/']],
  ['Maruti Suzuki Baleno',['baleno','https://auto.hindustantimes.com/auto/cars/maruti-suzuki-baleno-to-tata-altroz-how-long-do-you-need-to-wait-for-these-premium-hatchbacks-41742099857571.html']],
  ['Tata Nexon',['nexon','https://www.carwale.com/news/tata-nexon-facelift-launched-prices-in-india-start-at-rs-809-lakh/']],
  ['Hyundai Creta',['creta','https://www.cardekho.com/india-car-news/you-can-buy-the-2024-hyundai-creta-in-these-7-colours-31935.htm']],
]);
let detailFrom='matches';
const photo = (car, style='') => {
  const asset=photos.get(car.model);
  return asset ? `<img class="car-photo ${style}" src="/cars/${asset[0]}.webp" alt="${escape(car.model)} model reference" width="800" height="450" loading="lazy">` : '';
};
let currentScreen='find';
function showScreen() {
  const [next,detailId]=location.hash.slice(1).split('/');
  currentScreen=screens.has(next)?next:'find';
  for (const section of document.querySelectorAll('[data-screen]')) section.hidden=section.dataset.screen!==currentScreen;
  for (const link of document.querySelectorAll('[data-tab]')) {
    if (link.dataset.tab===currentScreen) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  $('finder-status').textContent='';
  updateCards();
  if (currentScreen==='requests' && ready) loadEnquiries();
  if (currentScreen==='detail' && ready) showDetails(byId(detailId));
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',showScreen);

function tell(message) {
  $('finder-status').textContent = message;
}

function updateCards() {
  const query = $('car-search').value.trim().toLowerCase().split(/\s+/);
  const limit = Number($('budget').value);
  $('reset-filters').hidden = !required.size && Object.entries(defaultFilters).every(([id,value]) => $(id).value === value);
  const use = $('car-use').value;
  $('budget-value').textContent='₹'+new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(limit/100000)+' lakh';
  if (!ready) return;
  const requested = [...required];
  const requiredCost = car => requested.filter(id => car.options.includes(id)).reduce((sum,id) => sum+features[id].cost,0);
  const candidates = cars.filter(car => query.every(term => `${car.model} ${car.trim} ${car.body}`.toLowerCase().includes(term)) &&
    ((!use || car.uses.includes(use)) && requested.every(id => car.factory.includes(id) || car.options.includes(id)) &&
    onRoad(car) + requiredCost(car) <= limit && (!recommendations || recommendations.has(car.id))));
  candidates.sort((a,b) => recommendations ? recommendations.get(a.id)-recommendations.get(b.id) :
    ($('sort').value === 'factory' ? b.factory.length-a.factory.length : 0) ||
    onRoad(a)+requiredCost(a)-onRoad(b)-requiredCost(b));
  $('browse-all').hidden = !recommendations;
  $('result-count').textContent = candidates.length + (recommendations?' best matches':' variants found');
  const renderCard=(car, cost, selected)=>`<article class="variant card vehicle-card">
    <div class="vehicle-media">
      <a href="#detail/${car.id}" data-details aria-label="View ${escape(car.model)} ${escape(car.trim)} details">${photo(car) || '<span class="photo-empty">Photo unavailable</span>'}</a>
      <button class="save-car" type="button" data-save="${car.id}" aria-label="${saved.has(car.id)?'Remove from saved cars':'Save car'}" aria-pressed="${saved.has(car.id)}">${saved.has(car.id)?'♥':'♡'}</button>
    </div>
    <div class="vehicle-content">
      <div class="vehicle-summary"><div><p class="vehicle-type">${escape(car.body)}</p><h2><a href="#detail/${car.id}" data-details>${escape(car.model)}</a></h2><p>${escape(car.trim)} · ${escape(car.fuel)} · ${escape(car.gearbox)}</p></div><div class="price-tile"><small>On-road est.${cost?' + upgrades':''}</small><strong>${format(onRoad(car)+cost)}</strong></div></div>
      <div class="tags">${car.factory.slice(0,4).map(key=>`<span>✓ ${escape(features[key].name)}</span>`).join('')}${selected.filter(id=>car.options.includes(id)).map(id=>`<span>+ ${escape(features[id].name)} · Check fitment</span>`).join('')}</div>
      <div class="vehicle-actions"><a class="subtle" href="#detail/${car.id}" data-details>View details <span aria-hidden="true">→</span></a><button class="subtle" data-compare="${car.id}" aria-pressed="${compared.has(car.id)}">${compared.has(car.id)?'✓ Added':'Add to compare'}</button></div>
    </div>
  </article>`;
  $('car-results').innerHTML=candidates.map(car=>renderCard(car,requiredCost(car),requested)).join('') || '<p class="empty">No exact matches. Try a higher budget or fewer features.</p>';
  $('saved-results').innerHTML=cars.filter(car=>saved.has(car.id)).map(car=>renderCard(car,0,[])).join('') || '<p class="empty">Save a variant on the Matches screen.</p>';
}

function showDetails(car) {
  $('detail-back').href='#'+detailFrom;
  $('detail-back').textContent=detailFrom==='saved'?'← Saved cars':'← Matches';
  $('detail-heading').textContent=car?.model ?? 'Car details';
  if (!car) {
    $('detail-content').innerHTML='<p class="empty">This configuration is no longer in the catalog.</p>';
    return;
  }
  const statuses = Object.entries(features).map(([id,feature])=>{
    const status=car.factory.includes(id)?'<span class="feature-factory">✓ Factory</span>':
      car.options.includes(id)?`<span class="feature-optional">Check fitment · ${format(feature.cost)}</span>`:
      '<span class="feature-unknown">Unconfirmed</span>';
    return `<li><span>${escape(feature.name)}</span>${status}</li>`;
  }).join('');
  $('detail-content').innerHTML=`<article class="card car-detail">
    ${photo(car)?`<figure>${photo(car)}<figcaption>Model reference · trim may vary · <a href="${photos.get(car.model)[1]}" target="_blank" rel="noopener noreferrer">Photo source</a></figcaption></figure>`:''}
    <div class="detail-body"><div class="vehicle-summary"><div><h2>${escape(car.trim)}</h2><p>${escape(car.fuel)} · ${escape(car.gearbox)}${car.year?' · '+Number(car.year):''}</p></div><div class="price-tile"><small>On-road est.</small><strong>${format(onRoad(car))}</strong></div></div>
    <dl class="price-breakdown"><div><dt>Vehicle price</dt><dd>${format(car.base)}</dd></div><div><dt>Registration and insurance est.</dt><dd>${format(car.costs)}</dd></div></dl>
    ${car.source?`<small>${escape(car.source)} · ${escape(car.priceDate)}</small>`:'<small>Sample price and equipment</small>'}
    <h3>Equipment and upgrades</h3><ul class="detail-equipment">${statuses}</ul>
    <div class="vehicle-actions"><button class="subtle" data-save="${car.id}" aria-pressed="${saved.has(car.id)}">${saved.has(car.id)?'♥ Saved':'♡ Save'}</button><button class="subtle" data-compare="${car.id}" aria-pressed="${compared.has(car.id)}">${compared.has(car.id)?'✓ Added':'Add to compare'}</button></div>
    <button class="button app-primary" data-dealer="${car.id}">Request test drive →</button></div></article>`;
}
function refreshDetails() {
  if (currentScreen==='detail') showDetails(byId(location.hash.split('/')[1]));
}
document.addEventListener('click',event=>{
  if (!event.target.closest('[data-details]')) return;
  detailFrom=currentScreen==='saved'?'saved':'matches';
});
function upgradeTotal(id) {
  return [...(compared.get(id) ?? [])].reduce((sum,key) => sum + features[key].cost,0);
}

function updateComparison() {
  const columns = [...compared.keys()].map(byId);
  $('compare-panel').hidden = columns.length === 0;
  $('compare-empty').hidden = columns.length > 0;
  $('compare-jump').hidden = !columns.length;
  $('compare-jump').textContent = 'View comparison (' + columns.length + ')';
  if (!columns.length) return;
  const row = (title, render) => `<tr><th scope="row">${title}</th>${columns.map(car => `<td>${render(car)}</td>`).join('')}</tr>`;
  $('compare-results').innerHTML = `<table><thead><tr><th scope="col">Hyderabad estimate</th>${columns.map(car => `<th scope="col">${photo(car,'compare-photo')}${escape(car.model)}<br>${escape(car.trim)}</th>`).join('')}</tr></thead><tbody>
    ${row('Estimated on-road', car => `<strong>${format(onRoad(car))}</strong><meter aria-label="Estimated on-road price" min="0" max="${Math.max(1,...columns.map(onRoad))}" value="${onRoad(car)}"></meter>`)}
    ${row('Vehicle price', car => format(car.base))}
    ${row('Registration & insurance estimate', car => format(car.costs))}
    ${Object.entries(features).map(([key,feature]) => row(feature.name, car => car.factory.includes(key) ? '<span class="feature-factory">✓ Factory</span>' : car.options.includes(key) ? `<label><input type="checkbox" data-upgrade="${car.id}" value="${key}" ${compared.get(car.id).has(key) ? 'checked' : ''}> Add ${format(feature.cost)}</label>` : '<span class="feature-unknown">Unconfirmed</span>')).join('')}
    ${row('Total with selected upgrades', car => `<strong>${format(onRoad(car)+upgradeTotal(car.id))}</strong>`)}
    ${row('Next step', car => `<button class="subtle" data-dealer="${car.id}">Dealer enquiry</button>`)}</tbody></table>`;
}

function prepareEnquiry(id) {
  selectedDealerCar = byId(id);
  $('enquiry-title').textContent = selectedDealerCar.model+' '+selectedDealerCar.trim;
  $('dealer-status').textContent = '';
  $('enquiry-purpose').value=currentScreen==='detail'?'test-drive':'quote';
  $('dealer-submit').hidden = false;
  $('dealer-dialog').showModal();
}
function changeFilters() {
  requestVersion++;
  recommendations = undefined;
  updateCards();
}
$('use-tiles').addEventListener('click',event=>{
  const button=event.target.closest('[data-use]');
  if (!button) return;
  $('car-use').value=button.dataset.use;
  for (const tile of $('use-tiles').children) tile.setAttribute('aria-pressed',tile===button);
  changeFilters();
});
$('feature-tiles').addEventListener('click',event=>{
  const button=event.target.closest('[data-feature]');
  if (!button) return;
  const id=button.dataset.feature;
  if (required.has(id)) required.delete(id); else required.add(id);
  button.setAttribute('aria-pressed',required.has(id));
  changeFilters();
});
$('browse-all').addEventListener('click',changeFilters);
$('recommend').addEventListener('click',async()=>{
  const version=++requestVersion;
  const params=new URLSearchParams({budget:$('budget').value,use:$('car-use').value,q:$('car-search').value});
  for (const id of required) params.append('feature',id);
  try {
    const matches=await api('matches?'+params);
    if(version!==requestVersion) return;
    recommendations=new Map(matches.map((match,index)=>[match.id,index]));
    updateCards();
    location.hash='matches';
  } catch(error) { tell(error.message); }
});
$('car-search').addEventListener('input', changeFilters);
$('reset-filters').addEventListener('click', () => {
  for (const [id,value] of Object.entries(defaultFilters)) $(id).value = value;
  required.clear();
  for (const tile of $('feature-tiles').children) tile.setAttribute('aria-pressed','false');
  for (const tile of $('use-tiles').children) tile.setAttribute('aria-pressed',!tile.dataset.use);
  changeFilters();
  $('car-search').focus();
});
$('budget').addEventListener('input',changeFilters);
for (const id of ['car-use','sort']) $(id).addEventListener('change', changeFilters);
$('clear-compare').addEventListener('click', () => {
  compared.clear();
  updateCards();
  updateComparison();
  document.querySelector('[data-tab=compare]').focus();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const {save,compare,dealer} = button.dataset;
  if (save) {
    button.disabled=true;
    const next=!saved.has(save);
    try {
      await send('shortlist','PUT',{variant:save,saved:next});
      if (next) saved.add(save); else saved.delete(save);
    } catch(error) { tell(error.message); $('result-count').textContent=error.message; button.disabled=false; return; }
    updateCards();
    refreshDetails();
    (document.querySelector('[data-screen]:not([hidden]) [data-save="' + save + '"]') ?? document.querySelector('[data-tab='+currentScreen+']')).focus();
  }
  if (compare) {
    if (compared.has(compare)) compared.delete(compare);
    else {
      if (compared.size >= 3) return tell('Compare up to three variants. Remove one before adding another.');
      compared.set(compare, new Set([...required].filter(id=>byId(compare).options.includes(id))));
    }
    updateCards();
    updateComparison();
    refreshDetails();
    document.querySelector('[data-screen]:not([hidden]) [data-compare="' + compare + '"]')?.focus();
  }
  if (dealer) prepareEnquiry(dealer);
});
$('compare-results').addEventListener('change', event => {
  const {dataset,value,checked} = event.target;
  const upgrades = compared.get(dataset.upgrade);
  if (!upgrades) return;
  if (checked) upgrades.add(value);
  else upgrades.delete(value);
  updateComparison();
  $('compare-results').querySelector('[data-upgrade="' + dataset.upgrade + '"][value="' + value + '"]')?.focus();
});
$('dealer-submit').addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=event.submitter;
  submit.disabled=true;
  const car=selectedDealerCar;
  try {
    const upgrades=[...(compared.get(car.id) ?? [...required].filter(id=>car.options.includes(id)))];
    const data=await send('enquiries','POST',{variant:car.id,purpose:$('enquiry-purpose').value,email:$('enquiry-email').value,upgrades});
    $('dealer-submit').hidden=true;
    $('enquiry-email').value='';
    $('dealer-status').textContent='Received by MotorForm · '+data.id.slice(0,8).toUpperCase();
  } catch(error) { $('dealer-status').textContent=error.message; }
  finally { submit.disabled=false; }
});
async function loadEnquiries(){
  $('history-results').textContent='Loading…';
  try {
    const rows=await api('enquiries');
    $('history-results').innerHTML=rows.map(row=>`<p class="history-row"><strong>${escape(row.title)}</strong><br>${escape(row.purpose)} · ${row.status==='received'?'Received by MotorForm':escape(row.status)}</p>`).join('') || '<p>No enquiries from this browser yet.</p>';
  } catch(error) { $('history-results').textContent=error.message; }
}
$('my-enquiries').addEventListener('click',loadEnquiries);
let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installPrompt=event;
  $('install-app').hidden=false;
});
$('install-app').addEventListener('click',async()=>{
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt=undefined;
  $('install-app').hidden=true;
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app-sw.js',{scope:'/app/'}).catch(()=>{});

showScreen();
try {
  const data=await api('catalog');
  cars=data.cars;
  features=data.features;
  $('catalog-label').textContent=data.illustrative?'Sample prices and equipment':'Dated catalog estimates';
  const entries=Object.entries(features);
  $('feature-tiles').innerHTML=entries.map(([id,feature])=>`<button class="subtle" type="button" data-feature="${id}" aria-pressed="false">${escape(feature.name)}</button>`).join('');
  const shortlist=await api('shortlist');
  shortlist.filter(byId).forEach(id=>saved.add(id));
  ready=true;
  $('recommend').disabled=false;
  showScreen();
} catch(error) { $('catalog-label').textContent=error.message; tell(error.message); }
