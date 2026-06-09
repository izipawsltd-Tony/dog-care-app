import { useState, useRef, useEffect } from "react";
import LitterTab from "./LitterTab";
import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

const KENNELS = Array.from({ length: 13 }, (_, i) => `Kennel ${i + 1}`);
const BREED_LIST = ["Labrador Retriever","German Shepherd","Golden Retriever","Border Collie","French Bulldog","Bulldog","Poodle","Beagle","Rottweiler","Siberian Husky","Other"];
const COLOUR_LIST = ["Black","Yellow","Chocolate","Cream","Golden","Red","Silver","White","Black & Tan","Black & White","Brown","Fawn","Brindle","Merle","Sable","Tricolour","Other"];
const DOC_TYPES = ["Vet Records / Vaccination Book","Breed Certificate","Test Results","Hip and Elbow Scores","Other"];
const BREED_MATING_WINDOW: Record<string,{from:number;to:number}> = {"Labrador Retriever":{from:10,to:14},"German Shepherd":{from:12,to:15},"default":{from:10,to:14}};
const BREED_CYCLE: Record<string,{days:number;label:string}> = {"Labrador Retriever":{days:182,label:"~6 months"},"German Shepherd":{days:182,label:"~6 months"},"default":{days:182,label:"~6 months"}};
const WHELP_TOLERANCE = 3;
const REMINDER_OPTIONS = [{label:"7 days before",days:7},{label:"14 days before",days:14},{label:"1 month before",days:30},{label:"2 months before",days:60},{label:"3 months before",days:90}];
const CARE_STEPS = [{key:"cleaning",icon:"🧹",label:"Cleaning"},{key:"feeding",icon:"🍖",label:"Feeding"},{key:"grooming",icon:"🛁",label:"Grooming"},{key:"health",icon:"🩺",label:"Health"}];
const TASK_COUNT = 4;
const VACCINE_SCHEDULE: Record<string,{intervalDays:number;label:string}> = {"C5":{intervalDays:365,label:"Annual"},"C3":{intervalDays:365,label:"Annual"},"Rabies":{intervalDays:365,label:"Annual"},"Lepto":{intervalDays:365,label:"Annual"},"Kennel Cough":{intervalDays:365,label:"Annual"},"Heartworm":{intervalDays:365,label:"Annual"},"Puppy 1st":{intervalDays:28,label:"4 weeks (Puppy)"},"Puppy 2nd":{intervalDays:28,label:"4 weeks (Puppy)"},"Puppy Final":{intervalDays:365,label:"Annual (after final)"}};
const PUPPY_VACCINES = [{name:"Puppy 1st",weekMin:6,weekMax:7,note:"First vaccination at 6–7 weeks"},{name:"Puppy 2nd",weekMin:10,weekMax:12,note:"Second vaccination at 10–12 weeks"},{name:"Puppy Final",weekMin:14,weekMax:16,note:"Final vaccination at 14–16 weeks"}];
const WORMING_SCHEDULE: Record<string,{intervalDays:number;label:string}> = {"Milbemax":{intervalDays:90,label:"Every 3 months"},"Drontal":{intervalDays:90,label:"Every 3 months"},"Interceptor":{intervalDays:30,label:"Monthly"},"Heartgard":{intervalDays:30,label:"Monthly"},"Panoramis":{intervalDays:30,label:"Monthly"},"Nexgard Spectra":{intervalDays:30,label:"Monthly"},"Other":{intervalDays:90,label:"Every 3 months"}};

const getMatingWindow = (b:string) => BREED_MATING_WINDOW[b]||BREED_MATING_WINDOW["default"];
const getBreedCycle = (b:string) => BREED_CYCLE[b]||BREED_CYCLE["default"];
const addDays = (d:string,n:number) => { if(!d)return""; const x=new Date(d); x.setDate(x.getDate()+n); return x.toISOString().split("T")[0]; };
const formatDate = (d:string) => { if(!d)return""; const [y,m,day]=d.split("-"); return `${day}-${m}-${y}`; };
const formatDateRange = (a:string,b:string) => { if(!a||!b)return""; return `${formatDate(a)} – ${formatDate(b)}`; };
const daysUntil = (d:string) => { if(!d)return null; return Math.ceil((new Date(d).getTime()-new Date().setHours(0,0,0,0))/(1000*60*60*24)); };

type VaccineRecord = {id:string;name:string;date:string;nextDate:string;completed?:boolean};
type WormRecord = {id:string;name:string;date:string;nextDate:string;notes:string};
type MediaItem = {id:string;type:"image"|"video";url:string;name:string;date:string};
type DocItem = {id:string;name:string;docType:string;date:string;url:string;fileType:string};
type HeatRecord = {id:string;lastHeat:string;nextHeat:string;cycleLength:string;notes:string;readyToMate:string;matingDate:string;expectedWhelp:string;actualWhelp:string};
type Puppy = {id:string;name:string;gender:"Male"|"Female"|"";colour:string;collarColour:string;weight:string;photo:string;status:string;buyer:any;vaccines:VaccineRecord[];wormRecords:WormRecord[];documents:DocItem[]};
type Litter = {id:string;litterId:string;dob:string;sire:string;dam:string;maleCount:string;femaleCount:string;notes:string;puppies:Puppy[]};
type Dog = {id:string;name:string;callName:string;breed:string;dob:string;weight:string;chipNumber:string;regNumber:string;gender:string;color:string;avatar:string;kennel:string;vaccines:VaccineRecord[];wormRecords:WormRecord[];healthNotes:string;gallery:MediaItem[];documents:DocItem[];heatRecords:HeatRecord[];litters:Litter[]};

const newDog = (id:string): Dog => ({id,name:"",callName:"",breed:"",dob:"",weight:"",chipNumber:"",regNumber:"",gender:"",color:"",avatar:"",kennel:"",vaccines:[],wormRecords:[],healthNotes:"",gallery:[],documents:[],heatRecords:[],litters:[]});
const genId = () => Date.now().toString(36).toUpperCase();

