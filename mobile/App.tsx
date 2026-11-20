import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ImageSourcePropType, Pressable, ScrollView, StatusBar, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer, NavigatorScreenParams, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Catalog, Car, Enquiry, Match, Recommendation, DecisionConfidence, PreownedAssessment, request, getRecommendations, getSavedProviderVehicles, saveProviderVehicle, removeProviderVehicle, getDecisionConfidence, recordComparison, assessPreowned, createOwnerRequest, loadCatalog, offlineMatches, onRoad, rupees } from './api';

const navy='#102643', ink='#10213A', blue='#1C5CA8', muted='#4B5D75', border='#D9E3EF';
type Icon=React.ComponentProps<typeof Ionicons>['name'];
type Tabs={ Find:undefined; Matches:undefined; Compare:undefined; Saved:undefined };
type OwnerPackageId='protect'|'refresh'|'modernise';
type Stack={ Landing:undefined; Home:NavigatorScreenParams<Tabs> | undefined; Details:{id:string}; Enquire:{id:string; upgrades:string[]}; ProviderEnquire:{item:Recommendation;city:string}; UsedCheck:undefined; OwnerStudio:undefined; OwnerPackage:{id:OwnerPackageId}; Requests:undefined };
const Tab=createBottomTabNavigator<Tabs>();
const Root=createNativeStackNavigator<Stack>();
type Go=NativeStackScreenProps<Stack,'Home'>['navigation'];
const icons:Record<keyof Tabs,Icon>={Find:'search-outline',Matches:'car-sport-outline',Compare:'swap-horizontal-outline',Saved:'heart-outline'};
const images:Record<string,ImageSourcePropType>={
  'Maruti Suzuki Swift':require('./assets/swift.webp'),
  'Maruti Suzuki Baleno':require('./assets/baleno.webp'),
  'Tata Nexon':require('./assets/nexon.webp'),
  'Hyundai Creta':require('./assets/creta.webp'),
};
function providerImage(name:string):ImageSourcePropType|undefined {
  const value=name.toLowerCase();
  if (value.includes('swift')) return images['Maruti Suzuki Swift'];
  if (value.includes('baleno')) return images['Maruti Suzuki Baleno'];
  if (value.includes('nexon')) return images['Tata Nexon'];
  if (value.includes('creta')) return images['Hyundai Creta'];
  if (value.includes('dzire')) return require('./assets/provider-sedan-reference.png');
  if (value.includes('magnite')||value.includes('punch')||value.includes('aeris')) return require('./assets/provider-suv-reference.png');
  return undefined;
}

