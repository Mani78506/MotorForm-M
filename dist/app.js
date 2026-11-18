const $ = (id) => document.getElementById(id);
const makes = {
  'Tata': ['Nexon', 'Punch'],
  'Maruti Suzuki': ['Wagon R', 'Brezza', 'Baleno', 'Dzire', 'Ertiga', 'Fronx', 'Swift', 'Victoris', 'Eeco'],
  'Mahindra': ['Scorpio Classic', 'Scorpio-N'],
  'Hyundai': ['Creta', 'Venue'],
  'Kia': ['Seltos'],
};
const finishes = [
  ['Pearl white', '#e8e9e4', 'none'],
  ['Glacier blue', '#8aafd0', 'sepia(.22) hue-rotate(158deg) saturate(1.35)'],
  ['Graphite', '#687280', 'grayscale(.8) brightness(.73)'],
  ['Champagne', '#bc9b70', 'sepia(.39) saturate(1.15)'],
  ['Deep violet', '#817197', 'sepia(.24) hue-rotate(215deg) saturate(1.35)'],
];
const catalog = [
  { id: 'ppf', name: 'Front-end clear PPF', category: 'Protection', parts: 16000, labor: 4500, noCut: true, note: 'Panel coverage and paint condition checked at intake.' },
  { id: 'ceramic', name: 'Ceramic coating', category: 'Protection', parts: 4200, labor: 3800, noCut: true, note: 'Protective finish with paint preparation.' },
  { id: 'wrap', name: 'Full-body vinyl wrap', category: 'Exterior', parts: 18000, labor: 12000, noCut: true, review: true, note: 'Color change requires RTO and RC review.' },
  { id: 'wheels', name: 'Factory-spec alloy wheels', category: 'Exterior', parts: 24000, labor: 1800, noCut: true, review: true, note: 'Offset, load rating and brake clearance require inspection.' },
  { id: 'tint', name: 'Aftermarket window film', category: 'Exterior', blocked: true, noCut: true, note: 'Unavailable in this pilot pending local compliance review.' },
  { id: 'detail', name: 'Cabin deep clean', category: 'Interior', parts: 700, labor: 1800, noCut: true, note: 'Seats, carpets and trim.' },
  { id: 'seats', name: 'Tailored seat covers', category: 'Interior', parts: 6600, labor: 1100, noCut: true, review: true, note: 'Seat airbags and sensors require inspection.' },
  { id: 'dashcam', name: 'Plug-in dashcam', category: 'Tech', parts: 5490, labor: 500, noCut: true, delivery: true, note: '12V socket kit. No factory wiring cuts.' },
  { id: 'headunit', name: 'CarPlay / Android Auto', category: 'Tech', parts: 11490, labor: 2000, review: true, note: 'Harness, fascia and existing controls require inspection.' },
  { id: 'camera', name: 'Reverse camera', category: 'Tech', parts: 3500, labor: 1400, review: true, note: 'Head-unit and harness compatibility require inspection.' },
];
const offers = [
  { id: 'protect', title: 'Protect a new car', description: 'Front-end paint protection film and ceramic coating.', category: 'Protection', ids: ['ppf', 'ceramic'] },
  { id: 'refresh', title: 'Refresh a pre-owned car', description: 'Deep-clean the cabin and refresh the exterior with ceramic coating.', category: 'Interior', ids: ['detail', 'ceramic'] },
  { id: 'modernise', title: 'Modernise an older car', description: 'Add CarPlay or Android Auto and a reverse camera, subject to fitment review.', category: 'Tech', ids: ['headunit', 'camera'] },
];
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
let jobs = read('motorform.jobs.v1', []);
let paused = new Set(read('motorform.paused.v1', []));
const selected = new Set();
let category = 'Protection';
let activeOffer;
let finish = 0;
let photo;
let toastTimer;
const reference = './car.webp';
const price = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function notice(message) {
  $('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 4200);
}
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { notice('Browser storage is unavailable. The change was not saved.'); return false; }
}
function options(el, values) {
  el.replaceChildren(...values.map((value) => new Option(value, value)));
}
function updateVehicle() {
  $('preview-title').textContent = [$('make').value, $('model').value].join(' ');
}
function renderPreview() {
  $('car-image').style.filter = finishes[finish][2];
  $('car-image').src = photo || reference;
  $('car-image').classList.toggle('uploaded', Boolean(photo));
  $('car-image').alt = photo ? 'Your uploaded car photo' : 'Illustrative reference crossover, independent of selected model';
  $('preview-label').textContent = photo ? 'YOUR PHOTO' : 'REFERENCE VEHICLE';
  $('preview-note').textContent = finish ? 'Illustrative color treatment · affects the whole image' : (photo ? 'Original photo · stays in this browser' : 'Generic reference · upload your car for a personal preview');
  $('finish-name').textContent = finishes[finish][0];
  $('reset-photo').hidden = !photo;
  $('finish-list').innerHTML = finishes.map(([name, hex], i) => `<button type="button" data-finish="${i}" style="--swatch:${hex}" class="${finish === i ? 'on' : ''}" aria-label="${name}" aria-pressed="${finish === i}"></button>`).join('');
}
function getQuote(delivery = false) {
  const items = catalog.filter(({ id }) => selected.has(id));
  const subtotal = items.reduce((sum, item) => sum + item.parts + (delivery ? 0 : item.labor), 0);
  const shipping = delivery && items.length ? 199 : 0;
  const tax = Math.round((subtotal + shipping) * 0.18);
  return { items, subtotal, shipping, tax, total: subtotal + shipping + tax };
}
function renderOffers() {
  $('offers').innerHTML = offers.map((offer) => {
    const items = catalog.filter((item) => offer.ids.includes(item.id));
    const subtotal = items.reduce((sum, item) => sum + item.parts + item.labor, 0);
    const unavailable = items.some((item) => item.blocked || paused.has(item.id) || ($('no-cut').checked && !item.noCut));
    return `<button class="offer" data-offer="${offer.id}" aria-pressed="${activeOffer === offer.id}" ${unavailable ? 'disabled' : ''}><strong>${offer.title}</strong><small>${offer.description}</small><span>${unavailable ? 'Unavailable with current filters' : `Est. ${price(Math.round(subtotal * 1.18))} installed <b aria-hidden="true">→</b>`}</span></button>`;
  }).join('');
}
function renderCatalog() {
  const offer = offers.find((item) => item.id === activeOffer);
  if (offer && (selected.size !== offer.ids.length || offer.ids.some((id) => !selected.has(id)))) activeOffer = undefined;
  renderOffers();
  $('tabs').innerHTML = [...new Set(catalog.map((p) => p.category))].map((value) => `<button data-category="${value}" class="${value === category ? 'on' : ''}" aria-pressed="${value === category}">${value}</button>`).join('');
  const items = catalog.filter((item) => item.category === category && (!$('no-cut').checked || item.noCut));
  $('products').innerHTML = items.map((item) => {
    const unavailable = paused.has(item.id) || item.blocked;
    const active = selected.has(item.id);
    return `<button class="product ${active ? 'selected' : ''}" data-product="${item.id}" ${unavailable ? 'disabled' : ''} aria-pressed="${active}"><b>${item.name}</b><small>${item.note}</small><span>${unavailable ? 'Unavailable' : `${active ? '✓' : '+'} ${price(item.parts + item.labor)} · ${item.review ? 'Review required' : 'Sample estimate'}`}</span></button>`;
  }).join('') || '<p class="muted">No upgrades match this filter.</p>';
  const quote = getQuote();
  $('quote-items').innerHTML = quote.items.map((p) => `<div class="row"><div>${p.name}<br><small>Parts ${price(p.parts)} · Labor ${price(p.labor)}</small></div><button type="button" class="control" data-remove="${p.id}" aria-label="Remove ${p.name}">×</button></div>`).join('') || '<p class="muted">Select upgrades to build an estimate.</p>';
  if (quote.items.length) $('quote-items').insertAdjacentHTML('beforeend', `<div class="row"><small>Illustrative tax (18%)</small><small>${price(quote.tax)}</small></div>`);
  $('total').textContent = price(quote.total);
  $('quote-note').textContent = quote.items.some((p) => p.review) ? 'Inspection or compliance review required before confirmation.' : 'Sample pricing. Fitment and workshop availability require confirmation.';
}
function syncBooking() {
  const delivery = $('mode').value === 'delivery';
  $('install-fields').hidden = delivery;
  $('date').required = !delivery;
  const quote = getQuote(delivery);
  $('booking-summary').textContent = `${$('preview-title').textContent} · ${price(quote.total)} estimated${delivery ? ` including ${price(quote.shipping)} delivery` : ''}.`;
}
function showPage(page) {
  for (const id of ['studio', 'requests', 'workshop', 'admin']) $(id).hidden = id !== page;
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('on', button.dataset.page === page);
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderJobs();
  renderAdmin();
}
function renderJobs() {
  $('my-jobs').innerHTML = jobs.map((job) => `<article class="job"><div class="section-top"><strong>${esc(job.vehicle)}</strong><span class="badge">${esc(job.status)}</span></div><p>${job.items.map(esc).join(', ')} · ${price(job.total)}</p><p class="muted">${esc(job.id)} · ${esc(job.destination)}${job.date ? ' · ' + esc(job.date) : ''}</p></article>`).join('') || '<div class="panel"><h2>No requests yet</h2><p class="muted">Choose a package or an upgrade in the Studio to build your estimate.</p><button class="control" data-page="studio">Open Studio</button></div>';
  $('jobs').innerHTML = jobs.map((job) => `<article class="job"><div class="section-top"><strong>${esc(job.id)} · ${esc(job.vehicle)}</strong><span class="badge">${esc(job.status)}</span></div><p>${job.items.map(esc).join(', ')} · ${price(job.total)}</p><p class="muted">${esc(job.destination)}${job.date ? ' · ' + esc(job.date) : ''}</p>${job.status === 'Requested' || job.status === 'Needs review' ? `<button class="action" data-accept="${esc(job.id)}">${job.status === 'Needs review' ? 'Record demo review and accept' : 'Accept request'}</button>` : ''}${job.status === 'Accepted' ? `<form class="action" data-complete="${esc(job.id)}"><label><input type="checkbox" required> ${job.mode === 'delivery' ? 'Packing and item check done' : 'Fitment and handover checklist done'}</label><button class="action">${job.mode === 'delivery' ? 'Mark dispatched' : 'Mark completed'}</button></form>` : ''}</article>`).join('') || '<div class="panel"><h2>No requests yet</h2><p class="muted">Create a demo request in the Studio to see it here.</p></div>';
}
function renderAdmin() {
  const completed = jobs.filter((job) => ['Completed', 'Dispatched'].includes(job.status));
  $('stats').innerHTML = [[jobs.length, 'Requests'], [completed.length, 'Fulfilled'], [price(completed.reduce((total, job) => total + job.total, 0)), 'Fulfilled demo value']].map(([value, name]) => `<div class="panel"><strong>${value}</strong><small>${name}</small></div>`).join('');
  $('controls').innerHTML = catalog.map((item) => `<div class="row"><span>${item.name}</span>${item.blocked ? '<small>Compliance hold</small>' : `<button class="control" data-pause="${item.id}">${paused.has(item.id) ? 'Resume' : 'Pause'}</button>`}</div>`).join('');
}
function moveJob(id, from, status) {
  const updated = jobs.map((job) => job.id === id && from.includes(job.status) ? { ...job, status } : job);
  if (persist('motorform.jobs.v1', updated)) {
    jobs = updated;
    renderJobs();
    renderAdmin();
  }
}
options($('make'), Object.keys(makes));
options($('model'), makes.Tata);
options($('year'), Array.from({ length: 27 }, (_, index) => new Date().getFullYear() - index));
$('make').addEventListener('change', () => {
  options($('model'), makes[$('make').value]);
  $('variant').value = '';
  updateVehicle();
});
for (const id of ['model', 'year']) $(id).addEventListener('change', () => {
  $('variant').value = '';
  updateVehicle();
});
$('upload').addEventListener('change', () => {
  const file = $('upload').files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12_000_000) {
    $('upload').value = '';
    notice('Choose a JPEG, PNG or WebP under 12 MB.');
    return;
  }
  const candidate = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (photo) URL.revokeObjectURL(photo);
    photo = candidate;
    finish = 0;
    renderPreview();
  };
  image.onerror = () => {
    URL.revokeObjectURL(candidate);
    notice('This image could not be opened.');
  };
  image.src = candidate;
});
$('reset-photo').addEventListener('click', () => {
  if (photo) URL.revokeObjectURL(photo);
  photo = undefined;
  finish = 0;
  $('upload').value = '';
  renderPreview();
});
$('no-cut').addEventListener('change', () => {
  if ($('no-cut').checked) catalog.filter((item) => !item.noCut).forEach((item) => selected.delete(item.id));
  renderCatalog();
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  if (data.page) showPage(data.page);
  if (data.offer) {
    const offer = offers.find((item) => item.id === data.offer);
    if (!offer || button.disabled) return;
    activeOffer = offer.id;
    category = offer.category;
    selected.clear();
    offer.ids.forEach((id) => selected.add(id));
    renderCatalog();
    $('offers').querySelector('[data-offer="' + offer.id + '"]').focus();
    notice(offer.title + ' added to your estimate.');
  }
  if (data.finish !== undefined) {
    finish = Number(data.finish);
    renderPreview();
    $('finish-list').querySelector('[data-finish="' + finish + '"]').focus();
  }
  if (data.category) {
    category = data.category;
    renderCatalog();
  }
  if (data.product) {
    if (selected.has(data.product)) selected.delete(data.product);
    else selected.add(data.product);
    renderCatalog();
    $('products').querySelector('[data-product="' + data.product + '"]')?.focus();
  }
  if (data.remove) {
    selected.delete(data.remove);
    renderCatalog();
  }
  if (data.accept) moveJob(data.accept, ['Requested', 'Needs review'], 'Accepted');
  if (data.pause) {
    const updated = new Set(paused);
    if (updated.has(data.pause)) updated.delete(data.pause);
    else updated.add(data.pause);
    if (persist('motorform.paused.v1', [...updated])) {
      paused = updated;
      if (paused.has(data.pause)) selected.delete(data.pause);
      renderCatalog();
      renderAdmin();
    }
  }
});
$('book').addEventListener('click', () => {
  const { items } = getQuote();
  if (!items.length) return notice('Choose an upgrade to continue.');
  if (!$('variant').value.trim()) {
    notice('Enter your exact variant to continue.');
    $('variant').focus();
    return;
  }
  $('mode').value = 'install';
  $('mode').querySelector('[value=delivery]').disabled = !items.every((item) => item.delivery);
  $('date').min = today();
  $('date').value = today();
  syncBooking();
  $('booking').showModal();
});
$('mode').addEventListener('change', syncBooking);
$('close').addEventListener('click', () => $('booking').close());
$('booking-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const mode = $('mode').value;
  const { items, total } = getQuote(mode === 'delivery');
  if (!items.length || (mode === 'delivery' && !items.every((item) => item.delivery))) return;
  const job = {
    id: 'MF-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    vehicle: `${$('year').value} ${$('preview-title').textContent} ${$('variant').value.trim()}`,
    finish: finishes[finish][0],
    items: items.map((item) => item.name),
    total,
    mode,
    destination: mode === 'delivery' ? 'Demo self-install delivery' : $('shop').value,
    date: mode === 'install' ? $('date').value : '',
    status: items.some((item) => item.review) ? 'Needs review' : 'Requested',
  };
  const updated = [job, ...jobs];
  if (!persist('motorform.jobs.v1', updated)) return;
  jobs = updated;
  $('booking').close();
  selected.clear();
  renderCatalog();
  showPage('requests');
  notice('Demo request saved · ' + job.id);
});
$('jobs').addEventListener('submit', (event) => {
  event.preventDefault();
  const job = jobs.find((item) => item.id === event.target.dataset.complete);
  if (job) moveJob(job.id, ['Accepted'], job.mode === 'delivery' ? 'Dispatched' : 'Completed');
});
updateVehicle();
renderPreview();
renderCatalog();
showPage('studio');

const requestedOffer = new URLSearchParams(window.location.search).get('offer');
const starterOffer = offers.find((offer) => offer.id === requestedOffer);
if (starterOffer) $('offers').querySelector('[data-offer="' + starterOffer.id + '"]').click();