export default function DogProfile() {
  const [dogs,setDogs] = useState<Dog[]>([]);
  const [loadingData,setLoadingData] = useState(true);
  const [syncing,setSyncing] = useState(false);
  const [syncMsg,setSyncMsg] = useState("");
  const [todayJournal,setTodayJournal] = useState<any>(null);
  const [activeDogId,setActiveDogId] = useState<string|null>(null);
  const [tab,setTab] = useState<"info"|"vaccine"|"worming"|"health"|"heat"|"litter"|"gallery"|"docs"|"reminders">("info");
  const [newVaccine,setNewVaccine] = useState({name:"",date:"",nextDate:""});
  const [showAddVaccine,setShowAddVaccine] = useState(false);
  const [showPuppySchedule,setShowPuppySchedule] = useState(false);
  const [editVaccineIdx,setEditVaccineIdx] = useState<number|null>(null);
  const [editVaccine,setEditVaccine] = useState({name:"",date:"",nextDate:""});
  const [newWorm,setNewWorm] = useState({name:"",date:"",nextDate:"",notes:""});
  const [showAddWorm,setShowAddWorm] = useState(false);
  const [editWormId,setEditWormId] = useState<string|null>(null);
  const [editWorm,setEditWorm] = useState({name:"",date:"",nextDate:"",notes:""});
  const [newHeat,setNewHeat] = useState({lastHeat:"",nextHeat:"",cycleLength:"",notes:"",readyToMate:"",matingDate:"",expectedWhelp:"",actualWhelp:""});
  const [showAddHeat,setShowAddHeat] = useState(false);
  const [search,setSearch] = useState("");
  const [filterKennel,setFilterKennel] = useState("All");
  const [lightbox,setLightbox] = useState<MediaItem|null>(null);
  const [newDoc,setNewDoc] = useState({name:"",docType:DOC_TYPES[0]});
  const [vaccineReminder,setVaccineReminder] = useState(REMINDER_OPTIONS[0]);
  const [heatReminder,setHeatReminder] = useState(REMINDER_OPTIONS[2]);
  const [showReminderSettings,setShowReminderSettings] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const activeDog = dogs.find(d=>d.id===activeDogId)||null;

  useEffect(()=>{
    const loadAll = async () => {
      try {
        const [ps,js] = await Promise.all([
          getDoc(doc(db,"dogProfiles","all")),
          getDoc(doc(db,"journals",new Date().toISOString().split("T")[0]))
        ]);
        if(ps.exists()&&ps.data().dogs) setDogs(ps.data().dogs);
        if(js.exists()) setTodayJournal(js.data());
      } catch(e){console.error(e);}
      setLoadingData(false);
    };
    loadAll();
  },[]);

  const saveToFirebase = async (d:Dog[]) => {
    setSyncing(true);
    try {
      await setDoc(doc(db,"dogProfiles","all"),{dogs:d,updatedAt:new Date().toISOString()});
      setSyncMsg("✓ Saved"); setTimeout(()=>setSyncMsg(""),2000);
    } catch(e){setSyncMsg("Error!");}
    setSyncing(false);
  };

  const addDog = () => { const d=newDog("DOG-"+genId()); const u=[...dogs,d]; setDogs(u); saveToFirebase(u); setActiveDogId(d.id); setTab("info"); setSaved(false); };
  const updateDog = (f:keyof Dog,v:any) => { setDogs(p=>p.map(d=>d.id===activeDogId?{...d,[f]:v}:d)); setSaved(false); };
  const deleteDog = (id:string) => { if(!confirm("Delete this profile?"))return; const u=dogs.filter(d=>d.id!==id); setDogs(u); saveToFirebase(u); setActiveDogId(null); };

  const addVaccine = () => { if(!newVaccine.name||!newVaccine.date||!activeDog)return; updateDog("vaccines",[...activeDog.vaccines,{id:genId(),...newVaccine}]); setNewVaccine({name:"",date:"",nextDate:""}); setShowAddVaccine(false); setShowPuppySchedule(false); };
  const saveEditVaccine = (idx:number) => { if(!activeDog)return; updateDog("vaccines",activeDog.vaccines.map((v,i)=>i===idx?{...v,...editVaccine}:v)); setEditVaccineIdx(null); };
  const addWorm = () => { if(!newWorm.name||!newWorm.date||!activeDog)return; updateDog("wormRecords",[...(activeDog.wormRecords||[]),{id:genId(),...newWorm}]); setNewWorm({name:"",date:"",nextDate:"",notes:""}); setShowAddWorm(false); };
  const saveEditWorm = (id:string) => { if(!activeDog)return; updateDog("wormRecords",(activeDog.wormRecords||[]).map(w=>w.id===id?{...w,...editWorm}:w)); setEditWormId(null); };

  const handleAvatar = (e:React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>updateDog("avatar",ev.target?.result as string); r.readAsDataURL(f); };
  const handleGallery = (e:React.ChangeEvent<HTMLInputElement>) => { Array.from(e.target.files||[]).forEach(f=>{ const r=new FileReader(); const iv=f.type.startsWith("video/"); r.onload=ev=>{ const item:MediaItem={id:genId(),type:iv?"video":"image",url:ev.target?.result as string,name:f.name,date:new Date().toLocaleDateString("en-AU")}; setDogs(p=>p.map(d=>d.id===activeDogId?{...d,gallery:[...d.gallery,item]}:d)); }; r.readAsDataURL(f); }); setSaved(false); };
  const handleDoc = (e:React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(!f||!activeDog)return; const r=new FileReader(); r.onload=ev=>{ const item:DocItem={id:genId(),name:newDoc.name||f.name,docType:newDoc.docType,date:new Date().toLocaleDateString("en-AU"),url:ev.target?.result as string,fileType:f.type}; setDogs(p=>p.map(d=>d.id===activeDogId?{...d,documents:[...d.documents,item]}:d)); setNewDoc({name:"",docType:DOC_TYPES[0]}); }; r.readAsDataURL(f); setSaved(false); };

  const removeGallery = (id:string) => updateDog("gallery",activeDog!.gallery.filter(g=>g.id!==id));
  const removeDoc = (id:string) => updateDog("documents",activeDog!.documents.filter(d=>d.id!==id));
  const age = (dob:string) => { if(!dob)return""; const m=Math.floor((Date.now()-new Date(dob).getTime())/(1000*60*60*24*30)); if(m<12)return`${m} months old`; return`${Math.floor(m/12)} yr ${m%12} mo`; };
  const filteredDogs = dogs.filter(d=>{ const ms=d.name.toLowerCase().includes(search.toLowerCase())||d.id.toLowerCase().includes(search.toLowerCase())||((d.callName||"").toLowerCase().includes(search.toLowerCase())); const mk=filterKennel==="All"||d.kennel===filterKennel; return ms&&mk; });

  const inp = (val:string,onChange:(v:string)=>void,placeholder:string,type="text") => (
    <input type={type} value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
  );
  const autoInp = (val:string,onChange:(v:string)=>void,hint:string) => (
    <div>
      <input type="date" value={val} onChange={e=>onChange(e.target.value)} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1.5px solid #AFA9EC",background:"#EEEDFE",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
      {hint&&<div style={{fontSize:10,color:"#534AB7",marginTop:2}}>{hint}</div>}
    </div>
  );
  const lbl = (t:string) => <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{t}</div>;
  const docIcon = (ft:string) => ft.includes("pdf")?"📄":ft.includes("image")?"🖼️":ft.includes("word")?"📝":"📎";

  const urgencyColor = (d:number) => {
    if(d<0) return{bg:"#FCEBEB",border:"#F09595",text:"#A32D2D",badge:"#E24B4A"};
    if(d<=7) return{bg:"#FAECE7",border:"#F0997B",text:"#993C1D",badge:"#D85A30"};
    if(d<=14) return{bg:"#FAEEDA",border:"#FAC775",text:"#633806",badge:"#BA7517"};
    return{bg:"#E6F1FB",border:"#85B7EB",text:"#0C447C",badge:"#378ADD"};
  };
  const urgencyLabel = (d:number) => d<0?`Overdue ${Math.abs(d)}d`:d===0?"Due today!":d===1?"Due tomorrow":`In ${d} days`;

  const vaccineAlerts = activeDog?activeDog.vaccines.filter(v=>{
    const dl=daysUntil(v.nextDate);
    if(dl===null||dl>vaccineReminder.days) return false;
    if(v.completed) return false;
    const hasNewer=activeDog.vaccines.some(v2=>v2.name===v.name&&v2.date>v.date);
    return !hasNewer;
  }).map(v=>({name:v.name,dueDate:v.nextDate,daysLeft:daysUntil(v.nextDate)!})):[];

  const heatAlerts = activeDog?activeDog.heatRecords.filter(h=>{const dl=daysUntil(h.nextHeat);return dl!==null&&dl<=heatReminder.days;}).map(h=>({nextHeat:h.nextHeat,daysLeft:daysUntil(h.nextHeat)!,notes:h.notes})):[];
  const reminderCount = vaccineAlerts.length+heatAlerts.length;

  const TABS = [
    {k:"info",label:"📋 Info"},{k:"vaccine",label:"💉 Vaccines"},{k:"worming",label:"🐛 Worming"},
    {k:"health",label:"🩺 Health"},
    ...(activeDog?.gender!=="Male"?[{k:"heat",label:"🌡️ Heat Cycle"},{k:"litter",label:`🐾 Litters${(activeDog?.litters||[]).length>0?` (${(activeDog?.litters||[]).length})`:""}`}]:[]),
    {k:"gallery",label:"🖼️ Gallery"},{k:"docs",label:"📁 Documents"},
    {k:"reminders",label:`🔔 Reminders${reminderCount>0?` (${reminderCount})`:""}`},
  ];

  const getTodayCare = (kennel:string) => {
    if(!todayJournal?.checks?.[kennel])return null;
    const kc=todayJournal.checks[kennel];
    const steps=CARE_STEPS.map(s=>({...s,done:kc[s.key]?Object.values(kc[s.key]).filter(Boolean).length:0}));
    const totalDone=steps.reduce((a,s)=>a+s.done,0);
    const pct=Math.round((totalDone/(CARE_STEPS.length*TASK_COUNT))*100);
    return{steps,pct,allDone:pct===100};
  };

  if(loadingData) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,fontFamily:"var(--font-sans)",color:"var(--color-text-secondary)"}}>Loading profiles...</div>;

  return (
    <div style={{fontFamily:"var(--font-sans)",color:"var(--color-text-primary)",maxWidth:680,margin:"0 auto",padding:"16px 12px"}}>

      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:600,width:"100%",position:"relative"}}>
            {lightbox.type==="image"?<img src={lightbox.url} alt="" style={{width:"100%",borderRadius:8,maxHeight:"80vh",objectFit:"contain"}}/>:<video src={lightbox.url} controls style={{width:"100%",borderRadius:8}}/>}
            <div style={{color:"#fff",fontSize:12,marginTop:8,textAlign:"center"}}>{lightbox.name}</div>
            <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:-12,right:-12,width:28,height:28,borderRadius:"50%",background:"#fff",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Dog Profiles</div>
          <div style={{fontSize:18,fontWeight:500}}>{dogs.length} dog{dogs.length!==1?"s":""} registered</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {syncMsg&&<span style={{fontSize:12,color:"#1D9E75"}}>{syncMsg}</span>}
          <button onClick={()=>saveToFirebase(dogs)} disabled={syncing} style={{padding:"8px 16px",borderRadius:"var(--border-radius-md)",border:"none",background:syncing?"#888":"#1D9E75",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>💾 Save</button>
          <button onClick={addDog} style={{padding:"8px 16px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Add Dog</button>
        </div>
      </div>

      {!activeDog&&(
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by name or ID..." style={{flex:1,padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
          <select value={filterKennel} onChange={e=>setFilterKennel(e.target.value)} style={{padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>
            <option value="All">All Kennels</option>
            {KENNELS.map(k=><option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      {!activeDog&&(
        <>
          {filteredDogs.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-tertiary)",fontSize:13}}>{dogs.length===0?"No profiles yet — click + Add Dog to get started":"No results found"}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filteredDogs.map(d=>{
              const care=d.kennel?getTodayCare(d.kennel):null;
              return(
                <div key={d.id} onClick={()=>{setActiveDogId(d.id);setTab("info");setSaved(false);}} style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {d.avatar?<img src={d.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:22}}>🐶</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,fontSize:14}}>{d.callName?`${d.callName} (${d.name||"Unnamed"})`:d.name||"Unnamed"}</div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{[d.breed,d.kennel,d.dob&&age(d.dob)].filter(Boolean).join(" · ")}</div>
                    {care&&(
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                        <div style={{height:4,width:60,background:"var(--color-border-tertiary)",borderRadius:99}}><div style={{height:"100%",width:care.pct+"%",background:care.allDone?"#1D9E75":"#7F77DD",borderRadius:99}}/></div>
                        <span style={{fontSize:11,color:care.allDone?"#1D9E75":"var(--color-text-tertiary)"}}>{care.pct}% today {care.allDone?"✅":""}</span>
                      </div>
                    )}
                  </div>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{d.id}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeDog&&(
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={()=>{saveToFirebase(dogs);setActiveDogId(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:13}}>← Back</button>
            <button onClick={()=>deleteDog(activeDog.id)} style={{background:"none",border:"1px solid #F09595",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"#E24B4A",fontSize:12,padding:"4px 10px"}}>Delete Profile</button>
          </div>

          <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",marginBottom:14,display:"flex",gap:14,alignItems:"center"}}>
            <div style={{position:"relative",flexShrink:0}}>
              <div style={{width:72,height:72,borderRadius:"50%",overflow:"hidden",background:"var(--color-border-tertiary)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--color-border-secondary)"}}>
                {activeDog.avatar?<img src={activeDog.avatar} alt="dog" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:28}}>🐶</span>}
              </div>
              <label style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:"50%",background:"#534AB7",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                <span style={{color:"#fff",fontSize:12}}>+</span>
                <input type="file" accept="image/*" onChange={handleAvatar} style={{display:"none"}}/>
              </label>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:500}}>{activeDog.callName?`${activeDog.callName} (${activeDog.name||"Unnamed"})`:activeDog.name||"Unnamed"}</div>
              {activeDog.breed&&<div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>🐾 {activeDog.breed}{activeDog.gender&&` · ${activeDog.gender}`}</div>}
              {activeDog.dob&&<div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:1}}>🎂 {age(activeDog.dob)}</div>}
              {activeDog.kennel&&<div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:1}}>🏠 {activeDog.kennel}</div>}
              <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{background:"#EEEDFE",color:"#3C3489",fontSize:11,padding:"2px 8px",borderRadius:99}}>{activeDog.id}</span>
                {reminderCount>0&&<span style={{background:"#E24B4A",color:"#fff",fontSize:11,padding:"2px 8px",borderRadius:99}}>🔔 {reminderCount}</span>}
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {TABS.map(t=><button key={t.k} onClick={()=>setTab(t.k as any)} style={{padding:"6px 10px",borderRadius:"var(--border-radius-md)",fontSize:12,cursor:"pointer",border:tab===t.k?"1.5px solid #534AB7":"1.5px solid var(--color-border-tertiary)",background:tab===t.k?"#EEEDFE":"var(--color-background-primary)",color:tab===t.k?"#3C3489":"var(--color-text-secondary)"}}>{t.label}</button>)}
          </div>

          {/* INFO */}
          {tab==="info"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {activeDog.kennel&&(()=>{
                const care=getTodayCare(activeDog.kennel);
                if(!care) return <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",fontSize:13,color:"var(--color-text-tertiary)"}}>📋 No care data today for {activeDog.kennel}</div>;
                return(
                  <div style={{background:care.allDone?"#E1F5EE":"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",border:`1px solid ${care.allDone?"#5DCAA5":"var(--color-border-tertiary)"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:500}}>📋 Today's Care — {activeDog.kennel}</div>
                      <span style={{fontSize:13,fontWeight:500,color:care.allDone?"#1D9E75":"#534AB7"}}>{care.pct}% {care.allDone?"✅":""}</span>
                    </div>
                    <div style={{height:5,background:"var(--color-border-tertiary)",borderRadius:99,marginBottom:10}}><div style={{height:"100%",width:care.pct+"%",background:care.allDone?"#1D9E75":"#7F77DD",borderRadius:99}}/></div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                      {care.steps.map(s=>{const complete=s.done===TASK_COUNT;return(
                        <div key={s.key} style={{textAlign:"center",padding:"6px 4px",borderRadius:6,background:complete?"#C8F0E2":"var(--color-background-primary)",border:`1px solid ${complete?"#5DCAA5":"var(--color-border-tertiary)"}`}}>
                          <div style={{fontSize:16}}>{s.icon}</div>
                          <div style={{fontSize:10,color:complete?"#085041":"var(--color-text-secondary)",marginTop:2}}>{s.label}</div>
                          <div style={{fontSize:11,fontWeight:500,color:complete?"#1D9E75":"var(--color-text-tertiary)"}}>{s.done}/{TASK_COUNT}</div>
                        </div>
                      );})}
                    </div>
                  </div>
                );
              })()}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>{lbl("Registered Name")}{inp(activeDog.name,v=>updateDog("name",v),"Full registered name...")}</div>
                <div>{lbl("Call Name")}{inp(activeDog.callName||"",v=>updateDog("callName",v),"Buddy, Max...")}</div>
                <div>{lbl("Breed")}<select value={activeDog.breed} onChange={e=>updateDog("breed",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}><option value="">-- Select breed --</option>{BREED_LIST.map(b=><option key={b} value={b}>{b}</option>)}</select></div>
                <div>{lbl("Coat Colour")}<select value={activeDog.color} onChange={e=>updateDog("color",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}><option value="">-- Select colour --</option>{COLOUR_LIST.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div>{lbl("Gender")}<select value={activeDog.gender} onChange={e=>updateDog("gender",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}><option value="">-- Select --</option><option>Male</option><option>Female</option></select></div>
                <div>{lbl("Date of Birth")}{inp(activeDog.dob,v=>updateDog("dob",v),"","date")}</div>
                <div>{lbl("Weight (kg)")}{inp(activeDog.weight,v=>updateDog("weight",v),"5.2")}</div>
                <div>{lbl("Microchip Number")}{inp(activeDog.chipNumber,v=>updateDog("chipNumber",v),"900123456789")}</div>
                <div>{lbl("Registration Number")}{inp(activeDog.regNumber,v=>updateDog("regNumber",v),"ANKC-2024-001")}</div>
              </div>
              <div>{lbl("Current Kennel")}<select value={activeDog.kennel} onChange={e=>updateDog("kennel",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}><option value="">-- Select Kennel --</option>{KENNELS.map(k=><option key={k} value={k}>{k}</option>)}</select></div>
            </div>
          )}

          {/* VACCINES */}
          {tab==="vaccine"&&(
            <div>
              {activeDog.vaccines.length===0&&!showAddVaccine&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No vaccination records yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {activeDog.vaccines.map((v,i)=>{
                  const dl=daysUntil(v.nextDate); const isOD=dl!==null&&dl<0; const isSoon=dl!==null&&!isOD&&dl<=30;
                  const hasNewer=activeDog.vaccines.some((v2,j)=>j!==i&&v2.name===v.name&&v2.date>v.date);
                  const showOverdue=isOD&&!hasNewer&&!v.completed;
                  if(editVaccineIdx===i) return(
                    <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Edit Vaccine</div>
                      <input value={editVaccine.name} onChange={e=>setEditVaccine(p=>({...p,name:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>{lbl("Date Given")}<input type="date" value={editVaccine.date} onChange={e=>setEditVaccine(p=>({...p,date:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                        <div>{lbl("Next Due")}<input type="date" value={editVaccine.nextDate} onChange={e=>setEditVaccine(p=>({...p,nextDate:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>saveEditVaccine(i)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:12,cursor:"pointer"}}>Save</button>
                        <button onClick={()=>setEditVaccineIdx(null)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>Cancel</button>
                      </div>
                    </div>
                  );
                  return(
                    <div key={i} style={{background:v.completed?"var(--color-background-secondary)":showOverdue?"#FCEBEB":isSoon?"#FAEEDA":"var(--color-background-primary)",border:`1px solid ${v.completed?"var(--color-border-tertiary)":showOverdue?"#F09595":isSoon?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:v.completed?0.6:1}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:6}}>💉 {v.name}{v.completed&&<span style={{fontSize:10,background:"#1D9E75",color:"#fff",padding:"1px 6px",borderRadius:99}}>Completed</span>}</div>
                        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>Date given: {formatDate(v.date)}</div>
                        {v.nextDate&&!v.completed&&<div style={{fontSize:11,color:showOverdue?"#E24B4A":isSoon?"#BA7517":"var(--color-text-secondary)",marginTop:1}}>{showOverdue?"⚠️ Overdue: ":isSoon?"⏰ Due soon: ":"Next due: "}{formatDate(v.nextDate)}</div>}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        {showOverdue&&<button onClick={()=>updateDog("vaccines",activeDog.vaccines.map((x,j)=>j===i?{...x,completed:true}:x))} style={{background:"none",border:"1px solid #1D9E75",borderRadius:6,cursor:"pointer",color:"#1D9E75",fontSize:11,padding:"3px 8px"}}>✓ Mark done</button>}
                        <button onClick={()=>{setEditVaccineIdx(i);setEditVaccine({name:v.name,date:v.date,nextDate:v.nextDate});}} style={{background:"none",border:"1px solid var(--color-border-secondary)",borderRadius:6,cursor:"pointer",color:"var(--color-text-secondary)",fontSize:11,padding:"3px 8px"}}>Edit</button>
                        <button onClick={()=>updateDog("vaccines",activeDog.vaccines.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {showAddVaccine?(
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Add Vaccination Record</div>
                    <button onClick={()=>setShowPuppySchedule(!showPuppySchedule)} style={{fontSize:11,padding:"4px 10px",borderRadius:99,border:"1.5px solid #534AB7",background:showPuppySchedule?"#534AB7":"var(--color-background-primary)",color:showPuppySchedule?"#fff":"#534AB7",cursor:"pointer"}}>🐾 Puppy Schedule</button>
                  </div>
                  {showPuppySchedule&&(
                    <div style={{background:"#EEEDFE",borderRadius:"var(--border-radius-md)",padding:"10px 12px"}}>
                      <div style={{fontSize:12,fontWeight:500,color:"#3C3489",marginBottom:8}}>Puppy Vaccination Schedule</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {PUPPY_VACCINES.map(pv=>(
                          <div key={pv.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff",borderRadius:6,padding:"8px 10px"}}>
                            <div><div style={{fontSize:12,fontWeight:500,color:"#3C3489"}}>{pv.name}</div><div style={{fontSize:11,color:"#534AB7",marginTop:1}}>{pv.note}</div></div>
                            <button onClick={()=>{const dob=activeDog?.dob;let sd="";if(dob){const d=new Date(dob);d.setDate(d.getDate()+pv.weekMin*7);sd=d.toISOString().split("T")[0];}const sc=VACCINE_SCHEDULE[pv.name];setNewVaccine({name:pv.name,date:sd,nextDate:sd&&sc?addDays(sd,sc.intervalDays):""});setShowPuppySchedule(false);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:"#534AB7",color:"#fff",cursor:"pointer"}}>Use</button>
                          </div>
                        ))}
                      </div>
                      {!activeDog?.dob&&<div style={{fontSize:11,color:"#534AB7",marginTop:6}}>💡 Add Date of Birth in Info tab for auto-calculated dates</div>}
                    </div>
                  )}
                  <div>{lbl("Vaccine Name")}
                    <input value={newVaccine.name} onChange={e=>{const name=e.target.value;const sc=VACCINE_SCHEDULE[name];setNewVaccine(p=>({...p,name,nextDate:sc&&p.date?addDays(p.date,sc.intervalDays):p.nextDate}));}} placeholder="C5, Rabies, Lepto..." list="vaccine-list" style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                    <datalist id="vaccine-list">{Object.keys(VACCINE_SCHEDULE).map(v=><option key={v} value={v}/>)}</datalist>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Date Given")}<input type="date" value={newVaccine.date} onChange={e=>{const date=e.target.value;const sc=VACCINE_SCHEDULE[newVaccine.name];setNewVaccine(p=>({...p,date,nextDate:sc&&date?addDays(date,sc.intervalDays):p.nextDate}));}} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                    <div>{lbl("Next Due Date")}<input type="date" value={newVaccine.nextDate} onChange={e=>setNewVaccine(p=>({...p,nextDate:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:VACCINE_SCHEDULE[newVaccine.name]&&newVaccine.date?"1.5px solid #AFA9EC":"1px solid var(--color-border-secondary)",background:VACCINE_SCHEDULE[newVaccine.name]&&newVaccine.date?"#EEEDFE":"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                      {VACCINE_SCHEDULE[newVaccine.name]&&newVaccine.date&&<div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto-calculated: {VACCINE_SCHEDULE[newVaccine.name].label}</div>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={addVaccine} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Add</button>
                    <button onClick={()=>{setShowAddVaccine(false);setShowPuppySchedule(false);}} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowAddVaccine(true)} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Vaccination Record</button>
              )}
            </div>
          )}

          {/* WORMING */}
          {tab==="worming"&&(
            <div>
              {(activeDog.wormRecords||[]).length===0&&!showAddWorm&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No worming records yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {(activeDog.wormRecords||[]).map(w=>{
                  const dl=daysUntil(w.nextDate); const isOD=dl!==null&&dl<0; const isSoon=dl!==null&&!isOD&&dl<=30;
                  if(editWormId===w.id) return(
                    <div key={w.id} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Edit Worming Record</div>
                      <input value={editWorm.name} onChange={e=>setEditWorm(p=>({...p,name:e.target.value}))} list="worm-edit-list" style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                      <datalist id="worm-edit-list">{Object.keys(WORMING_SCHEDULE).map(v=><option key={v} value={v}/>)}</datalist>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>{lbl("Date Given")}<input type="date" value={editWorm.date} onChange={e=>setEditWorm(p=>({...p,date:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                        <div>{lbl("Next Due")}<input type="date" value={editWorm.nextDate} onChange={e=>setEditWorm(p=>({...p,nextDate:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                      </div>
                      <input value={editWorm.notes} onChange={e=>setEditWorm(p=>({...p,notes:e.target.value}))} placeholder="Notes..." style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>saveEditWorm(w.id)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:12,cursor:"pointer"}}>Save</button>
                        <button onClick={()=>setEditWormId(null)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>Cancel</button>
                      </div>
                    </div>
                  );
                  return(
                    <div key={w.id} style={{background:"var(--color-background-primary)",border:`1px solid ${isOD?"#F09595":isSoon?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:500}}>🐛 {w.name}</div>
                        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>Date given: {formatDate(w.date)}</div>
                        {w.nextDate&&<div style={{fontSize:11,color:isOD?"#E24B4A":isSoon?"#BA7517":"var(--color-text-secondary)",marginTop:1}}>{isOD?"⚠️ Overdue: ":isSoon?"⏰ Due soon: ":"Next due: "}{formatDate(w.nextDate)}</div>}
                        {w.notes&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:1}}>📝 {w.notes}</div>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{setEditWormId(w.id);setEditWorm({name:w.name,date:w.date,nextDate:w.nextDate,notes:w.notes});}} style={{background:"none",border:"1px solid var(--color-border-secondary)",borderRadius:6,cursor:"pointer",color:"var(--color-text-secondary)",fontSize:11,padding:"3px 8px"}}>Edit</button>
                        <button onClick={()=>updateDog("wormRecords",(activeDog.wormRecords||[]).filter(x=>x.id!==w.id))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {showAddWorm?(
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Add Worming Record</div>
                  <div>{lbl("Product Name")}
                    <input value={newWorm.name} onChange={e=>{const name=e.target.value;const sc=WORMING_SCHEDULE[name];setNewWorm(p=>({...p,name,nextDate:sc&&p.date?addDays(p.date,sc.intervalDays):p.nextDate}));}} placeholder="Milbemax, Drontal..." list="worm-add-list" style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                    <datalist id="worm-add-list">{Object.keys(WORMING_SCHEDULE).map(v=><option key={v} value={v}/>)}</datalist>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Date Given")}<input type="date" value={newWorm.date} onChange={e=>{const date=e.target.value;const sc=WORMING_SCHEDULE[newWorm.name];setNewWorm(p=>({...p,date,nextDate:sc&&date?addDays(date,sc.intervalDays):p.nextDate}));}} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                    <div>{lbl("Next Due Date")}<input type="date" value={newWorm.nextDate} onChange={e=>setNewWorm(p=>({...p,nextDate:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:WORMING_SCHEDULE[newWorm.name]&&newWorm.date?"1.5px solid #AFA9EC":"1px solid var(--color-border-secondary)",background:WORMING_SCHEDULE[newWorm.name]&&newWorm.date?"#EEEDFE":"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                      {WORMING_SCHEDULE[newWorm.name]&&newWorm.date&&<div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto-calculated: {WORMING_SCHEDULE[newWorm.name].label}</div>}
                    </div>
                  </div>
                  <div>{lbl("Notes")}{inp(newWorm.notes,v=>setNewWorm(p=>({...p,notes:v})),"Weight, dose, any reactions...")}</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={addWorm} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Add</button>
                    <button onClick={()=>setShowAddWorm(false)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowAddWorm(true)} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Worming Record</button>
              )}
            </div>
          )}

          {/* HEALTH */}
          {tab==="health"&&(
            <div>
              {lbl("Health Notes")}
              <textarea value={activeDog.healthNotes} onChange={e=>updateDog("healthNotes",e.target.value)} placeholder="Allergies, chronic conditions, current medications, vet notes..." rows={6} style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,resize:"vertical",outline:"none",lineHeight:1.6,fontFamily:"var(--font-sans)"}}/>
            </div>
          )}

          {/* HEAT CYCLE */}
          {tab==="heat"&&(
            <div>
              {activeDog.heatRecords.length===0&&!showAddHeat&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No heat cycle records yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {activeDog.heatRecords.map((h,i)=>{
                  const dl=daysUntil(h.nextHeat); const isOD=dl!==null&&dl<0; const isSoon=dl!==null&&!isOD&&dl<=30;
                  const w=getMatingWindow(activeDog.breed); const mateEnd=addDays(h.lastHeat,w.to);
                  const wF=h.matingDate?addDays(h.matingDate,63-WHELP_TOLERANCE):""; const wT=h.matingDate?addDays(h.matingDate,63+WHELP_TOLERANCE):"";
                  return(
                    <div key={h.id} style={{background:"var(--color-background-primary)",border:`1px solid ${isOD?"#F09595":isSoon?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>🌡️ Heat Cycle {activeDog.heatRecords.length-i}</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px"}}>
                            {h.lastHeat&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Last heat: <span style={{color:"var(--color-text-primary)"}}>{formatDate(h.lastHeat)}</span></div>}
                            {h.nextHeat&&<div style={{fontSize:11,color:isOD?"#E24B4A":isSoon?"#BA7517":"var(--color-text-secondary)"}}>Next heat: {formatDate(h.nextHeat)}{dl!==null&&` · ${urgencyLabel(dl)}`}</div>}
                            {h.cycleLength&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Cycle: <span style={{color:"var(--color-text-primary)"}}>{h.cycleLength} months</span></div>}
                            {h.readyToMate&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Ready to mate: <span style={{color:"#0F6E56",fontWeight:500}}>{formatDateRange(h.readyToMate,mateEnd)}</span></div>}
                            {h.matingDate&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Mating date: <span style={{color:"#534AB7",fontWeight:500}}>{formatDate(h.matingDate)}</span></div>}
                            {h.expectedWhelp&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Expected whelp: <span style={{color:"var(--color-text-primary)"}}>{formatDateRange(wF,wT)}</span></div>}
                            {h.actualWhelp&&<div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Actual whelp: <span style={{color:"#1D9E75",fontWeight:500}}>{formatDate(h.actualWhelp)}</span></div>}
                          </div>
                          {h.notes&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:6}}>📝 {h.notes}</div>}
                        </div>
                        <button onClick={()=>updateDog("heatRecords",activeDog.heatRecords.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16,marginLeft:8}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {showAddHeat?(
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
                  {activeDog.breed&&activeDog.breed!=="Other"&&<div style={{background:"#EEEDFE",borderRadius:"var(--border-radius-md)",padding:"8px 12px",fontSize:12,color:"#3C3489"}}>🐾 <strong>{activeDog.breed}</strong> — mating window: day {getMatingWindow(activeDog.breed).from}–{getMatingWindow(activeDog.breed).to} · gestation: 63 days · cycle: {getBreedCycle(activeDog.breed).label}</div>}
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Heat Cycle</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Last Heat Date")}<input type="date" value={newHeat.lastHeat} onChange={e=>{const v=e.target.value;const w=getMatingWindow(activeDog.breed);const cy=getBreedCycle(activeDog.breed);setNewHeat(p=>({...p,lastHeat:v,readyToMate:v?addDays(v,w.from):p.readyToMate,nextHeat:v?addDays(v,cy.days):p.nextHeat}));}} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                    <div>{lbl("Next Heat (estimated)")}<input type="date" value={newHeat.nextHeat} onChange={e=>setNewHeat(p=>({...p,nextHeat:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1.5px solid #AFA9EC",background:"#EEEDFE",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/>
                      {newHeat.lastHeat&&<div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto-calculated: {getBreedCycle(activeDog.breed).label} cycle</div>}
                    </div>
                    <div>{lbl("Cycle Length (months)")}{inp(newHeat.cycleLength,v=>setNewHeat(p=>({...p,cycleLength:v})),"6")}</div>
                  </div>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Mating</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Ready to Mate (estimated)")}{autoInp(newHeat.readyToMate,v=>setNewHeat(p=>({...p,readyToMate:v})),newHeat.lastHeat?`Window: ${formatDateRange(addDays(newHeat.lastHeat,getMatingWindow(activeDog.breed).from),addDays(newHeat.lastHeat,getMatingWindow(activeDog.breed).to))} (day ${getMatingWindow(activeDog.breed).from}–${getMatingWindow(activeDog.breed).to})`:"")}</div>
                    <div>{lbl("Successful Mating Date")}<input type="date" value={newHeat.matingDate} onChange={e=>{const v=e.target.value;setNewHeat(p=>({...p,matingDate:v,expectedWhelp:v?addDays(v,63):p.expectedWhelp}));}} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                  </div>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Whelping</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Expected Whelp Date")}{autoInp(newHeat.expectedWhelp,v=>setNewHeat(p=>({...p,expectedWhelp:v})),newHeat.matingDate?`Range: ${formatDateRange(addDays(newHeat.matingDate,63-WHELP_TOLERANCE),addDays(newHeat.matingDate,63+WHELP_TOLERANCE))} (63 ± ${WHELP_TOLERANCE} days)`:"")}</div>
                    <div>{lbl("Actual Whelp Date")}{inp(newHeat.actualWhelp,v=>setNewHeat(p=>({...p,actualWhelp:v})),"","date")}</div>
                  </div>
                  <div>{lbl("Notes")}{inp(newHeat.notes,v=>setNewHeat(p=>({...p,notes:v})),"Behaviour, discharge, duration...")}</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{if(!newHeat.lastHeat)return;updateDog("heatRecords",[{id:genId(),...newHeat},...activeDog.heatRecords]);setNewHeat({lastHeat:"",nextHeat:"",cycleLength:"",notes:"",readyToMate:"",matingDate:"",expectedWhelp:"",actualWhelp:""});setShowAddHeat(false);}} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Add Record</button>
                    <button onClick={()=>setShowAddHeat(false)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowAddHeat(true)} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Heat Cycle Record</button>
              )}
            </div>
          )}

          {/* LITTER — dùng LitterTab component */}
          {tab==="litter"&&(
            <LitterTab
              litters={activeDog.litters||[]}
              damName={activeDog.name}
              onChange={(updated)=>updateDog("litters",updated)}
            />
          )}

          {/* GALLERY */}
          {tab==="gallery"&&(
            <div>
              <input ref={galleryRef} type="file" accept="image/*,video/*" multiple onChange={handleGallery} style={{display:"none"}}/>
              <button onClick={()=>galleryRef.current?.click()} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer",marginBottom:14}}>+ Upload Photos / Videos</button>
              {activeDog.gallery.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No photos or videos yet</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {activeDog.gallery.map(item=>(
                  <div key={item.id} style={{position:"relative",borderRadius:"var(--border-radius-md)",overflow:"hidden",background:"var(--color-background-secondary)",aspectRatio:"1",cursor:"pointer"}} onClick={()=>setLightbox(item)}>
                    {item.type==="image"
                      ?<img src={item.url} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      :<video src={item.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    }
                    {item.type==="video"&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:24,pointerEvents:"none"}}>▶️</div>}
                    <button onClick={e=>{e.stopPropagation();removeGallery(item.id);}} style={{position:"absolute",top:4,right:4,width:22,height:22,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",cursor:"pointer",color:"#fff",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DOCUMENTS */}
          {tab==="docs"&&(
            <div>
              <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Upload Document</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>{lbl("Document Name (optional)")}<input value={newDoc.name} onChange={e=>setNewDoc(p=>({...p,name:e.target.value}))} placeholder="Leave blank to use filename..." style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}/></div>
                  <div>{lbl("Document Type")}<select value={newDoc.docType} onChange={e=>setNewDoc(p=>({...p,docType:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>{DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                </div>
                <label style={{display:"block",width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer",textAlign:"center",boxSizing:"border-box"}}>
                  📎 Choose File to Upload
                  <input ref={docRef} type="file" accept=".pdf,.jpg,.png,.doc,.docx" onChange={handleDoc} style={{display:"none"}}/>
                </label>
              </div>
              {activeDog.documents.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No documents yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {activeDog.documents.map(d=>(
                  <div key={d.id} style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:500}}>{docIcon(d.fileType)} {d.name}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{d.docType} · {d.date}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <a href={d.url} download={d.name} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid var(--color-border-secondary)",color:"var(--color-text-secondary)",textDecoration:"none"}}>⬇ Download</a>
                      <button onClick={()=>removeDoc(d.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REMINDERS */}
          {tab==="reminders"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,fontWeight:500}}>🔔 Upcoming Reminders</div>
                <button onClick={()=>setShowReminderSettings(o=>!o)} style={{fontSize:11,padding:"4px 10px",borderRadius:99,border:"1.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",cursor:"pointer"}}>⚙️ Settings</button>
              </div>

              {showReminderSettings&&(
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Reminder Settings</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Vaccine reminder")}<select value={vaccineReminder.days} onChange={e=>setVaccineReminder(REMINDER_OPTIONS.find(r=>r.days===+e.target.value)||REMINDER_OPTIONS[0])} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>{REMINDER_OPTIONS.map(r=><option key={r.days} value={r.days}>{r.label}</option>)}</select></div>
                    <div>{lbl("Heat cycle reminder")}<select value={heatReminder.days} onChange={e=>setHeatReminder(REMINDER_OPTIONS.find(r=>r.days===+e.target.value)||REMINDER_OPTIONS[2])} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>{REMINDER_OPTIONS.map(r=><option key={r.days} value={r.days}>{r.label}</option>)}</select></div>
                  </div>
                </div>
              )}

              {reminderCount===0&&(
                <div style={{textAlign:"center",padding:"32px 0",color:"var(--color-text-tertiary)",fontSize:13}}>
                  <div style={{fontSize:32,marginBottom:8}}>✅</div>
                  No upcoming reminders within the selected timeframe
                </div>
              )}

              {vaccineAlerts.length>0&&(
                <div>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Vaccines</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {vaccineAlerts.map((a,i)=>{
                      const uc=urgencyColor(a.daysLeft);
                      return(
                        <div key={i} style={{background:uc.bg,border:`1px solid ${uc.border}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:500,color:uc.text}}>💉 {a.name}</div>
                            <div style={{fontSize:11,color:uc.text,marginTop:2}}>Due: {formatDate(a.dueDate)}</div>
                          </div>
                          <span style={{background:uc.badge,color:"#fff",fontSize:11,padding:"3px 10px",borderRadius:99,fontWeight:500}}>{urgencyLabel(a.daysLeft)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {heatAlerts.length>0&&(
                <div>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Heat Cycle</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {heatAlerts.map((a,i)=>{
                      const uc=urgencyColor(a.daysLeft);
                      return(
                        <div key={i} style={{background:uc.bg,border:`1px solid ${uc.border}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:500,color:uc.text}}>🌡️ Next Heat Cycle</div>
                            <div style={{fontSize:11,color:uc.text,marginTop:2}}>Expected: {formatDate(a.nextHeat)}</div>
                            {a.notes&&<div style={{fontSize:11,color:uc.text,marginTop:1}}>📝 {a.notes}</div>}
                          </div>
                          <span style={{background:uc.badge,color:"#fff",fontSize:11,padding:"3px 10px",borderRadius:99,fontWeight:500}}>{urgencyLabel(a.daysLeft)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
}
