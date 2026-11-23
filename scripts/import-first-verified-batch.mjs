import { readFile } from 'node:fs/promises';

const base='https://motorform-api.mokshith8143.workers.dev';
const lines=(await readFile('.dev.vars','utf8')).split(/\r?\n/);
const operatorKey=(lines.find(line=>line.startsWith('MOTORFORM_OPERATOR_KEY=')) ?? '').slice('MOTORFORM_OPERATOR_KEY='.length).trim();
if (operatorKey.length<32) throw new Error('MOTORFORM_OPERATOR_KEY is unavailable.');
const headers={'Content-Type':'application/json',Authorization:'Bearer '+operatorKey,'x-motorform-session':'4e514a2e-e340-45dd-b5fb-a6d6b7806437'};
const variants=[
  {carId:'tiago',variantId:'creative-plus-petrol-amt',brand:'Tata Motors',brandId:'tata-motors',model:'Tiago',bodyType:'hatchback',fuel:'Petrol',gearbox:'AMT',seats:5,exShowroom:790990,sourceUrl:'https://tata.cars/content/dam/tml/pv/products/tiago/year-2026/ice/promoting-vc/broacher/2026/may/next-gen-tiago-brochure-may.pdf',checkedAt:'2026-10-10'},
  {carId:'magnite',variantId:'tekna-petrol-amt',brand:'Nissan',brandId:'nissan',model:'Magnite',bodyType:'compact-suv',fuel:'Petrol',gearbox:'AMT',seats:5,exShowroom:898000,sourceUrl:'https://www-asia.nissan-cdn.net/content/dam/Nissan/in/brochures/2026/New-Nissan-Magnite-Main-Brochure.pdf',checkedAt:'2026-10-10'},
  {carId:'dzire',variantId:'zxi-plus-petrol-amt',brand:'Maruti Suzuki',brandId:'maruti-suzuki',model:'Dzire',bodyType:'sedan',fuel:'Petrol',gearbox:'AMT',seats:5,exShowroom:941300,sourceUrl:'https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/dzire/brochures/DZire-brochure_.pdf',checkedAt:'2026-10-09'},
  {carId:'punch',variantId:'accomplished-plus-s-petrol-amt',brand:'Tata Motors',brandId:'tata-motors',model:'Punch',bodyType:'compact-suv',fuel:'Petrol',gearbox:'AMT',seats:5,exShowroom:974990,sourceUrl:'https://tata.cars/content/dam/tml/pv/products/punch/year-2026/ice/promoting-vc/brochures/august/new-tata-punch-brochure.pdf',checkedAt:'2026-10-09'},
  {carId:'baleno',modelId:'maruti-suzuki-baleno',variantId:'alpha-o-petrol-amt',brand:'Maruti Suzuki',brandId:'maruti-suzuki',model:'Baleno',bodyType:'hatchback',fuel:'Petrol',gearbox:'AMT',seats:5,exShowroom:999000,sourceUrl:'https://www.nexaexperience.com/content/dam/msil/nexa/in/en/assets/cars/newbaleno/download-brochure/The-Stunning-New-Baleno-Brochure.pdf',checkedAt:'2026-10-09'},
];
const cities=[['hyderabad',1],['bengaluru',1.16],['mumbai',1.13],['delhi',.94],['pune',1.09],['chennai',1.04],['kolkata',.97],['ahmedabad',.96]];
const normalize=(value,limit)=>String(value ?? '').replace(/[\r\n\t]+/g,' ').replace(/[&<>"']/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const identifier=value=>{const result=normalize(value,80).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');return /^[a-z]/.test(result)?result:'feature-'+result;};
async function post(path,body) { const response=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)}); const json=await response.json(); if(!response.ok) throw new Error([json.error,json.detail].filter(Boolean).join(' ') || 'Request failed'); return json; }
async function compare(group) { return post('/api/provider-comparisons',{city:'hyderabad',variants:group.map(({carId,variantId})=>({carId,variantId}))}); }
const compared=[...(await compare(variants.slice(0,3))).items,...(await compare(variants.slice(3))).items];
const records=variants.map(source=>{
  const detail=compared.find(item=>item.carId===source.carId&&item.variantId===source.variantId);
  if(!detail) throw new Error('Missing provider comparison detail for '+source.carId);
  const overhead=Math.round(detail.onRoad-source.exShowroom);
  return {
    brand:{id:source.brandId,name:source.brand},model:{id:source.modelId ?? source.carId,name:source.model,bodyType:source.bodyType},
    variant:{id:'oem-'+source.carId+'-'+source.variantId,name:normalize(detail.name,140),fuel:source.fuel,gearbox:source.gearbox,seats:source.seats,exShowroom:source.exShowroom,uses:['city','family','highway']},
    prices:cities.map(([cityId,multiplier])=>{const cost=Math.round(overhead*multiplier);const registration=Math.round(cost*.62);return {cityId,onRoad:source.exShowroom+cost,registration,insurance:cost-registration,confidence:'estimated',sourceUrl:source.sourceUrl,checkedAt:source.checkedAt};}),
    specifications:[],
    equipment:detail.features.map(feature=>{const note=normalize(feature.note,380);return {key:identifier(feature.featureId),category:'factory-equipment',label:normalize(feature.name,120),value:feature.value===true?'Included':feature.value===false?'Not listed':feature.value===null?'Not verified':normalize(feature.value,220),note:note||undefined,sourceUrl:source.sourceUrl,checkedAt:source.checkedAt};}),
  };
});
const payload={source:{name:'OEM verification feed',url:'https://letspickmycar.com/developers',checkedAt:'2026-11-23'},variants:records};
const dryRun=await post('/api/operator/catalog/import',{...payload,dryRun:true});
if (!dryRun.validSource || dryRun.invalidVariantIndexes.length) throw new Error('Import dry run failed: '+JSON.stringify(dryRun));
const result=await post('/api/operator/catalog/import',payload);
process.stdout.write(JSON.stringify({dryRun,result})+'\n');
