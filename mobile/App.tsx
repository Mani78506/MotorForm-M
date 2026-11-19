import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageSourcePropType, Pressable, ScrollView, StatusBar, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer, NavigatorScreenParams, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Catalog, Car, Enquiry, Match, request, onRoad, rupees } from './api';

const navy='#102643', ink='#10213A', blue='#1C5CA8', muted='#4B5D75', border='#D9E3EF';
type Icon=React.ComponentProps<typeof Ionicons>['name'];
type Tabs={ Find:undefined; Matches:undefined; Compare:undefined; Saved:undefined; Requests:undefined };
type Stack={ Home:NavigatorScreenParams<Tabs> | undefined; Details:{id:string}; Enquire:{id:string; upgrades:string[]} };
const Tab=createBottomTabNavigator<Tabs>();
const Root=createNativeStackNavigator<Stack>();
type Go=NativeStackScreenProps<Stack,'Home'>['navigation'];
const icons:Record<keyof Tabs,Icon>={Find:'search-outline',Matches:'car-sport-outline',Compare:'swap-horizontal-outline',Saved:'heart-outline',Requests:'mail-outline'};
const images:Record<string,ImageSourcePropType>={
  'Maruti Suzuki Swift':require('./assets/swift.webp'),
  'Maruti Suzuki Baleno':require('./assets/baleno.webp'),
  'Tata Nexon':require('./assets/nexon.webp'),
  'Hyundai Creta':require('./assets/creta.webp'),
};

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
function Photo({car,compact=false}:{car:Car;compact?:boolean}) {
  const image=images[car.model];
  return image ? <Image accessibilityLabel={car.model+' model reference'} source={image} style={[s.photo,compact&&s.thumbnail]}/>
    : <View style={[s.noPhoto,compact&&s.thumbnail]}><Ionicons name="car-outline" size={29} color={muted}/><Text style={s.small}>Photo unavailable</Text></View>;
}
function Empty({icon,title,detail}:{icon:Icon;title:string;detail:string}) {
  return <View style={s.empty}><Ionicons name={icon} color={blue} size={34}/><Text style={s.heading}>{title}</Text><Text style={[s.small,s.center]}>{detail}</Text></View>;
}
function FindScreen({catalog,busy,error,onFind}:{catalog:Catalog;busy:boolean;error:string;onFind:(budget:number,use:string,features:string[],query:string)=>void}) {
  const [budget,setBudget]=useState(1500000);
  const [use,setUse]=useState('');
  const [query,setQuery]=useState('');
  const [features,setFeatures]=useState<string[]>([]);
  return <Frame>
    <View style={s.hero}><Image source={require('./assets/car.webp')} style={s.photo}/><View style={s.city}><Ionicons name="location-outline" size={15} color={blue}/><Text style={s.chipText}>Hyderabad</Text></View></View>
    <View style={s.panel}><View style={s.split}><Text style={s.heading}>On-road budget</Text><Text style={s.price}>{rupees(budget)}</Text></View>
      <Slider accessibilityLabel="On-road budget" accessibilityValue={{text:rupees(budget)}} minimumValue={500000} maximumValue={3000000} step={50000} value={budget} onValueChange={setBudget} minimumTrackTintColor={blue} maximumTrackTintColor={border} thumbTintColor={navy} style={s.slider}/>
      <View style={s.row}>{[1000000,1500000,2000000,2500000].map(amount=><Chip key={amount} label={'₹'+amount/100000+'L'} selected={budget===amount} onPress={()=>setBudget(amount)}/>)}</View>
    </View>
    <Text style={s.heading}>How do you drive?</Text>
    <View style={s.row}>{([{id:'city',label:'City',icon:'business-outline'},{id:'family',label:'Family',icon:'people-outline'},{id:'highway',label:'Highway',icon:'navigate-outline'}] as const).map(item=><Chip key={item.id} label={item.label} icon={item.icon} selected={use===item.id} onPress={()=>setUse(use===item.id?'':item.id)}/>)}</View>
    <Text style={s.heading}>Must-have features</Text>
    <View style={s.row}>{Object.entries(catalog.features).map(([id,feature])=><Chip key={id} label={feature.name} selected={features.includes(id)} onPress={()=>setFeatures(current=>current.includes(id)?current.filter(key=>key!==id):[...current,id])}/>)}</View>
    <TextInput accessibilityLabel="Search by model or trim" placeholder="Search by model or trim (optional)" placeholderTextColor={muted} autoCorrect={false} maxLength={70} value={query} onChangeText={setQuery} style={s.input}/>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button label={busy?'Finding matches…':'See my matches'} icon="arrow-forward" disabled={busy} onPress={()=>onFind(budget,use,features,query)}/>
    {catalog.illustrative&&<Text style={s.small}>Sourced prices where shown. Equipment and upgrade fitment are illustrative.</Text>}
  </Frame>;
}
function CarCard({car,total,features,matched,saved,selected,onSave,onCompare,onOpen}:{car:Car;total:number;features:Catalog['features'];matched:Match|undefined;saved:boolean;selected:boolean;onSave:()=>void;onCompare:()=>void;onOpen:()=>void}) {
  return <View style={s.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={'View '+car.model+' details'} onPress={onOpen}><Photo car={car}/></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={saved?'Remove saved car':'Save car'} accessibilityState={{selected:saved}} style={s.heart} onPress={onSave}><Ionicons name={saved?'heart':'heart-outline'} size={23} color={saved?'#A61B52':navy}/></Pressable>
    <View style={s.cardBody}><View style={s.split}><View style={s.flex}><Text style={s.heading}>{car.model}</Text><Text style={s.small}>{car.trim} · {car.gearbox}</Text></View><View style={s.priceTile}><Text style={s.tiny}>On-road est.</Text><Text style={s.price}>{rupees(total)}</Text></View></View>
      <View style={s.row}>{car.factory.slice(0,3).map(key=><Text style={s.tag} key={key}>✓ {features[key].name}</Text>)}{matched?.upgrades.map(key=><Text style={s.tag} key={key}>{features[key].name} · Check fitment</Text>)}</View>
      <View style={s.row}><Button secondary label="View details" onPress={onOpen}/><Button secondary label={selected?'✓ Added':'Add to compare'} onPress={onCompare}/></View>
    </View>
  </View>;
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
function Enquire({id,upgrades,car,onDone}:{id:string;upgrades:string[];car:Car;onDone:()=>void}) {
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
      const value=await request<{id:string}>('enquiries','POST',{variant:id,purpose,email:email.trim(),upgrades});
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
      <View style={s.compareRow}>{cars.map((car,index)=><View style={{width:cellWidth,gap:6}} key={car.id}><Photo car={car} compact/><Text style={s.bold}>{car.model}</Text><Text style={s.small}>{car.trim}</Text><Text style={s.price}>{rupees(totals[index])}</Text><Text style={s.tiny}>On-road est. with upgrades</Text><View style={s.bar}><View style={[s.barFill,{width:`${Math.round(totals[index]/Math.max(1,...totals)*100)}%`}]}/></View></View>)}</View>
      {featureRows.map(([key,feature])=><View style={s.compareFeature} key={key}><Text style={s.bold}>{feature.name}</Text><View style={s.compareRow}>{cars.map(car=><View key={car.id} style={{width:cellWidth,alignItems:'flex-start'}}>{car.factory.includes(key)?<Text style={s.factory}>✓ Factory</Text>:car.options.includes(key)?<Chip label={(upgrades[car.id]??[]).includes(key)?'✓ '+rupees(feature.cost??0):'+ '+rupees(feature.cost??0)} selected={(upgrades[car.id]??[]).includes(key)} onPress={()=>toggle(car.id,key)}/>:<Text style={s.tag}>Unconfirmed</Text>}</View>)}</View></View>)}
      <View style={s.compareRow}>{cars.map(car=><View style={{width:cellWidth}} key={car.id}><Button label="Enquire" secondary onPress={()=>onEnquire(car)}/></View>)}</View>
    </View></ScrollView>
    <Text style={s.small}>Optional upgrades need fitment confirmation.</Text>
  </Frame>;
}

function MotorForm() {
  const [catalog,setCatalog]=useState<Catalog>();
  const [saved,setSaved]=useState<string[]>([]);
  const [compare,setCompare]=useState<string[]>([]);
  const [upgrades,setUpgrades]=useState<Record<string,string[]>>({});
  const [matches,setMatches]=useState<Match[]>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const [saving,setSaving]=useState<string>();
  const load=useCallback(async()=>{
    setError('');
    try {
      const data=await request<Catalog>('catalog');
      setCatalog(data);
      try { setSaved(await request<string[]>('shortlist')); }
      catch { setNotice('Saved cars are unavailable. Reopen the app to retry.'); }
    } catch { setError('Could not load the catalog. Check your connection and try again.'); }
  },[]);
  useEffect(()=>{void load();},[load]);
  if (!catalog) return <Frame>{error?<><Empty icon="cloud-offline-outline" title="Catalog unavailable" detail={error}/><Button label="Try again" onPress={load}/></>:<ActivityIndicator color={blue}/>}</Frame>;
  const cars=catalog.cars;
  async function find(budget:number,use:string,features:string[],query:string,after:()=>void) {
    if (busy) return;
    setBusy(true);setError('');
    const params=[['budget',String(budget)],['use',use],['q',query],...features.map(key=>['feature',key])].map(([key,value])=>key+'='+encodeURIComponent(value)).join('&');
    try { setMatches(await request<Match[]>('matches?'+params)); after(); }
    catch { setError('Could not find matches. Try again.'); }
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
  function select(car:Car) {
    setNotice('');
    if (compare.includes(car.id)) { setCompare(compare.filter(id=>id!==car.id)); return; }
    if (compare.length>=3) { setNotice('Remove a variant before adding another.'); return; }
    setCompare([...compare,car.id]);
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
  function list(go:Go,items:Car[],withEstimates:boolean) {
    return items.map(car=>{
      const match=withEstimates?matches?.find(item=>item.id===car.id):undefined;
      return <CarCard key={car.id} car={car} total={match?.total??onRoad(car)} matched={match} features={catalog!.features} saved={saved.includes(car.id)} selected={compare.includes(car.id)} onSave={()=>void save(car.id)} onCompare={()=>select(car)} onOpen={()=>go.navigate('Details',{id:car.id})}/>;
    });
  }
  function renderTabs(go:Go) {
    return <Tab.Navigator screenOptions={({route})=>({
      headerTitleStyle:{color:ink,fontWeight:'800'},headerShadowVisible:false,tabBarActiveTintColor:blue,tabBarInactiveTintColor:muted,
      tabBarLabelStyle:{fontSize:11,fontWeight:'700'},tabBarIcon:({color,size})=><Ionicons name={icons[route.name]} color={color} size={size}/>,
    })}>
      <Tab.Screen name="Find" options={{title:'Find my car',tabBarLabel:'Find'}}>{({navigation}:BottomTabScreenProps<Tabs,'Find'>)=><FindScreen catalog={catalog!} busy={busy} error={error} onFind={(budget,use,features,query)=>void find(budget,use,features,query,()=>navigation.navigate('Matches'))}/>}</Tab.Screen>
      <Tab.Screen name="Matches" options={{title:'Matches for you',tabBarLabel:'Matches'}}>{({navigation})=><Frame>
        {!!notice&&<Text accessibilityRole="alert" style={s.error}>{notice}</Text>}
        {matches?.length ? <Text style={s.small}>{matches.length} best {matches.length===1?'match':'matches'} · Hyderabad{catalog!.illustrative?' · Estimates':''}</Text> : <Empty icon="car-outline" title={matches?'No exact matches':'Find your top matches'} detail={matches?'Try a higher budget or fewer required features.':'Set your budget and priorities to start.'}/>}
        {list(go,(matches??[]).flatMap(match=>cars.filter(car=>car.id===match.id)),true)}
        {compare.length>0&&<Button label={'Compare ('+compare.length+')'} icon="swap-horizontal-outline" onPress={()=>navigation.navigate('Compare')}/>}
        <Button label="Edit preferences" secondary onPress={()=>navigation.navigate('Find')}/>
      </Frame>}</Tab.Screen>
      <Tab.Screen name="Compare" options={{title:'Compare variants',tabBarLabel:'Compare'}}>{()=><Compare cars={compare.flatMap(id=>cars.filter(car=>car.id===id))} catalog={catalog!} upgrades={upgrades} toggle={toggle} onEnquire={car=>openEnquiry(go,car)}/>}</Tab.Screen>
      <Tab.Screen name="Saved" options={{title:'Saved cars',tabBarLabel:'Saved'}}>{()=> <Frame>
        {!!notice&&<Text accessibilityRole="alert" style={s.error}>{notice}</Text>}
        {saved.length?list(go,cars.filter(car=>saved.includes(car.id)),false):<Empty icon="heart-outline" title="No saved cars" detail="Tap the heart on a match to keep it here."/>}
      </Frame>}</Tab.Screen>
      <Tab.Screen name="Requests" options={{title:'My enquiries',tabBarLabel:'Requests'}}>{()=><Requests revision={revision}/>}</Tab.Screen>
    </Tab.Navigator>;
  }
  return <Root.Navigator screenOptions={{headerTitleStyle:{color:ink,fontWeight:'800'},headerTintColor:navy}}>
    <Root.Screen name="Home" options={{headerShown:false}}>{props=>renderTabs(props.navigation)}</Root.Screen>
    <Root.Screen name="Details" options={{title:'Car details'}}>{({route,navigation})=>{
      const car=cars.find(item=>item.id===route.params.id);
      return car?<Details car={car} catalog={catalog} selected={compare.includes(car.id)} saved={saved.includes(car.id)} onSave={()=>void save(car.id)} onCompare={()=>select(car)} onEnquire={()=>openEnquiry(navigation,car)}/>:<Frame><Empty icon="car-outline" title="Variant unavailable" detail="Return to Matches to choose another car."/></Frame>;
    }}</Root.Screen>
    <Root.Screen name="Enquire" options={{title:'Dealer enquiry'}}>{({route,navigation})=>{
      const car=cars.find(item=>item.id===route.params.id);
      return car?<Enquire {...route.params} car={car} onDone={()=>{setRevision(value=>value+1);navigation.popTo('Home',{screen:'Requests'});}}/>:<Frame><Empty icon="car-outline" title="Variant unavailable" detail="Return to Matches to choose another car."/></Frame>;
    }}</Root.Screen>
  </Root.Navigator>;
}
export default function App() {
  return <SafeAreaProvider><StatusBar barStyle="dark-content"/><NavigationContainer><MotorForm/></NavigationContainer></SafeAreaProvider>;
}
const s=StyleSheet.create({
  frame:{flex:1,backgroundColor:'#F3F7FC'},content:{gap:13,padding:16,paddingBottom:28},
  hero:{borderRadius:18,overflow:'hidden',backgroundColor:navy},
  city:{position:'absolute',top:12,left:12,flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#FFF',borderRadius:18,paddingVertical:6,paddingHorizontal:9},
  photo:{width:'100%',aspectRatio:16/9,backgroundColor:'#E4EDF8'},thumbnail:{height:95,aspectRatio:undefined,borderRadius:8},
  noPhoto:{aspectRatio:16/9,backgroundColor:'#E4EDF8',justifyContent:'center',alignItems:'center',gap:4},
  heading:{fontSize:17,fontWeight:'800',color:ink},title:{fontSize:26,fontWeight:'800',color:ink},bold:{fontWeight:'800',color:ink},
  small:{color:muted,fontSize:13,lineHeight:19},tiny:{color:muted,fontSize:10},center:{textAlign:'center'},flex:{flex:1},
  card:{backgroundColor:'#FFF',borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:border},
  cardBody:{padding:13,gap:10},panel:{backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:13,padding:12,gap:9},
  split:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:7},
  slider:{width:'100%',height:38},
  price:{color:navy,fontSize:16,fontWeight:'800'},priceTile:{backgroundColor:'#DDEEFF',borderRadius:8,paddingHorizontal:8,paddingVertical:5},
  button:{flexDirection:'row',justifyContent:'center',alignItems:'center',minHeight:45,gap:6,borderRadius:10,backgroundColor:navy,paddingHorizontal:11,paddingVertical:9},
  buttonText:{fontSize:13,fontWeight:'800',color:'#FFF'},secondary:{backgroundColor:'#FFF',borderWidth:1,borderColor:border},secondaryText:{color:blue},
  disabled:{opacity:.55},
  chip:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:border,borderRadius:10,backgroundColor:'#FFF',paddingHorizontal:10,paddingVertical:9},
  chipOn:{backgroundColor:'#DCEEFF',borderColor:'#6395CF'},chipText:{fontSize:13,fontWeight:'700',color:ink},
  input:{borderWidth:1,borderColor:border,borderRadius:10,backgroundColor:'#FFF',minHeight:45,paddingHorizontal:12,color:ink},
  heart:{position:'absolute',right:10,top:10,width:43,height:43,borderRadius:22,backgroundColor:'#FFF',justifyContent:'center',alignItems:'center'},
  tag:{backgroundColor:'#E8F0FA',color:'#294D76',fontWeight:'600',fontSize:11,borderRadius:12,paddingHorizontal:7,paddingVertical:4,alignSelf:'flex-start'},
  factory:{backgroundColor:'#DDF4E4',color:'#1D5530',fontWeight:'700',fontSize:11,borderRadius:12,paddingHorizontal:7,paddingVertical:4,alignSelf:'flex-start'},
  sourceLink:{color:blue,fontSize:13,fontWeight:'700'},
  error:{color:'#9B2637',fontWeight:'700'},empty:{alignItems:'center',gap:8,padding:23,borderRadius:14,backgroundColor:'#FFF',borderWidth:1,borderColor:border},
  featureLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:border,paddingBottom:8},
  compareTable:{padding:11,backgroundColor:'#FFF',borderWidth:1,borderColor:border,borderRadius:12,gap:11},compareRow:{flexDirection:'row',gap:9},
  compareFeature:{gap:6,paddingTop:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:border},bar:{height:7,backgroundColor:'#DEEAF9',borderRadius:5,overflow:'hidden'},
  barFill:{height:7,backgroundColor:blue,borderRadius:5},
});