function Frame({children}:{children:React.ReactNode}) {
  return <ScrollView style={s.frame} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
function Button({label,icon,onPress,secondary=false,disabled=false}:{label:string;icon?:Icon;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&s.disabled]}>
    {icon&&<Ionicons name={icon} color={secondary?blue:'#fff'} size={19}/>}<Text style={[s.buttonText,secondary&&s.secondaryText]}>{label}</Text>
  </Pressable>;
}
function Chip({label,selected,onPress,icon}:{label:string;selected:boolean;onPress:()=>void;icon?:Icon}) {
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[s.chip,selected&&s.chipOn]}>
    {icon&&<Ionicons name={icon} size={18} color={blue}/>}<Text style={s.chipText}>{label}</Text>
  </Pressable>;
}
function Photo({car,variant='full'}:{car:Car;variant?:'full'|'card'|'compare'}) {
  const image=images[car.model];
  const imageStyle=[s.photo,variant==='card'&&s.cardPhoto,variant==='compare'&&s.thumbnail];
  return image ? <Image accessibilityLabel={car.model+' model reference'} source={image} resizeMode="cover" style={imageStyle}/>
    : <View style={[s.noPhoto,variant==='card'&&s.cardPhoto,variant==='compare'&&s.thumbnail]}><Ionicons name="car-outline" size={29} color={muted}/><Text style={s.small}>Photo unavailable</Text></View>;
}
const ownerPackages:{id:OwnerPackageId;title:string;subtitle:string;image:ImageSourcePropType;items:{name:string;price:number;check?:string;noCuts:boolean}[]}[]=[
  {id:'protect',title:'Protect a new car',subtitle:'Protect the paintwork you just chose.',image:require('./assets/owner-protect.png'),items:[{name:'Front-end paint protection film',price:42000,check:'Panel coverage confirmed after inspection',noCuts:true},{name:'Ceramic coating',price:18000,noCuts:true},{name:'Interior fabric protection',price:6500,noCuts:true}]},
  {id:'refresh',title:'Refresh a pre-owned car',subtitle:'Reset the cabin and exterior after purchase.',image:require('./assets/owner-refresh.png'),items:[{name:'Cabin deep clean',price:7500,noCuts:true},{name:'Exterior decontamination and polish',price:9500,check:'Paint condition inspection required',noCuts:true},{name:'Headlamp restoration',price:3500,check:'Lens condition inspection required',noCuts:true}]},
  {id:'modernise',title:'Modernise an older car',subtitle:'Practical tech upgrades, transparently scoped.',image:require('./assets/owner-modernise.png'),items:[{name:'CarPlay / Android Auto display',price:18000,check:'Vehicle-specific fitment confirmation required',noCuts:true},{name:'Reverse camera',price:7500,check:'Routing and camera position inspection required',noCuts:false},{name:'Parking sensor kit',price:5500,check:'Bumper and wiring inspection required',noCuts:false}]},
];
function Landing({onStart,onOwner}:{onStart:()=>void;onOwner:()=>void}) {
  const textIn=useRef(new Animated.Value(0)).current;
  const carIn=useRef(new Animated.Value(0)).current;
  useEffect(()=>{Animated.parallel([
    Animated.timing(textIn,{toValue:1,duration:520,useNativeDriver:true}),
    Animated.timing(carIn,{toValue:1,duration:760,useNativeDriver:true}),
  ]).start();},[carIn,textIn]);
  const textStyle={opacity:textIn,transform:[{translateY:textIn.interpolate({inputRange:[0,1],outputRange:[20,0]})}]};
  const carStyle={opacity:carIn,transform:[{translateY:carIn.interpolate({inputRange:[0,1],outputRange:[45,0]})},{scale:carIn.interpolate({inputRange:[0,1],outputRange:[1.05,1]})}]};
  return <View style={s.launch}><Animated.Image source={require('./assets/launch-hero.png')} resizeMode="cover" style={[s.launchImage,carStyle]}/><View style={s.launchShade}/><SafeAreaView style={s.launchSafe} edges={['top','bottom']}>
    <Animated.View style={[s.launchContent,textStyle]}><View style={s.launchBrand}><View style={s.launchMark}><Text style={s.launchMarkText}>M</Text></View><Text style={s.launchName}>MOTORFORM.</Text><View style={s.launchCity}><View style={s.liveDot}/><Text style={s.launchCityText}>HYDERABAD</Text></View></View>
      <View style={s.launchMessage}><Text style={s.launchKicker}>INDIA · ESTIMATED PRICING</Text><Text style={s.launchTitle}>Find the right car.{"\n"}<Text style={s.launchAccent}>Make it yours.</Text></Text><Text style={s.launchSubtitle}>Compare variants, check city-based on-road estimates, and explore upgrades before you buy.</Text></View>
      <View style={s.launchAction}><Pressable accessibilityRole="button" accessibilityLabel="Find my car" onPress={onStart} style={s.launchButton}><Text style={s.launchButtonText}>Find my car</Text><Ionicons name="arrow-forward" size={21} color={navy}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="I already own a car" onPress={onOwner} style={s.launchOwnerButton}><Ionicons name="sparkles-outline" size={18} color="#DCEBFF"/><Text style={s.launchOwnerText}>I already own a car</Text></Pressable><Text style={s.launchFootnote}>No account needed · Takes about a minute</Text></View>
    </Animated.View>
  </SafeAreaView></View>;
}
function Empty({icon,title,detail}:{icon:Icon;title:string;detail:string}) {
  return <View style={s.empty}><Ionicons name={icon} color={blue} size={34}/><Text style={s.heading}>{title}</Text><Text style={[s.small,s.center]}>{detail}</Text></View>;
}
function OwnerStudio({onOpen}:{onOpen:(id:OwnerPackageId)=>void}) {
  return <Frame><Text style={s.title}>Owner Studio</Text><Text style={s.small}>Choose a service plan for the car you already own. Hyderabad prices are planning estimates until inspection.</Text>{ownerPackages.map(pack=><Pressable key={pack.id} accessibilityRole="button" onPress={()=>onOpen(pack.id)} style={s.ownerCard}><Image source={pack.image} resizeMode="cover" style={s.ownerCardImage}/><View style={s.ownerCardShade}/><View style={s.ownerCardCopy}><Text style={s.ownerCardTitle}>{pack.title}</Text><Text style={s.ownerCardText}>{pack.subtitle}</Text><View style={s.ownerCardCta}><Text style={s.ownerCardCtaText}>Build my plan</Text><Ionicons name="arrow-forward" color="#FFF" size={16}/></View></View></Pressable>)}</Frame>;
}
function OwnerPackage({id,onDone}:{id:OwnerPackageId;onDone:()=>void}) {
  const pack=ownerPackages.find(value=>value.id===id)!; const [make,setMake]=useState('Maruti Suzuki');const [model,setModel]=useState('');const [year,setYear]=useState('2020');const [variant,setVariant]=useState('');const [email,setEmail]=useState('');const [noCuts,setNoCuts]=useState(false);const [selected,setSelected]=useState<string[]>(pack.items.map(item=>item.name));const [pending,setPending]=useState(false);const [receipt,setReceipt]=useState('');const [error,setError]=useState('');
  const visible=pack.items.filter(item=>!noCuts||item.noCuts); const items=pack.items.filter(item=>selected.includes(item.name)&&(!noCuts||item.noCuts)); const total=items.reduce((sum,item)=>sum+item.price,0);
  function toggle(name:string){setSelected(current=>current.includes(name)?current.filter(item=>item!==name):[...current,name]);}
  async function submit(){if(!model.trim()||!variant.trim()||!Number.isSafeInteger(Number(year))||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||!items.length)return setError('Complete vehicle details, choose at least one item and enter a valid email.');setPending(true);setError('');try{const value=await createOwnerRequest({packageId:id,make:make.trim(),model:model.trim(),year:Number(year),variant:variant.trim(),items:items.map(item=>item.name),noWiringCuts:noCuts,email:email.trim(),city:'hyderabad'});setReceipt(value.id.slice(0,8).toUpperCase());}catch(e){setError(e instanceof Error?e.message:'Could not save your request.');}finally{setPending(false);}}
  if(receipt)return <Frame><Empty icon="checkmark-circle-outline" title="Received by MotorForm" detail={'Reference '+receipt+' · Hyderabad estimate saved for review.'}/><Button label="Back to Owner Studio" onPress={onDone}/></Frame>;
  return <Frame><View style={s.ownerPackageHero}><Image source={pack.image} resizeMode="cover" style={s.ownerPackageImage}/><View style={s.ownerCardShade}/><View style={s.ownerPackageCopy}><Text style={s.ownerCardTitle}>{pack.title}</Text><Text style={s.ownerCardText}>{pack.subtitle}</Text></View></View><Text style={s.heading}>Your car</Text><TextInput value={make} onChangeText={setMake} placeholder="Make" placeholderTextColor={muted} style={s.input}/><TextInput value={model} onChangeText={setModel} placeholder="Model" placeholderTextColor={muted} style={s.input}/><View style={s.split}><TextInput value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="Year" placeholderTextColor={muted} style={[s.input,s.half]}/><TextInput value={variant} onChangeText={setVariant} placeholder="Variant" placeholderTextColor={muted} style={[s.input,s.half]}/></View><View style={s.ownerFilter}><View style={s.flex}><Text style={s.heading}>No factory wiring cuts</Text><Text style={s.small}>Show only reversible installation options.</Text></View><Chip label={noCuts?'On':'Off'} selected={noCuts} onPress={()=>setNoCuts(value=>!value)}/></View><Text style={s.heading}>Included services</Text>{visible.map(item=><Pressable key={item.name} accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(item.name)}} onPress={()=>toggle(item.name)} style={[s.serviceRow,selected.includes(item.name)&&s.serviceRowOn]}><Ionicons name={selected.includes(item.name)?'checkmark-circle':'ellipse-outline'} size={22} color={selected.includes(item.name)?blue:muted}/><View style={s.flex}><Text style={s.bold}>{item.name}</Text>{item.check?<Text style={s.watchOut}>Inspection / fitment: {item.check}</Text>:<Text style={s.small}>No inspection flag in this estimate</Text>}</View><Text style={s.bold}>{rupees(item.price)}</Text></Pressable>)}<View style={s.ownerEstimate}><Text style={s.ownerEstimateKicker}>HYDERABAD PILOT · ESTIMATED TOTAL</Text><Text style={s.ownerEstimatePrice}>{rupees(total)}</Text><Text style={s.ownerEstimateText}>Final scope and price require vehicle inspection and fitment confirmation.</Text></View><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email for quote" placeholderTextColor={muted} style={s.input}/>{error?<Text style={s.error}>{error}</Text>:null}<Button label={pending?'Saving request…':'Request a quote'} icon="mail-outline" disabled={pending} onPress={()=>void submit()}/></Frame>;
}
function FindScreen({catalog,busy,error,onFind,onCity}:{catalog:Catalog;busy:boolean;error:string;onFind:(budget:number,use:string,features:string[],query:string,decision:{priority:'value'|'comfort'|'features'|'resale';household:'solo'|'couple'|'family';transmission:'any'|'automatic'|'manual'})=>void;onCity:(id:string)=>void}) {
  const [budget,setBudget]=useState(1500000);
  const [use,setUse]=useState('');
  const [query,setQuery]=useState('');
  const [features,setFeatures]=useState<string[]>([]);
  const [priority,setPriority]=useState<'value'|'comfort'|'features'|'resale'>('value');
  const [household,setHousehold]=useState<'solo'|'couple'|'family'>('family');
  const [transmission,setTransmission]=useState<'any'|'automatic'|'manual'>('any');
  return <Frame>
    <View style={s.locationPanel}><View><Text style={s.tiny}>YOUR LOCATION</Text><Text style={s.heading}>{catalog.city.name}, {catalog.city.state}</Text><Text style={s.small}>Internal on-road estimates · not dealer quotes</Text></View><Ionicons name="location" color={blue} size={22}/></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cityList}>{catalog.cities.map(city=><Chip key={city.id} label={city.name} selected={city.id===catalog.city.id} onPress={()=>onCity(city.id)}/>)}</ScrollView>
    <View style={s.findHero}><Image source={require('./assets/motorform-hero.png')} resizeMode="cover" style={s.findHeroImage}/><View style={s.findHeroShade}/><View style={s.findHeroCopy}><Text style={s.findHeroEyebrow}>MOTORFORM · INDIA</Text><Text style={s.findHeroTitle}>Find a car that fits.</Text><Text style={s.findHeroText}>A clear shortlist in minutes, not weeks of browser tabs.</Text></View></View>
    <View style={s.panel}><View style={s.split}><Text style={s.heading}>On-road budget</Text><Text style={s.price}>{rupees(budget)}</Text></View>
      <Slider accessibilityLabel="On-road budget" accessibilityValue={{text:rupees(budget)}} minimumValue={500000} maximumValue={3000000} step={50000} value={budget} onValueChange={setBudget} minimumTrackTintColor={blue} maximumTrackTintColor={border} thumbTintColor={navy} style={s.slider}/>
      <View style={s.row}>{[1000000,1500000,2000000,2500000].map(amount=><Chip key={amount} label={'₹'+amount/100000+'L'} selected={budget===amount} onPress={()=>setBudget(amount)}/>)}</View>
    </View>
    <Text style={s.heading}>How do you drive?</Text>
    <View style={s.row}>{([{id:'city',label:'City',icon:'business-outline'},{id:'family',label:'Family',icon:'people-outline'},{id:'highway',label:'Highway',icon:'navigate-outline'}] as const).map(item=><Chip key={item.id} label={item.label} icon={item.icon} selected={use===item.id} onPress={()=>setUse(use===item.id?'':item.id)}/>)}</View>
    <Text style={s.heading}>Must-have features</Text>
    <View style={s.row}>{Object.entries(catalog.features).map(([id,feature])=><Chip key={id} label={feature.name} selected={features.includes(id)} onPress={()=>setFeatures(current=>current.includes(id)?current.filter(key=>key!==id):[...current,id])}/>)}</View>
    <Text style={s.heading}>What matters most?</Text>
    <View style={s.row}>{([{id:'value',label:'Best value'},{id:'comfort',label:'Easy driving'},{id:'features',label:'More features'},{id:'resale',label:'Resale'}] as const).map(item=><Chip key={item.id} label={item.label} selected={priority===item.id} onPress={()=>setPriority(item.id)}/>)}</View>
    <Text style={s.heading}>Who is it for?</Text>
    <View style={s.row}>{([{id:'solo',label:'Just me'},{id:'couple',label:'Two adults'},{id:'family',label:'Family'}] as const).map(item=><Chip key={item.id} label={item.label} selected={household===item.id} onPress={()=>setHousehold(item.id)}/>)}</View>
    <Text style={s.heading}>Transmission</Text>
    <View style={s.row}>{([{id:'any',label:'Any'},{id:'automatic',label:'Automatic'},{id:'manual',label:'Manual'}] as const).map(item=><Chip key={item.id} label={item.label} selected={transmission===item.id} onPress={()=>setTransmission(item.id)}/>)}</View>
    <TextInput accessibilityLabel="Search by model or trim" placeholder="Search by model or trim (optional)" placeholderTextColor={muted} autoCorrect={false} maxLength={70} value={query} onChangeText={setQuery} style={s.input}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button label={busy?'Finding matches…':'Build my shortlist'} icon="arrow-forward" disabled={busy} onPress={()=>onFind(budget,use,features,query,{priority,household,transmission})}/>
    {catalog.illustrative&&<Text style={s.small}>Sourced prices where shown. Equipment and upgrade fitment are illustrative.</Text>}
  </Frame>;
}
function UsedCarCheck() {
  const [asking,setAsking]=useState('650000'); const [repairs,setRepairs]=useState('0'); const [result,setResult]=useState<PreownedAssessment>(); const [error,setError]=useState(''); const [pending,setPending]=useState(false);
  const [checks,setChecks]=useState<Record<string,'verified'|'reported'|'missing'|'failed'>>({rc:'missing',insurance:'missing',service_history:'missing',odometer:'missing',inspection:'missing',accident:'missing',flood:'missing'});
  async function assess(){const price=Number(asking);const repair=Number(repairs);if(!Number.isSafeInteger(price)||price<100000||!Number.isSafeInteger(repair)||repair<0)return setError('Enter whole-number asking price and immediate repair estimate.');setPending(true);setError('');try{setResult(await assessPreowned({askingPrice:price,transferCost:18000,inspectionCost:3500,immediateRepairCost:repair,checks}));}catch(e){setError(e instanceof Error?e.message:'Could not assess this vehicle.');}finally{setPending(false);}}
  return <Frame><Text style={s.title}>Is this used car worth inspecting?</Text><Text style={s.small}>Assess one specific vehicle. MotorForm includes known purchase-day costs and shows what evidence is still missing.</Text><TextInput accessibilityLabel="Asking price" value={asking} onChangeText={setAsking} keyboardType="number-pad" placeholder="Asking price" style={s.input}/><TextInput accessibilityLabel="Immediate repairs" value={repairs} onChangeText={setRepairs} keyboardType="number-pad" placeholder="Tyres, service or repairs now" style={s.input}/><Text style={s.heading}>Evidence status</Text>{Object.entries(checks).map(([key,status])=><View style={s.checkLine} key={key}><Text style={s.flex}>{key.replace('_',' ')}</Text><Chip label={status==='verified'?'Verified':'Missing'} selected={status==='verified'} onPress={()=>setChecks(current=>({...current,[key]:current[key]==='verified'?'missing':'verified'}))}/></View>)}{error?<Text style={s.error}>{error}</Text>:null}<Button label={pending?'Assessing…':'Assess this vehicle'} disabled={pending} onPress={()=>void assess()}/>{result?<View style={s.confidencePanel}><Text style={s.heading}>{result.riskLevel} evidence risk · {result.worthInspecting?'Worth inspecting':'Do not commit yet'}</Text><Text style={s.price}>All-in plan: {rupees(result.allInCost.total)}</Text><Text style={s.small}>{result.decision}</Text><Text style={s.heading}>Before you pay anything</Text>{result.nextChecks.map(item=><Text style={s.small} key={item}>• {item}</Text>)}<Text style={s.tiny}>{result.allInCost.disclaimer}</Text></View>:null}</Frame>;
}
function CarCard({car,total,features,matched,saved,selected,onSave,onCompare,onOpen}:{car:Car;total:number;features:Catalog['features'];matched:Match|undefined;saved:boolean;selected:boolean;onSave:()=>void;onCompare:()=>void;onOpen:()=>void}) {
  return <View style={s.card}>
    <View style={s.cardTop}>
      <Pressable accessibilityRole="button" accessibilityLabel={'View '+car.model+' details'} onPress={onOpen}><Photo car={car} variant="card"/></Pressable>
      <View style={s.cardSummary}><Text style={s.heading}>{car.model}</Text><Text style={s.small}>{car.trim} · {car.gearbox}</Text><Text style={s.tiny}>Model reference · trim/colour may vary</Text><View style={s.priceTile}><Text style={s.tiny}>On-road est.</Text><Text style={s.price}>{rupees(total)}</Text></View></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={saved?'Remove saved car':'Save car'} accessibilityState={{selected:saved}} style={s.heart} onPress={onSave}><Ionicons name={saved?'heart':'heart-outline'} size={23} color={saved?'#A61B52':navy}/></Pressable>
    <View style={s.cardBody}>
      <View style={s.row}>{car.factory.slice(0,3).map(key=><Text style={s.tag} key={key}>✓ {features[key].name}</Text>)}{matched?.upgrades.map(key=><Text style={s.tag} key={key}>{features[key].name} · Check fitment</Text>)}</View>
      <View style={s.row}><Button secondary label="View details" onPress={onOpen}/><Button secondary label={selected?'✓ Added':'Add to compare'} onPress={onCompare}/></View>
    </View>
  </View>;
}
function RecommendationCard({item,attribution,saved,selected,onSave,onCompare,onEnquire}:{item:Recommendation;attribution:string;saved:boolean;selected:boolean;onSave:()=>void;onCompare:()=>void;onEnquire:()=>void}) {
  const reference=providerImage(item.name);
  return <View style={s.card}>{reference?<View style={s.providerHero}><Image accessibilityLabel={item.name+' model reference'} source={reference} resizeMode="cover" style={s.providerHeroImage}/><View style={s.providerHeroLabel}><Text style={s.providerHeroLabelText}>MODEL REFERENCE · TRIM MAY VARY</Text></View></View>:<View style={s.providerThumb}><Ionicons name="car-sport" size={34} color={blue}/><Text style={s.tiny}>Image pending</Text></View>}<View style={s.cardBody}><View style={s.split}><View style={s.flex}><Text style={s.heading}>{item.name}</Text><Text style={s.small}>{item.fuel} · {item.gearbox}{item.seats?' · '+item.seats+' seats':''}</Text></View>{item.fitScore?<View style={s.scoreBadge}><Text style={s.scoreBadgeText}>{item.fitScore}%</Text><Text style={s.scoreBadgeLabel}>FIT</Text></View>:null}</View><View style={s.priceTile}><Text style={s.tiny}>Estimated on-road</Text><Text style={s.price}>{rupees(item.onRoad)}</Text></View>{item.ownershipEstimate?<View style={s.costPanel}><Text style={s.costTitle}>Year-one ownership plan · {rupees(item.ownershipEstimate.total)}</Text><Text style={s.small}>Fuel {rupees(item.ownershipEstimate.fuel)} · Service {rupees(item.ownershipEstimate.service)} · Insurance {rupees(item.ownershipEstimate.insurance)}</Text><Text style={item.budgetRisk==='Comfortable'?s.small:s.watchOut}>{item.budgetRisk}: {item.riskNote}</Text></View>:null}{item.whyItFits?.slice(0,2).map(reason=><Text key={reason} style={s.small}>✓ {reason}</Text>)}{item.watchOuts?.map(reason=><Text key={reason} style={s.watchOut}>! {reason}</Text>)}<View style={s.row}>{item.highlights.slice(0,3).map(value=><Text style={s.tag} key={value}>{value}</Text>)}</View><Text style={s.small}>{item.pricesVerified?'Prices checked '+item.pricesVerified+'. ':''}{attribution} · confirm final dealer quote.</Text><View style={s.row}><Button secondary label={saved?'Saved':'Save car'} onPress={onSave}/><Button secondary label={selected?'✓ Added':'Compare'} onPress={onCompare}/><Button secondary label="Request quote" onPress={onEnquire}/>{item.detailUrl?<Text accessibilityRole="link" onPress={()=>{void Linking.openURL(item.detailUrl!).catch(()=>{});}} style={s.sourceLink}>Sources ↗</Text>:null}</View></View></View>;
}
function ProviderEnquire({item,city,onDone}:{item:Recommendation;city:string;onDone:()=>void}) {
  const [purpose,setPurpose]=useState<'quote'|'test-drive'>('test-drive');const [email,setEmail]=useState('');const [pending,setPending]=useState(false);const [message,setMessage]=useState('');
  async function submit(){if(!/^\S+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return setMessage('Enter a valid email address.');setPending(true);setMessage('');try{await request('enquiries','POST',{variant:item.id,provider:'lets-pick-my-car',providerVariantId:item.providerVariantId,title:item.name,city,purpose,email:email.trim(),upgrades:[]});onDone();}catch(error){setMessage(error instanceof Error?error.message:'Could not send the enquiry.');}finally{setPending(false);}}
  return <Frame><Text style={s.title}>{item.name}</Text><Text style={s.small}>{rupees(item.onRoad)} estimated on-road · {city}</Text><View style={s.row}><Chip label="Test drive" selected={purpose==='test-drive'} onPress={()=>setPurpose('test-drive')}/><Chip label="On-road quote" selected={purpose==='quote'} onPress={()=>setPurpose('quote')}/></View><TextInput accessibilityLabel="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Email address" placeholderTextColor={muted} style={s.input}/><Text style={s.small}>MotorForm records this request and a dealer confirms availability and final pricing.</Text>{message?<Text style={s.error}>{message}</Text>:null}<Button disabled={pending} label={pending?'Sending…':'Send request'} onPress={()=>void submit()}/></Frame>;
}
function Details({car,catalog,onEnquire,selected,saved,onSave,onCompare}:{car:Car;catalog:Catalog;selected:boolean;saved:boolean;onSave:()=>void;onCompare:()=>void;onEnquire:()=>void}) {
  return <Frame><View style={s.card}><Photo car={car}/><View style={s.cardBody}>
    <Text style={s.small}>Model reference · trim and colour may vary</Text><Text style={s.title}>{car.model}</Text><Text style={s.small}>{car.trim} · {car.fuel} · {car.gearbox}{car.year?' · '+car.year:''}</Text>
    <View style={s.split}><Text>Vehicle price</Text><Text style={s.bold}>{rupees(car.base)}</Text></View>
    <View style={s.split}><Text>Registration and insurance est.</Text><Text style={s.bold}>{rupees(car.costs)}</Text></View>
    <View style={s.split}><Text style={s.heading}>On-road estimate</Text><Text style={s.price}>{rupees(onRoad(car))}</Text></View>
    <Text style={s.small}>{car.source ? car.source+' · Checked '+(car.priceDate ?? '') : 'Sample price and equipment'}</Text>
    {car.priceUrl?.startsWith('https://www.cardekho.com/')&&<Text accessibilityRole="link" style={s.sourceLink} onPress={()=>{void Linking.openURL(car.priceUrl!).catch(()=>{});}}>View price source ↗</Text>}
  </View></View>
  <Text style={s.heading}>Equipment and upgrades</Text>
  <View style={s.panel}>{Object.entries(catalog.features).map(([key,feature])=><View key={key} style={s.featureLine}><Text style={s.flex}>{feature.name}</Text><Text style={car.factory.includes(key)?s.factory:s.tag}>{car.factory.includes(key)?'✓ Factory':car.options.includes(key)?'Check fitment · '+rupees(feature.cost ?? 0):'Unconfirmed'}</Text></View>)}</View>
  <View style={s.row}><Button secondary label={saved?'♥ Saved':'Save car'} onPress={onSave}/><Button secondary label={selected?'✓ Added':'Add to compare'} onPress={onCompare}/></View>
  <Button label="Request test drive or quote" icon="calendar-outline" onPress={onEnquire}/>
  </Frame>;
}
function Requests({revision}:{revision:number}) {
  const [items,setItems]=useState<Enquiry[]>([]);
  const [state,setState]=useState('loading');
  useFocusEffect(useCallback(()=>{
    let active=true;
    setState('loading');
    request<Enquiry[]>('enquiries').then(data=>{if(active){setItems(data);setState('ready');}}).catch(()=>{if(active)setState('error');});
    return ()=>{active=false;};
  },[revision]));
  return <Frame>{state==='loading'?<ActivityIndicator color={blue}/>:state==='error'?<Empty icon="cloud-offline-outline" title="Requests unavailable" detail="Return to this screen to try again."/>:items.length?items.map(item=><View style={s.panel} key={item.id}><Text style={s.heading}>{item.title}</Text><Text style={s.small}>{item.purpose==='quote'?'On-road quote':'Test drive'}</Text><Text style={s.tag}>{item.status==='received'?'Received by MotorForm':item.status}</Text></View>):<Empty icon="mail-outline" title="No enquiries yet" detail="Find a car and request a quote or test drive."/>}</Frame>;
}
function Enquire({id,upgrades,car,city,onDone}:{id:string;upgrades:string[];car:Car;city:string;onDone:()=>void}) {
  const [purpose,setPurpose]=useState<'quote'|'test-drive'>('test-drive');
  const [email,setEmail]=useState('');
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState('');
  const [receipt,setReceipt]=useState('');
  async function submit() {
    if (pending) return;
    if (!/^\S+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMessage('Enter a valid email address.');
    setPending(true);
    setMessage('');
    try {
      const value=await request<{id:string}>('enquiries','POST',{variant:id,purpose,email:email.trim(),upgrades,city});
      setReceipt(value.id.slice(0,8).toUpperCase());
    } catch (error) { setMessage(error instanceof Error?error.message:'Could not send the enquiry.'); }
    finally { setPending(false); }
  }
  if (receipt) return <Frame><Empty icon="checkmark-circle-outline" title="Received by MotorForm" detail={'Reference '+receipt}/><Button label="View my enquiries" onPress={onDone}/></Frame>;
  return <Frame><Text style={s.title}>{car.model}</Text><Text style={s.small}>{car.trim}</Text><View style={s.row}>
    <Chip label="Test drive" selected={purpose==='test-drive'} onPress={()=>setPurpose('test-drive')}/><Chip label="On-road quote" selected={purpose==='quote'} onPress={()=>setPurpose('quote')}/>
    </View><TextInput accessibilityLabel="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Email address" placeholderTextColor={muted} maxLength={254} style={s.input}/>
    <Text style={s.small}>MotorForm may contact you about this request. A dealer confirms the booking separately.</Text>
    {!!message&&<Text accessibilityRole="alert" style={s.error}>{message}</Text>}
    <Button disabled={pending} label={pending?'Sending…':'Send to MotorForm'} onPress={submit}/>
  </Frame>;
}

function Compare({cars,catalog,upgrades,toggle,onEnquire}:{cars:Car[];catalog:Catalog;upgrades:Record<string,string[]>;toggle:(id:string,key:string)=>void;onEnquire:(car:Car)=>void}) {
  if (!cars.length) return <Frame><Empty icon="swap-horizontal-outline" title="Your comparison is empty" detail="Add up to three variants from Matches or Saved."/></Frame>;
  const totals=cars.map(car=>onRoad(car)+(upgrades[car.id]??[]).reduce((sum,key)=>sum+(catalog.features[key].cost??0),0));
  const cellWidth=cars.length===3?132:148;
  const featureRows=Object.entries(catalog.features);
  return <Frame>
    <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled><View style={s.compareTable}>
      <View style={s.compareRow}>{cars.map((car,index)=><View style={{width:cellWidth,gap:6}} key={car.id}><Photo car={car} variant="compare"/><Text style={s.bold}>{car.model}</Text><Text style={s.small}>{car.trim}</Text><Text style={s.tiny}>Model ref. · trim may vary</Text><Text style={s.price}>{rupees(totals[index])}</Text><Text style={s.tiny}>On-road est. with upgrades</Text><View style={s.bar}><View style={[s.barFill,{width:`${Math.round(totals[index]/Math.max(1,...totals)*100)}%`}]}/></View></View>)}</View>
      {featureRows.map(([key,feature])=><View style={s.compareFeature} key={key}><Text style={s.bold}>{feature.name}</Text><View style={s.compareRow}>{cars.map(car=><View key={car.id} style={{width:cellWidth,alignItems:'flex-start'}}>{car.factory.includes(key)?<Text style={s.factory}>✓ Factory</Text>:car.options.includes(key)?<Chip label={(upgrades[car.id]??[]).includes(key)?'✓ '+rupees(feature.cost??0):'+ '+rupees(feature.cost??0)} selected={(upgrades[car.id]??[]).includes(key)} onPress={()=>toggle(car.id,key)}/>:<Text style={s.tag}>Unconfirmed</Text>}</View>)}</View></View>)}
      <View style={s.compareRow}>{cars.map(car=><View style={{width:cellWidth}} key={car.id}><Button label="Enquire" secondary onPress={()=>onEnquire(car)}/></View>)}</View>
    </View></ScrollView>
    <Text style={s.small}>Optional upgrades need fitment confirmation.</Text>
  </Frame>;
}
function ProviderCompare({items,onRemove,onEnquire}:{items:Recommendation[];onRemove:(item:Recommendation)=>void;onEnquire:(item:Recommendation)=>void}) {
  if (!items.length) return <Frame><Empty icon="swap-horizontal-outline" title="Your comparison is empty" detail="Tap Compare on up to three recommended variants, then make a dealer-ready choice."/></Frame>;
  const lowest=Math.min(...items.map(item=>item.onRoad));
  return <Frame><View style={s.confidencePanel}><Text style={s.heading}>Choose with confidence</Text><Text style={s.small}>Compare the complete ownership picture first. Then request a quote or test drive for one exact variant.</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled><View style={s.compareTable}><View style={s.compareRow}>{items.map(item=><View key={item.id} style={{width:218,gap:8}}><View style={s.providerCompareImage}>{providerImage(item.name)?<Image source={providerImage(item.name)} resizeMode="cover" style={s.providerCompareImage}/>:<Ionicons name="car-sport-outline" size={32} color={blue}/>}</View><Text style={s.bold}>{item.name}</Text><Text style={s.small}>{item.fuel} · {item.gearbox}</Text><Text style={s.price}>{rupees(item.onRoad)}</Text><Text style={s.tiny}>{item.onRoad===lowest?'LOWEST UPFRONT COST':'+'+rupees(item.onRoad-lowest)+' vs lowest'}</Text><View style={s.compareFeature}><Text style={s.tiny}>FIT FOR YOUR NEEDS</Text><Text style={s.heading}>{item.fitScore ?? '—'}{item.fitScore?'%':''}</Text><Text style={s.small}>{item.decisionLabel ?? 'Compare before deciding'}</Text></View><View style={s.compareFeature}><Text style={s.tiny}>YEAR-ONE OWNERSHIP</Text><Text style={s.bold}>{item.ownershipEstimate?rupees(item.ownershipEstimate.total):'Estimate unavailable'}</Text><Text style={s.small}>{item.ownershipEstimate?.disclaimer ?? 'Confirm with the dealer'}</Text></View><View style={s.compareFeature}><Text style={s.tiny}>WHY THIS VARIANT</Text>{(item.whyItFits ?? []).slice(0,2).map(reason=><Text style={s.small} key={reason}>✓ {reason}</Text>)}{(item.watchOuts ?? []).slice(0,2).map(reason=><Text style={s.watchOut} key={reason}>! {reason}</Text>)}</View><Button label="Choose & contact dealer" icon="calendar-outline" onPress={()=>onEnquire(item)}/><Button label="Remove" secondary onPress={()=>onRemove(item)}/></View>)}</View></View></ScrollView><Text style={s.small}>On-road and ownership figures are estimates. The selected dealer confirms current availability, exact specification, and final quote.</Text></Frame>;
}

function MotorForm() {
  const [catalog,setCatalog]=useState<Catalog>();
  const [city,setCity]=useState('hyderabad');
  const [saved,setSaved]=useState<string[]>([]);
  const [compare,setCompare]=useState<string[]>([]);
  const [upgrades,setUpgrades]=useState<Record<string,string[]>>({});
  const [matches,setMatches]=useState<Match[]>();
  const [providerMatches,setProviderMatches]=useState<Recommendation[]>([]);
  const [providerCompare,setProviderCompare]=useState<Recommendation[]>([]);
  const [providerSaved,setProviderSaved]=useState<Recommendation[]>([]);
  const [recommendationAttribution,setRecommendationAttribution]=useState('');
  const [confidence,setConfidence]=useState<DecisionConfidence>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const [saving,setSaving]=useState<string>();
  const load=useCallback(async()=>{
    setError('');
    try {
      const {catalog:data,offline}=await loadCatalog(city);
      setCatalog(data);
      if (offline) setNotice('You are browsing the built-in catalog. Connect to the internet to save cars or send enquiries.');
      try { const [shortlist,providerSavedCars,confidenceData]=await Promise.all([request<string[]>('shortlist'),getSavedProviderVehicles(),getDecisionConfidence(city)]);setSaved(shortlist);setProviderSaved(providerSavedCars);setConfidence(confidenceData); }
      catch { setNotice('Saved cars are unavailable. Reopen the app to retry.'); }
    } catch { setError('Could not load the catalog. Check your connection and try again.'); }
  },[city]);
  useEffect(()=>{void load();},[load]);
  if (!catalog) return <Frame>{error?<><Empty icon="cloud-offline-outline" title="Catalog unavailable" detail={error}/><Button label="Try again" onPress={load}/></>:<ActivityIndicator color={blue}/>}</Frame>;
  const cars=catalog.cars;
  async function find(budget:number,use:string,features:string[],query:string,decision:{priority:'value'|'comfort'|'features'|'resale';household:'solo'|'couple'|'family';transmission:'any'|'automatic'|'manual'},after:()=>void) {
    if (busy) return;
    setBusy(true);setError('');
    const params=[['city',city],['budget',String(budget)],['use',use],['q',query],...features.map(key=>['feature',key])].map(([key,value])=>key+'='+encodeURIComponent(value)).join('&');
    try {
      const suggested=await getRecommendations({budget,use,features,city,...decision});
      setProviderMatches(suggested.items);setRecommendationAttribution(suggested.attribution.name);setMatches(undefined);after();
    }
    catch {
      try { setMatches(await request<Match[]>('matches?'+params));setProviderMatches([]); after(); }
      catch { setMatches(offlineMatches(catalog!,budget,use,features,query));setProviderMatches([]);setNotice('Showing matches from the built-in catalog. Connect to the internet for live pricing.');after(); }
    }
    finally { setBusy(false); }
  }
  async function save(id:string) {
    if (saving) return;
    setSaving(id);setNotice('');
    const next=!saved.includes(id);
    try {
      await request('shortlist','PUT',{variant:id,saved:next});
      setSaved(current=>next?[...current,id]:current.filter(key=>key!==id));
    } catch { setNotice('Could not update saved cars. Try again.'); }
    finally { setSaving(undefined); }
  }
  async function saveProvider(item:Recommendation) {
    const exists=providerSaved.some(value=>value.id===item.id);
    try {
      if (exists) { await removeProviderVehicle(item.id);setProviderSaved(current=>current.filter(value=>value.id!==item.id)); }
      else { await saveProviderVehicle(item);setProviderSaved(current=>[item,...current]); }
    } catch { setNotice('Could not update saved cars. Try again.'); }
  }
  function selectProvider(item:Recommendation) {
    setNotice('');
    if (providerCompare.some(value=>value.id===item.id)) { setProviderCompare(current=>current.filter(value=>value.id!==item.id)); return; }
    if (providerCompare.length>=3) { setNotice('Compare up to three variants at a time. Remove one before adding another.'); return; }
    setProviderCompare(current=>[...current,item]);
    void recordComparison(item.id).catch(()=>{});
  }
  function select(car:Car) {
    setNotice('');
    if (compare.includes(car.id)) { setCompare(compare.filter(id=>id!==car.id)); return; }
    if (compare.length>=3) { setNotice('Remove a variant before adding another.'); return; }
    setCompare([...compare,car.id]);
    void recordComparison(car.id).catch(()=>{});
    setUpgrades(current=>({...current,[car.id]:matches?.find(item=>item.id===car.id)?.upgrades??[]}));
  }
  function toggle(id:string,key:string) {
    setUpgrades(current=>{
      const list=current[id]??[];
      return {...current,[id]:list.includes(key)?list.filter(value=>value!==key):[...list,key]};
    });
  }
  function openEnquiry(go:Go,car:Car) {
    go.navigate('Enquire',{id:car.id,upgrades:upgrades[car.id]??matches?.find(match=>match.id===car.id)?.upgrades??[]});
  }
  function openProviderEnquiry(go:Go,item:Recommendation) { go.navigate('ProviderEnquire',{item,city:catalog!.city.id}); }
  function list(go:Go,items:Car[],withEstimates:boolean) {
    return items.map(car=>{
      const match=withEstimates?matches?.find(item=>item.id===car.id):undefined;
      return <CarCard key={car.id} car={car} total={match?.total??onRoad(car)} matched={match} features={catalog!.features} saved={saved.includes(car.id)} selected={compare.includes(car.id)} onSave={()=>void save(car.id)} onCompare={()=>select(car)} onOpen={()=>go.navigate('Details',{id:car.id})}/>;
    });
  }
  function renderTabs(go:Go) {
    return <Tab.Navigator screenOptions={({route})=>({
      headerTitleStyle:{color:ink,fontWeight:'800',fontSize:20},headerShadowVisible:false,tabBarActiveTintColor:blue,tabBarInactiveTintColor:muted,
      headerRight:()=> <Pressable accessibilityRole="button" accessibilityLabel="My enquiries" hitSlop={12} onPress={()=>go.navigate('Requests')} style={s.headerAction}><Ionicons name="mail-outline" size={22} color={navy}/></Pressable>,
      tabBarLabelStyle:{fontSize:11,fontWeight:'700'},tabBarStyle:{height:64,paddingTop:5,paddingBottom:7},tabBarIconStyle:{marginTop:1},tabBarIcon:({color,size})=><Ionicons name={icons[route.name]} color={color} size={size}/>,
    })}>
      <Tab.Screen name="Find" options={{title:'Find my car',tabBarLabel:'Find'}}>{({navigation}:BottomTabScreenProps<Tabs,'Find'>)=><FindScreen catalog={catalog!} busy={busy} error={error} onCity={setCity} onFind={(budget,use,features,query,decision)=>void find(budget,use,features,query,decision,()=>navigation.navigate('Matches'))}/>}</Tab.Screen>
      <Tab.Screen name="Matches" options={{title:'Matches for you',tabBarLabel:'Matches'}}>{({navigation})=><Frame>
        {!!notice&&<Text accessibilityRole="alert" style={s.error}>{notice}</Text>}
        {providerMatches.length ? <><View style={s.confidencePanel}><Text style={s.heading}>Decision confidence</Text><Text style={s.small}>{confidence?.dealerAvailability.label ?? 'Checking local dealer availability…'}</Text><Text style={s.small}>{confidence?.reviews.label ?? 'Verified review coverage is not connected.'}</Text></View><View style={s.liveSource}><View style={s.liveDot}/><Text style={s.liveSourceText}>LIVE INDIA PROVIDER · {providerMatches.length} VARIANTS · {catalog!.city.name.toUpperCase()}</Text></View>{providerMatches.map(item=><RecommendationCard key={item.id} item={item} attribution={recommendationAttribution} saved={providerSaved.some(value=>value.id===item.id)} selected={providerCompare.some(value=>value.id===item.id)} onSave={()=>void saveProvider(item)} onCompare={()=>selectProvider(item)} onEnquire={()=>openProviderEnquiry(go,item)}/>)}</> : matches?.length ? <Text style={s.small}>{matches.length} best {matches.length===1?'match':'matches'} · {catalog!.city.name} · Internal estimates</Text> : <Empty icon="car-outline" title={matches?'No exact matches':'Find your top matches'} detail={matches?'Try a higher budget or fewer required features.':'Set your budget and priorities to start.'}/>}
        {list(go,(matches??[]).flatMap(match=>cars.filter(car=>car.id===match.id)),true)}
        {(compare.length>0||providerCompare.length>0)&&<Button label={'Compare ('+(providerCompare.length||compare.length)+')'} icon="swap-horizontal-outline" onPress={()=>navigation.navigate('Compare')}/>}
        <Button label="Check a used car" secondary onPress={()=>navigation.navigate('UsedCheck')}/>
        <Button label="Edit preferences" secondary onPress={()=>navigation.navigate('Find')}/>
      </Frame>}</Tab.Screen>
      <Tab.Screen name="Compare" options={{title:'Compare variants',tabBarLabel:'Compare'}}>{() => providerCompare.length?<ProviderCompare items={providerCompare} onRemove={selectProvider} onEnquire={item=>openProviderEnquiry(go,item)}/>:<Compare cars={compare.flatMap(id=>cars.filter(car=>car.id===id))} catalog={catalog!} upgrades={upgrades} toggle={toggle} onEnquire={car=>openEnquiry(go,car)}/>}</Tab.Screen>
      <Tab.Screen name="Saved" options={{title:'Saved cars',tabBarLabel:'Saved'}}>{()=> <Frame>
        {!!notice&&<Text accessibilityRole="alert" style={s.error}>{notice}</Text>}
        {saved.length?list(go,cars.filter(car=>saved.includes(car.id)),false):null}{providerSaved.map(item=><RecommendationCard key={item.id} item={item} attribution="Let's Pick My Car" saved selected={providerCompare.some(value=>value.id===item.id)} onSave={()=>void saveProvider(item)} onCompare={()=>selectProvider(item)} onEnquire={()=>openProviderEnquiry(go,item)}/>)}{!saved.length&&!providerSaved.length?<Empty icon="heart-outline" title="No saved cars" detail="Tap Save on a recommendation to keep it here."/>:null}
      </Frame>}</Tab.Screen>
    </Tab.Navigator>;
  }
  return <Root.Navigator initialRouteName="Landing" screenOptions={{headerTitleStyle:{color:ink,fontWeight:'800'},headerTintColor:navy}}>
    <Root.Screen name="Landing" options={{headerShown:false}}>{({navigation})=><Landing onStart={()=>navigation.replace('Home')} onOwner={()=>navigation.navigate('OwnerStudio')}/>}</Root.Screen>
    <Root.Screen name="Home" options={{headerShown:false}}>{props=>renderTabs(props.navigation)}</Root.Screen>
    <Root.Screen name="Details" options={{title:'Car details'}}>{({route,navigation})=>{
      const car=cars.find(item=>item.id===route.params.id);
      return car?<Details car={car} catalog={catalog} selected={compare.includes(car.id)} saved={saved.includes(car.id)} onSave={()=>void save(car.id)} onCompare={()=>select(car)} onEnquire={()=>openEnquiry(navigation,car)}/>:<Frame><Empty icon="car-outline" title="Variant unavailable" detail="Return to Matches to choose another car."/></Frame>;
    }}</Root.Screen>
    <Root.Screen name="Enquire" options={{title:'Dealer enquiry'}}>{({route,navigation})=>{
      const car=cars.find(item=>item.id===route.params.id);
      return car?<Enquire {...route.params} car={car} city={catalog.city.id} onDone={()=>{setRevision(value=>value+1);navigation.popTo('Home',{screen:'Requests'});}}/>:<Frame><Empty icon="car-outline" title="Variant unavailable" detail="Return to Matches to choose another car."/></Frame>;
    }}</Root.Screen>
    <Root.Screen name="ProviderEnquire" options={{title:'Dealer enquiry'}}>{({route,navigation})=><ProviderEnquire {...route.params} onDone={()=>{setRevision(value=>value+1);navigation.popTo('Home',{screen:'Requests'});}}/>}</Root.Screen>
    <Root.Screen name="UsedCheck" options={{title:'Used-car decision'}} component={UsedCarCheck}/>
    <Root.Screen name="OwnerStudio" options={{title:'Owner Studio'}}>{({navigation})=><OwnerStudio onOpen={id=>navigation.navigate('OwnerPackage',{id})}/>}</Root.Screen>
    <Root.Screen name="OwnerPackage" options={{title:'Owner Studio'}}>{({route,navigation})=><OwnerPackage id={route.params.id} onDone={()=>navigation.popTo('OwnerStudio')}/>}</Root.Screen>
    <Root.Screen name="Requests" options={{title:'My enquiries'}}>{()=><Requests revision={revision}/>}</Root.Screen>
  </Root.Navigator>;
}
export default function App() {
  return <SafeAreaProvider><StatusBar barStyle="dark-content"/><NavigationContainer><MotorForm/></NavigationContainer></SafeAreaProvider>;
}
const s=StyleSheet.create({
  frame:{flex:1,backgroundColor:'#F5F7FB'},content:{gap:14,padding:16,paddingBottom:34},
  launch:{flex:1,backgroundColor:'#020D1E'},launchImage:{...StyleSheet.absoluteFill,width:undefined,height:undefined},launchShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(1,10,25,.12)'},launchSafe:{flex:1},launchContent:{flex:1,paddingHorizontal:24,paddingTop:14,paddingBottom:12,justifyContent:'space-between'},launchBrand:{flexDirection:'row',alignItems:'center',gap:11},launchMark:{width:42,height:42,borderRadius:12,backgroundColor:'#B9D9FF',alignItems:'center',justifyContent:'center'},launchMarkText:{fontSize:23,fontWeight:'900',fontStyle:'italic',color:navy},launchName:{fontSize:19,letterSpacing:3,fontWeight:'900',color:'#FFF',flex:1},launchCity:{flexDirection:'row',alignItems:'center',gap:5},liveDot:{width:6,height:6,borderRadius:5,backgroundColor:'#8FC5FF'},launchCityText:{fontSize:10,fontWeight:'800',letterSpacing:.8,color:'#B9D9FF'},launchMessage:{marginTop:34,gap:14},launchKicker:{fontSize:12,letterSpacing:2.2,fontWeight:'900',color:'#A7CFFF'},launchTitle:{fontSize:44,lineHeight:48,letterSpacing:-1.5,fontWeight:'900',color:'#FFF'},launchAccent:{color:'#A9D0FF'},launchSubtitle:{fontSize:17,lineHeight:25,color:'#E5EDF8',maxWidth:325},launchAction:{gap:12},launchButton:{height:58,borderRadius:17,backgroundColor:'#B9D9FF',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},launchButtonText:{fontSize:17,fontWeight:'900',color:navy},launchOwnerButton:{height:48,borderWidth:1,borderColor:'#7EAAD9',borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},launchOwnerText:{fontSize:15,fontWeight:'800',color:'#DCEBFF'},launchFootnote:{textAlign:'center',fontSize:12,fontWeight:'700',color:'#DBE8F7'},
  landing:{flex:1,backgroundColor:'#F5F7FB'},landingContent:{flexGrow:1,padding:20,paddingTop:18,gap:18},brandRow:{flexDirection:'row',alignItems:'center',gap:8},brandMark:{width:34,height:34,borderRadius:10,backgroundColor:navy,alignItems:'center',justifyContent:'center'},brand:{color:ink,fontSize:20,fontWeight:'900',flex:1},location:{color:muted,fontSize:12,fontWeight:'700'},
  landingHero:{height:320,borderRadius:24,overflow:'hidden',backgroundColor:navy,justifyContent:'flex-end'},landingImage:{...StyleSheet.absoluteFill,width:undefined,height:undefined},heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(4,19,42,.27)'},landingCopy:{padding:22,gap:7},overline:{color:'#BCE0FF',fontWeight:'800',fontSize:11,letterSpacing:1.2},landingTitle:{color:'#FFF',fontSize:32,lineHeight:38,fontWeight:'900',maxWidth:260},landingText:{color:'#E3EDF8',fontSize:14,lineHeight:20,maxWidth:260},valueRow:{flexDirection:'row',gap:10},value:{flex:1,backgroundColor:'#FFF',borderColor:border,borderWidth:1,borderRadius:14,padding:13,gap:5},valueTitle:{fontSize:13,color:ink,fontWeight:'800'},valueText:{fontSize:12,color:muted,lineHeight:16},disclaimer:{textAlign:'center',color:muted,fontSize:12,fontWeight:'600'},
  findHero:{height:176,borderRadius:18,overflow:'hidden',backgroundColor:navy,justifyContent:'flex-end'},findHeroImage:{...StyleSheet.absoluteFill,width:undefined,height:undefined},findHeroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(5,20,42,.35)'},findHeroCopy:{padding:16,gap:3},findHeroEyebrow:{color:'#BCE0FF',fontSize:10,fontWeight:'800',letterSpacing:1},findHeroTitle:{color:'#FFF',fontSize:23,fontWeight:'900'},findHeroText:{color:'#EDF5FF',fontSize:13},
  photo:{width:'100%',height:210,backgroundColor:'#E4EDF8'},cardPhoto:{width:116,height:84,borderRadius:10},thumbnail:{height:95,borderRadius:8},
  noPhoto:{height:210,backgroundColor:'#E4EDF8',justifyContent:'center',alignItems:'center',gap:4},
  heading:{fontSize:17,fontWeight:'800',color:ink},title:{fontSize:26,fontWeight:'800',color:ink},bold:{fontWeight:'800',color:ink},
  small:{color:muted,fontSize:13,lineHeight:19},tiny:{color:muted,fontSize:10},center:{textAlign:'center'},flex:{flex:1},
  card:{backgroundColor:'#FFF',borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:border},
  cardTop:{flexDirection:'row',gap:12,padding:12,paddingBottom:0},cardSummary:{flex:1,gap:5,paddingRight:32},cardBody:{padding:13,gap:10},panel:{backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:13,padding:12,gap:9},
  split:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:7},
  slider:{width:'100%',height:38},
  price:{color:navy,fontSize:16,fontWeight:'800'},priceTile:{backgroundColor:'#DDEEFF',borderRadius:8,paddingHorizontal:8,paddingVertical:5},
  fitPanel:{backgroundColor:'#E8F4EC',borderRadius:10,padding:9,gap:2},fitScore:{color:'#175D35',fontSize:16,fontWeight:'900'},watchOut:{color:'#8A4B08',fontSize:13,lineHeight:19},
  costPanel:{backgroundColor:'#F0F5FB',borderRadius:10,padding:9,gap:3},costTitle:{color:ink,fontSize:13,fontWeight:'800'},confidencePanel:{backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:13,padding:12,gap:5},
  liveSource:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#E8F4EC',paddingHorizontal:10,paddingVertical:8,borderRadius:9},liveSourceText:{fontSize:10,fontWeight:'900',letterSpacing:.4,color:'#175D35'},
  button:{flexDirection:'row',justifyContent:'center',alignItems:'center',minHeight:45,gap:6,borderRadius:10,backgroundColor:navy,paddingHorizontal:11,paddingVertical:9},
  buttonText:{fontSize:13,fontWeight:'800',color:'#FFF'},secondary:{backgroundColor:'#FFF',borderWidth:1,borderColor:border},secondaryText:{color:blue},
  disabled:{opacity:.55},
  chip:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:border,borderRadius:10,backgroundColor:'#FFF',paddingHorizontal:10,paddingVertical:9},
  chipOn:{backgroundColor:'#DCEEFF',borderColor:'#6395CF'},chipText:{fontSize:13,fontWeight:'700',color:ink},
  input:{borderWidth:1,borderColor:border,borderRadius:10,backgroundColor:'#FFF',minHeight:45,paddingHorizontal:12,color:ink},
  locationPanel:{backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:14,padding:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cityList:{gap:8,paddingRight:16},
  providerThumb:{height:116,borderRadius:10,backgroundColor:'#E4EDF8',alignItems:'center',justifyContent:'center',gap:4},providerHero:{height:176,backgroundColor:navy,overflow:'hidden',position:'relative'},providerHeroImage:{width:'100%',height:'100%'},providerHeroLabel:{position:'absolute',left:10,bottom:10,backgroundColor:'rgba(6,20,42,.82)',paddingHorizontal:8,paddingVertical:5,borderRadius:6},providerHeroLabelText:{fontSize:9,fontWeight:'800',letterSpacing:.5,color:'#FFF'},scoreBadge:{minWidth:50,backgroundColor:'#E8F4EC',borderRadius:11,paddingHorizontal:8,paddingVertical:6,alignItems:'center'},scoreBadgeText:{fontSize:16,fontWeight:'900',color:'#175D35'},scoreBadgeLabel:{fontSize:9,fontWeight:'800',color:'#175D35'},
  heart:{position:'absolute',right:10,top:10,width:43,height:43,borderRadius:22,backgroundColor:'#FFF',justifyContent:'center',alignItems:'center'},
  tag:{backgroundColor:'#E8F0FA',color:'#294D76',fontWeight:'600',fontSize:11,borderRadius:12,paddingHorizontal:7,paddingVertical:4,alignSelf:'flex-start'},
  factory:{backgroundColor:'#DDF4E4',color:'#1D5530',fontWeight:'700',fontSize:11,borderRadius:12,paddingHorizontal:7,paddingVertical:4,alignSelf:'flex-start'},
  sourceLink:{color:blue,fontSize:13,fontWeight:'700'},
  error:{color:'#9B2637',fontWeight:'700'},empty:{alignItems:'center',gap:8,padding:23,borderRadius:14,backgroundColor:'#FFF',borderWidth:1,borderColor:border},
  featureLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:border,paddingBottom:8},
  ownerCard:{height:172,borderRadius:17,overflow:'hidden',backgroundColor:navy,justifyContent:'flex-end'},ownerCardImage:{...StyleSheet.absoluteFill,width:undefined,height:undefined},ownerCardShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(3,18,39,.42)'},ownerCardCopy:{padding:14,gap:4},ownerCardTitle:{fontSize:20,fontWeight:'900',color:'#FFF'},ownerCardText:{fontSize:13,lineHeight:18,color:'#E5EDF8'},ownerCardCta:{marginTop:3,flexDirection:'row',alignItems:'center',gap:6},ownerCardCtaText:{fontSize:13,fontWeight:'900',color:'#FFF'},ownerPackageHero:{height:190,borderRadius:16,overflow:'hidden',backgroundColor:navy,justifyContent:'flex-end'},ownerPackageImage:{...StyleSheet.absoluteFill,width:undefined,height:undefined},ownerPackageCopy:{padding:15,gap:4},half:{flex:1},ownerFilter:{backgroundColor:'#EEF5FF',borderRadius:13,padding:12,flexDirection:'row',gap:8,alignItems:'center'},serviceRow:{backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:13,padding:11,flexDirection:'row',gap:9,alignItems:'center'},serviceRowOn:{borderColor:'#6395CF',backgroundColor:'#F7FBFF'},ownerEstimate:{backgroundColor:navy,borderRadius:14,padding:14,gap:4},ownerEstimateKicker:{fontSize:10,fontWeight:'800',letterSpacing:.6,color:'#A9D0FF'},ownerEstimatePrice:{fontSize:27,fontWeight:'900',color:'#FFF'},ownerEstimateText:{fontSize:13,lineHeight:18,color:'#DCEBFF'},providerCompareImage:{height:116,borderRadius:12,overflow:'hidden',backgroundColor:'#EAF2FC',alignItems:'center',justifyContent:'center'},
  checkLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:border,paddingVertical:7},
  headerAction:{paddingHorizontal:16,paddingVertical:6},compareTable:{padding:11,backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:12,gap:11},compareRow:{flexDirection:'row',gap:9},
  compareFeature:{gap:6,paddingTop:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:border},bar:{height:7,backgroundColor:'#DEEAF9',borderRadius:5,overflow:'hidden'},
  barFill:{height:7,backgroundColor:blue,borderRadius:5},
});
