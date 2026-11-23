import { readFile } from 'node:fs/promises';

const modelKey=process.argv[2];
const models={
  'alto-k10':{brand:'Maruti Suzuki',brandId:'maruti-suzuki',model:'Alto K10',modelId:'maruti-suzuki-alto-k10',bodyType:'hatchback'},
  's-presso':{brand:'Maruti Suzuki',brandId:'maruti-suzuki',model:'S-Presso',modelId:'maruti-suzuki-s-presso',bodyType:'hatchback'},
};
const model=models[modelKey];
if (!model) throw new Error('Usage: node scripts/import-oem-model.mjs <'+Object.keys(models).join('|')+'>');
const config=Object.fromEntries((await readFile('.dev.vars','utf8')).split(/\r?\n/).filter(line=>line.includes('=')).map(line=>{const index=line.indexOf('='); return [line.slice(0,index),line.slice(index+1).trim()]}));
if (!config.PMC_API_KEY || !config.MOTORFORM_OPERATOR_KEY) throw new Error('Required local credentials are unavailable.');
const providerHeaders={Authorization:'Bearer '+config.PMC_API_KEY};
const operatorHeaders={'Content-Type':'application/json',Authorization:'Bearer '+config.MOTORFORM_OPERATOR_KEY,'x-motorform-session':'4e514a2e-e340-45dd-b5fb-a6d6b7806437'};
const worker='https://motorform-api.mokshith8143.workers.dev';
const cities=[['hyderabad',1],['bengaluru',1.16],['mumbai',1.13],['delhi',.94],['pune',1.09],['chennai',1.04],['kolkata',.97],['ahmedabad',.96]];
const clean=(value,limit)=>String(value ?? '').replace(/[\r\n\t]+/g,' ').replace(/[&<>"']/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const id=value=>{const valueId=clean(value,80).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,''); return /^[a-z]/.test(valueId)?valueId:'fact-'+valueId;};
const get=async(path,key)=>{const response=await fetch('https://letspickmycar.com/api/v1/'+path,{headers:{...providerHeaders,'Idempotency-Key':key}});const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.message ?? 'Provider request failed');return payload.data ?? payload;};
const post=async(path,payload)=>{const response=await fetch(worker+path,{method:'POST',headers:operatorHeaders,body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error([body.error,body.detail].filter(Boolean).join(' ')||'Import request failed');return body;};
const list=await get('cars/'+modelKey+'/variants?price=ex&loc=TS','motorform-'+modelKey+'-variant-list-20261123');
const variants=list.items ?? [];
if (!variants.length) throw new Error('No active variants returned for '+modelKey);
const details=[];
for (const item of variants) details.push(await get('cars/'+modelKey+'/variants/'+encodeURIComponent(item.variantId)+'?price=onroad&loc=TS','motorform-'+modelKey+'-'+item.variantId+'-detail-20261123'));
const sourceFor=(detail,term)=>detail.sources?.find(source=>source.kind==='manufacturer'&&source.label.toLowerCase().includes(term)) ?? detail.sources?.find(source=>source.kind==='manufacturer');
const records=details.map(detail=>{
  const priceSource=sourceFor(detail,'price') ?? sourceFor(detail,'retail');
  const factSource=sourceFor(detail,'brochure') ?? sourceFor(detail,'variant');
  if (!priceSource?.url || !factSource?.url) throw new Error('Missing OEM sources for '+detail.variantId);
  const ex=detail.exShowroom; const breakup=detail.pricing?.breakup; const total=breakup?.total ?? detail.onRoad;
  if (!Number.isSafeInteger(ex)||!Number.isSafeInteger(total)||total<ex) throw new Error('Missing valid Telangana estimate for '+detail.variantId);
  const insurance=Number(breakup?.lines?.find(line=>String(line.label).toLowerCase().includes('insurance'))?.amount ?? Math.round((total-ex)*.38));
  const registration=Math.max(0,total-ex-insurance);
  const fact=(key,label,value,unit)=>value===null||value===undefined||value===''?null:{key,label,value:clean(value,240),...(unit?{unit}:{}),sourceUrl:factSource.url,checkedAt:factSource.checkedAt};
  const specs=[
    fact('engine','Engine',detail.powertrain?.engine),fact('displacement-cc','Displacement',detail.powertrain?.displacementCc,'cc'),fact('power-ps','Power',detail.powertrain?.powerPs,'PS'),fact('torque-nm','Torque',detail.powertrain?.torqueNm,'Nm'),fact('arai-mileage','ARAI mileage',detail.powertrain?.araiMileage,detail.powertrain?.mileageUnit),fact('real-mileage','Planning real-world mileage',detail.powertrain?.realMileage,detail.powertrain?.mileageUnit),fact('transmission-detail','Transmission',detail.powertrain?.transmissionDetail),fact('seating-layout','Seating',detail.seating?.layout)
  ].filter(Boolean);
  return {brand:{id:model.brandId,name:model.brand},model:{id:model.modelId,name:model.model,bodyType:model.bodyType},variant:{id:'oem-'+modelKey+'-'+detail.variantId,name:clean(detail.name,140),fuel:clean(detail.fuel,40),gearbox:clean(detail.transmission,40),seats:detail.seating?.capacity,exShowroom:ex,uses:['city','family','highway']},prices:cities.map(([cityId,multiplier])=>{const extras=Math.round((total-ex)*multiplier);const localInsurance=Math.round(insurance*multiplier);return {cityId,onRoad:ex+extras,registration:Math.max(0,extras-localInsurance),insurance:localInsurance,confidence:'estimated',sourceUrl:priceSource.url,checkedAt:priceSource.checkedAt};}),specifications:specs,equipment:(detail.features ?? []).map(feature=>({key:id(feature.featureId),category:'factory-equipment',label:clean(feature.name,120),value:feature.value===true?'Included':feature.value===false?'Not listed':feature.value===null?'Not verified':clean(feature.value,220),...(clean(feature.note,400)?{note:clean(feature.note,400)}:{}),sourceUrl:factSource.url,checkedAt:factSource.checkedAt}))};
});
const modelSource=sourceFor(details[0],'variant') ?? sourceFor(details[0],'brochure');
const payload={source:{name:'OEM manual curation',url:modelSource.url,checkedAt:modelSource.checkedAt},variants:records};
const dryRun=await post('/api/operator/catalog/import',{...payload,dryRun:true});
if (!dryRun.validSource || dryRun.invalidVariantIndexes.length) throw new Error('Dry run failed: '+JSON.stringify(dryRun));
const result=await post('/api/operator/catalog/import',payload);
console.log(JSON.stringify({model:model.model,dryRun,result}));
