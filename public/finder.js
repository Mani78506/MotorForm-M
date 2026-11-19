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
let savedOnly = false;

function tell(message) {
  $('finder-status').textContent = message;
}

function updateCards() {
  const query = $('car-search').value.trim().toLowerCase().split(/\s+/);
  const limit = Number($('budget').value);
  $('reset-filters').hidden = !required.size && Object.entries(defaultFilters).every(([id,value]) => $(id).value === value);
  const use = $('car-use').value;
  if (!ready) return;
  const requested = [...required];
  const requiredCost = car => requested.filter(id => car.options.includes(id)).reduce((sum,id) => sum+features[id].cost,0);
  const candidates = cars.filter(car => (!savedOnly || saved.has(car.id)) &&
    query.every(term => `${car.model} ${car.trim} ${car.body}`.toLowerCase().includes(term)) &&
    (savedOnly || ((!use || car.uses.includes(use)) && requested.every(id => car.factory.includes(id) || car.options.includes(id)) &&
    onRoad(car) + requiredCost(car) <= limit && (!recommendations || recommendations.has(car.id)))));
  candidates.sort((a,b) => recommendations && !savedOnly ? recommendations.get(a.id)-recommendations.get(b.id) :
    ($('sort').value === 'factory' ? b.factory.length-a.factory.length : 0) ||
    onRoad(a)+requiredCost(a)-onRoad(b)-requiredCost(b));
  $('browse-all').hidden = !recommendations;
  $('shortlist-toggle').textContent = savedOnly ? 'Browse all variants' : 'Shortlist (' + saved.size + ')';
  $('shortlist-toggle').setAttribute('aria-pressed', savedOnly);
  $('result-count').textContent = candidates.length + (candidates.length === 1 ? ' variant' : ' variants') + (savedOnly ? ' shortlisted' : ' found');
  $('car-results').innerHTML = candidates.map(car => `<article class="variant card">
    <p class="eyebrow">${car.body}</p><div><h3>${car.model}</h3><p>${car.trim} · ${car.fuel} · ${car.gearbox}</p>${car.year ? `<small>${Number(car.year)} · ${escape(car.priceDate)} · ${escape(car.source)}</small>` : ''}</div>
    <div><p class="price">${format(onRoad(car) + requiredCost(car))}</p><small>Estimated on-road${requiredCost(car) ? ' + selected feature' : ''}</small></div>
    <div class="tags">${car.factory.map(key => `<span>${features[key].name} · factory</span>`).join('')}${requested.filter(id=>car.options.includes(id)).map(id=>`<span>${features[id].name} · check fitment</span>`).join('')}</div>
    <div class="card-actions"><button class="subtle" data-compare="${car.id}" aria-pressed="${compared.has(car.id)}">${compared.has(car.id) ? '✓ Compare' : 'Compare'}</button><button class="subtle" data-save="${car.id}" aria-pressed="${saved.has(car.id)}">${saved.has(car.id) ? '✓ Saved' : 'Save'}</button><button class="subtle" data-dealer="${car.id}">Dealer enquiry</button><a class="configure" href="${studioLink(car)}">Preview upgrades ↗</a></div>
  </article>`).join('') || `<p class="empty">${savedOnly && !saved.size ? 'Save a variant to start your shortlist.' : 'No matching variants. Try another search or reset the filters.'}</p>`;
}

function studioLink(car) {
  const make = car.model.startsWith('Maruti Suzuki ') ? 'Maruti Suzuki' : car.model.split(' ')[0];
  const model = car.model.slice(make.length + 1);
  return './studio.html?' + new URLSearchParams({ make, model, variant: car.trim });
}

function upgradeTotal(id) {
  return [...(compared.get(id) ?? [])].reduce((sum,key) => sum + features[key].cost,0);
}

function updateComparison() {
  const columns = [...compared.keys()].map(byId);
  $('compare-panel').hidden = columns.length === 0;
  $('compare-jump').hidden = !columns.length;
  $('compare-jump').textContent = 'View comparison (' + columns.length + ')';
  if (!columns.length) return;
  const row = (title, render) => `<tr><th scope="row">${title}</th>${columns.map(car => `<td>${render(car)}</td>`).join('')}</tr>`;
  $('compare-results').innerHTML = `<table><thead><tr><th scope="col">Hyderabad estimate</th>${columns.map(car => `<th scope="col">${car.model}<br>${car.trim}</th>`).join('')}</tr></thead><tbody>
    ${row('Vehicle price', car => format(car.base))}
    ${row('Registration & insurance estimate', car => format(car.costs))}
    ${Object.entries(features).map(([key,feature]) => row(feature.name, car => car.factory.includes(key) ? 'Factory fitted' : car.options.includes(key) ? `<label><input type="checkbox" data-upgrade="${car.id}" value="${key}" ${compared.get(car.id).has(key) ? 'checked' : ''}> Add ${format(feature.cost)}</label>` : 'Unconfirmed')).join('')}
    ${row('Total with selected upgrades', car => `<strong>${format(onRoad(car)+upgradeTotal(car.id))}</strong>`)}
    ${row('Next step', car => `<button class="subtle" data-dealer="${car.id}">Dealer enquiry</button>`)}</tbody></table>`;
}

function prepareEnquiry(id) {
  selectedDealerCar = byId(id);
  $('enquiry-title').textContent = selectedDealerCar.model+' '+selectedDealerCar.trim;
  $('dealer-status').textContent = '';
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
    savedOnly=false;
    recommendations=new Map(matches.map((match,index)=>[match.id,index]));
    updateCards();
    $('result-count').textContent=matches.length ? matches.length+' best matches' : 'No exact matches';
  } catch(error) { tell(error.message); $('result-count').textContent=error.message; }
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
for (const id of ['budget','car-use','sort']) $(id).addEventListener('change', changeFilters);
$('shortlist-toggle').addEventListener('click', () => { savedOnly = !savedOnly; updateCards(); });
$('clear-compare').addEventListener('click', () => {
  compared.clear();
  updateCards();
  updateComparison();
  $('shortlist-toggle').focus();
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
    (document.querySelector('[data-save="' + save + '"]') ?? $('shortlist-toggle')).focus();
  }
  if (compare) {
    if (compared.has(compare)) compared.delete(compare);
    else {
      if (compared.size >= 3) return tell('Compare up to three variants. Remove one before adding another.');
      compared.set(compare, new Set([...required].filter(id=>byId(compare).options.includes(id))));
    }
    updateCards();
    updateComparison();
    document.querySelector('[data-compare="' + compare + '"]')?.focus();
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
$('my-enquiries').addEventListener('click',async()=>{
  $('history-results').textContent='Loading…';
  $('history-dialog').showModal();
  try {
    const rows=await api('enquiries');
    $('history-results').innerHTML=rows.map(row=>`<p class="history-row"><strong>${escape(row.title)}</strong><br>${escape(row.purpose)} · ${row.status==='received'?'Received by MotorForm':escape(row.status)}</p>`).join('') || '<p>No enquiries from this browser yet.</p>';
  } catch(error) { $('history-results').textContent=error.message; }
});
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
  updateCards();
} catch(error) { $('result-count').textContent=error.message; }
