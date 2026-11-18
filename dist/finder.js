const cars = [
  { id:'swift-vxi', model:'Maruti Suzuki Swift', trim:'VXi MT', body:'Hatchback', uses:['city'], base:750000, costs:102000, factory:[], options:['phone','camera'] },
  { id:'swift-zxi', model:'Maruti Suzuki Swift', trim:'ZXi+ AMT', body:'Hatchback', uses:['city'], base:950000, costs:130000, factory:['phone','camera','automatic'], options:[] },
  { id:'baleno-delta', model:'Maruti Suzuki Baleno', trim:'Delta MT', body:'Hatchback', uses:['city','family'], base:780000, costs:107000, factory:['phone'], options:['camera'] },
  { id:'baleno-zeta', model:'Maruti Suzuki Baleno', trim:'Zeta AMT', body:'Hatchback', uses:['city','family'], base:925000, costs:126000, factory:['phone','camera','automatic'], options:[] },
  { id:'nexon-smart', model:'Tata Nexon', trim:'Smart+ MT', body:'Compact SUV', uses:['city','family','highway'], base:900000, costs:125000, factory:[], options:['phone','camera'] },
  { id:'nexon-creative', model:'Tata Nexon', trim:'Creative+ AMT', body:'Compact SUV', uses:['city','family','highway'], base:1160000, costs:180000, factory:['phone','camera','automatic'], options:[] },
  { id:'creta-e', model:'Hyundai Creta', trim:'E MT', body:'SUV', uses:['family','highway'], base:1110000, costs:185000, factory:[], options:['phone','camera'] },
  { id:'creta-sx', model:'Hyundai Creta', trim:'SX Tech IVT', body:'SUV', uses:['family','highway'], base:1700000, costs:266000, factory:['phone','camera','automatic'], options:[] },
];
const features = {
  phone: { name:'CarPlay / Android Auto', cost:16000 },
  camera: { name:'Reverse camera', cost:5800 },
  automatic: { name:'Automatic transmission' },
};
const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 });
const format = value => money.format(value);
const byId = id => cars.find(car => car.id === id);
const onRoad = car => car.base + car.costs;
let stored = [];
try { stored = JSON.parse(localStorage.getItem('motorform.shortlist.v1')); } catch {}
const saved = new Set(Array.isArray(stored) ? stored.filter(byId) : []);
const compared = new Map();
let savedOnly = false;

function tell(message) {
  $('finder-status').textContent = message;
}

function updateCards() {
  const limit = Number($('budget').value);
  const use = $('car-use').value;
  const required = $('must-have').value;
  const requiredCost = car => required && !car.factory.includes(required) && car.options.includes(required) ? features[required].cost : 0;
  const candidates = cars.filter(car => (!savedOnly || saved.has(car.id)) &&
    (savedOnly || ((!use || car.uses.includes(use)) &&
    (!required || car.factory.includes(required) || car.options.includes(required)) &&
    onRoad(car) + requiredCost(car) <= limit)));
  candidates.sort((a,b) => ($('sort').value === 'factory' ? b.factory.length - a.factory.length : 0)
    || onRoad(a) + requiredCost(a) - onRoad(b) - requiredCost(b));
  $('shortlist-toggle').textContent = savedOnly ? 'Browse all variants' : 'Shortlist (' + saved.size + ')';
  $('shortlist-toggle').setAttribute('aria-pressed', savedOnly);
  $('result-count').textContent = candidates.length + (candidates.length === 1 ? ' variant' : ' variants') + (savedOnly ? ' shortlisted' : ' found');
  $('car-results').innerHTML = candidates.map(car => `<article class="variant card">
    <p class="eyebrow">${car.body}</p><div><h3>${car.model}</h3><p>${car.trim}</p></div>
    <div><p class="price">${format(onRoad(car) + requiredCost(car))}</p><small>Estimated on-road${requiredCost(car) ? ' + selected feature' : ''}</small></div>
    <div class="tags">${car.factory.map(key => `<span>${features[key].name} · factory</span>`).join('')}${requiredCost(car) ? `<span>${features[required].name} · upgrade</span>` : ''}</div>
    <div class="card-actions"><button class="subtle" data-compare="${car.id}" aria-pressed="${compared.has(car.id)}">${compared.has(car.id) ? '✓ Compare' : 'Compare'}</button><button class="subtle" data-save="${car.id}" aria-pressed="${saved.has(car.id)}">${saved.has(car.id) ? '✓ Saved' : 'Save'}</button><button class="subtle" data-dealer="${car.id}">Dealer enquiry</button></div>
  </article>`).join('') || `<p class="empty">${savedOnly ? 'Save a variant to start your shortlist.' : 'Try a higher budget or change a filter.'}</p>`;
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
    ${Object.entries(features).map(([key,feature]) => row(feature.name, car => car.factory.includes(key) ? 'Factory fitted' : car.options.includes(key) ? `<label><input type="checkbox" data-upgrade="${car.id}" value="${key}" ${compared.get(car.id).has(key) ? 'checked' : ''}> Add ${format(feature.cost)}</label>` : 'Unavailable')).join('')}
    ${row('Total with selected upgrades', car => `<strong>${format(onRoad(car)+upgradeTotal(car.id))}</strong>`)}
    ${row('Next step', car => `<button class="subtle" data-dealer="${car.id}">Dealer enquiry</button>`)}</tbody></table>`;
}

function prepareEnquiry(id) {
  const car = byId(id);
  const required = $('must-have').value;
  const defaults = car.options.includes(required) ? [required] : [];
  const upgrades = [...(compared.get(id) ?? defaults)].map(key => features[key].name);
  $('enquiry').value = `Hello, I’m interested in the ${car.model} ${car.trim} in Hyderabad. Please send me an itemised on-road quote and let me know the availability, delivery timeline, and test-drive options.${upgrades.length ? '\n\nPlease confirm fitment, installation pricing and warranty terms for: ' + upgrades.join(', ') + '.' : ''}\n\nThank you.`;
  $('dealer-status').textContent = '';
  $('dealer-dialog').showModal();
}

for (const id of ['budget','car-use','must-have','sort']) $(id).addEventListener('change', updateCards);
$('shortlist-toggle').addEventListener('click', () => { savedOnly = !savedOnly; updateCards(); });
$('clear-compare').addEventListener('click', () => {
  compared.clear();
  updateCards();
  updateComparison();
  $('shortlist-toggle').focus();
});
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const {save,compare,dealer} = button.dataset;
  if (save) {
    if (saved.has(save)) saved.delete(save);
    else saved.add(save);
    try { localStorage.setItem('motorform.shortlist.v1', JSON.stringify([...saved])); }
    catch { tell('The shortlist is available for the current session only.'); }
    updateCards();
    (document.querySelector('[data-save="' + save + '"]') ?? $('shortlist-toggle')).focus();
  }
  if (compare) {
    if (compared.has(compare)) compared.delete(compare);
    else {
      if (compared.size >= 3) return tell('Compare up to three variants. Remove one before adding another.');
      const needed = $('must-have').value;
      compared.set(compare, new Set(byId(compare).options.includes(needed) ? [needed] : []));
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
$('copy-enquiry').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('enquiry').value);
    $('dealer-status').textContent = 'Copied. Paste it into your message to the dealer.';
  } catch {
    $('enquiry').select();
    $('dealer-status').textContent = 'The enquiry is selected. Copy it using your device controls.';
  }
});
$('download-enquiry').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('enquiry').value], {type:'text/plain'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'motorform-dealer-enquiry.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
updateCards();
