import { useState, useRef, useEffect } from "react";
import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

const KENNELS = Array.from({ length: 13 }, (_, i) => `Kennel ${i + 1}`);
const BREED_LIST = ["Labrador Retriever","German Shepherd","Golden Retriever","Border Collie","French Bulldog","Bulldog","Poodle","Beagle","Rottweiler","Siberian Husky","Other"];
const DOC_TYPES = ["Vet Records / Vaccination Book","Breed Certificate","Test Results","Hip and Elbow Scores","Other"];
const VACCINE_SCHEDULE: Record<string, {intervalDays: number; label: string}> = {
  "C5": {intervalDays: 365, label: "Annual"},
  "C3": {intervalDays: 365, label: "Annual"},
  "Rabies": {intervalDays: 365, label: "Annual"},
  "Lepto": {intervalDays: 365, label: "Annual"},
  "Kennel Cough": {intervalDays: 365, label: "Annual"},
  "Heartworm": {intervalDays: 365, label: "Annual"},
  "Puppy 1st": {intervalDays: 28, label: "4 weeks (Puppy)"},
  "Puppy 2nd": {intervalDays: 28, label: "4 weeks (Puppy)"},
  "Puppy Final": {intervalDays: 365, label: "Annual (after final)"},
};

const PUPPY_VACCINES = [
  {name: "Puppy 1st", weekMin: 6, weekMax: 7, note: "First vaccination at 6–7 weeks"},
  {name: "Puppy 2nd", weekMin: 10, weekMax: 12, note: "Second vaccination at 10–12 weeks"},
  {name: "Puppy Final", weekMin: 14, weekMax: 16, note: "Final vaccination at 14–16 weeks"},
]; Record<string, {from:number;to:number}> = {"Labrador Retriever":{from:10,to:14},"German Shepherd":{from:12,to:15},"default":{from:10,to:14}};
const BREED_CYCLE: Record<string, {days:number;label:string}> = {
  "Labrador Retriever": {days:182, label:"~6 months"},
  "German Shepherd": {days:182, label:"~6 months"},
  "default": {days:182, label:"~6 months"},
};
const getBreedCycle = (breed: string) => BREED_CYCLE[breed] || BREED_CYCLE["default"];
const WHELP_TOLERANCE = 3;
const REMINDER_OPTIONS = [{label:"7 days before",days:7},{label:"14 days before",days:14},{label:"1 month before",days:30},{label:"2 months before",days:60},{label:"3 months before",days:90}];
const CARE_STEPS = [{key:"cleaning",icon:"🧹",label:"Cleaning"},{key:"feeding",icon:"🍖",label:"Feeding"},{key:"grooming",icon:"🛁",label:"Grooming"},{key:"health",icon:"🩺",label:"Health"}];
const TASK_COUNT = 4;

const getMatingWindow = (breed: string) => BREED_MATING_WINDOW[breed] || BREED_MATING_WINDOW["default"];
const addDays = (dateStr: string, days: number) => { if (!dateStr) return ""; const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; };
const formatDate = (dateStr: string) => { if (!dateStr) return ""; return new Date(dateStr).toLocaleDateString("en-AU", {day:"numeric",month:"short",year:"numeric"}); };
const formatDateRange = (from: string, to: string) => { if (!from||!to) return ""; const f = new Date(from).toLocaleDateString("en-AU",{day:"numeric",month:"short"}); const t = new Date(to).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}); return `${f} – ${t}`; };
const daysUntil = (dateStr: string) => { if (!dateStr) return null; const diff = new Date(dateStr).getTime() - new Date().setHours(0,0,0,0); return Math.ceil(diff/(1000*60*60*24)); };

type VaccineRecord = {name:string;date:string;nextDate:string};
type MediaItem = {id:string;type:"image"|"video";url:string;name:string;date:string};
type DocItem = {id:string;name:string;docType:string;date:string;url:string;fileType:string};
type HeatRecord = {id:string;lastHeat:string;nextHeat:string;cycleLength:string;notes:string;readyToMate:string;matingDate:string;expectedWhelp:string;actualWhelp:string};
type Dog = {id:string;name:string;breed:string;dob:string;weight:string;chipNumber:string;regNumber:string;gender:string;color:string;avatar:string;kennel:string;vaccines:VaccineRecord[];healthNotes:string;gallery:MediaItem[];documents:DocItem[];heatRecords:HeatRecord[]};

function newDog(id: string): Dog { return {id,name:"",breed:"",dob:"",weight:"",chipNumber:"",regNumber:"",gender:"",color:"",avatar:"",kennel:"",vaccines:[],healthNotes:"",gallery:[],documents:[],heatRecords:[]}; }
function genId() { return Date.now().toString(36).toUpperCase(); }

export default function DogProfile() {
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [todayJournal, setTodayJournal] = useState<any>(null);
  const [activeDogId, setActiveDogId] = useState<string|null>(null);
  const [tab, setTab] = useState<"info"|"vaccine"|"health"|"heat"|"gallery"|"docs"|"reminders">("info");
  const [saved, setSaved] = useState(false);
  const [newVaccine, setNewVaccine] = useState({name:"",date:"",nextDate:""});
  const [showPuppySchedule, setShowPuppySchedule] = useState(false);
  const [showAddVaccine, setShowAddVaccine] = useState(false);
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<MediaItem|null>(null);
  const [newDoc, setNewDoc] = useState({name:"",docType:DOC_TYPES[0]});
  const [newHeat, setNewHeat] = useState({lastHeat:"",nextHeat:"",cycleLength:"",notes:"",readyToMate:"",matingDate:"",expectedWhelp:"",actualWhelp:""});
  const [showAddHeat, setShowAddHeat] = useState(false);
  const [vaccineReminder, setVaccineReminder] = useState(REMINDER_OPTIONS[0]);
  const [heatReminder, setHeatReminder] = useState(REMINDER_OPTIONS[2]);
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const activeDog = dogs.find(d => d.id === activeDogId) || null;

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [profileSnap, journalSnap] = await Promise.all([
          getDoc(doc(db, "dogProfiles", "all")),
          getDoc(doc(db, "journals", new Date().toISOString().split("T")[0])),
        ]);
        if (profileSnap.exists() && profileSnap.data().dogs) setDogs(profileSnap.data().dogs);
        if (journalSnap.exists()) setTodayJournal(journalSnap.data());
      } catch(e) { console.error(e); }
      setLoadingData(false);
    };
    loadAll();
  }, []);

  const saveToFirebase = async (updatedDogs: Dog[]) => {
    setSyncing(true);
    try {
      await setDoc(doc(db, "dogProfiles", "all"), {dogs: updatedDogs, updatedAt: new Date().toISOString()});
      setSyncMsg("✓ Saved");
      setTimeout(() => setSyncMsg(""), 2000);
    } catch(e) { setSyncMsg("Error!"); }
    setSyncing(false);
  };

  const addDog = () => { const dog = newDog("DOG-"+genId()); const updated = [...dogs, dog]; setDogs(updated); saveToFirebase(updated); setActiveDogId(dog.id); setTab("info"); setSaved(false); };
  const updateDog = (field: keyof Dog, value: any) => { setDogs(prev => prev.map(d => d.id===activeDogId ? {...d,[field]:value} : d)); setSaved(false); };
  const deleteDog = (id: string) => { if (!confirm("Delete this profile?")) return; const updated = dogs.filter(d => d.id!==id); setDogs(updated); saveToFirebase(updated); setActiveDogId(null); };
  const [filterKennel, setFilterKennel] = useState("All"); if (!newVaccine.name||!newVaccine.date||!activeDog) return; updateDog("vaccines",[...activeDog.vaccines,newVaccine]); setNewVaccine({name:"",date:"",nextDate:""}); setShowAddVaccine(false); };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = ev => updateDog("avatar", ev.target?.result as string); r.readAsDataURL(file); };
  const handleGallery = (e: React.ChangeEvent<HTMLInputElement>) => { Array.from(e.target.files||[]).forEach(file => { const r = new FileReader(); const isVideo = file.type.startsWith("video/"); r.onload = ev => { const item: MediaItem = {id:genId(),type:isVideo?"video":"image",url:ev.target?.result as string,name:file.name,date:new Date().toLocaleDateString("en-AU")}; setDogs(prev => prev.map(d => d.id===activeDogId ? {...d,gallery:[...d.gallery,item]} : d)); }; r.readAsDataURL(file); }); setSaved(false); };
  const handleDoc = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file||!activeDog) return; const r = new FileReader(); r.onload = ev => { const item: DocItem = {id:genId(),name:newDoc.name||file.name,docType:newDoc.docType,date:new Date().toLocaleDateString("en-AU"),url:ev.target?.result as string,fileType:file.type}; setDogs(prev => prev.map(d => d.id===activeDogId ? {...d,documents:[...d.documents,item]} : d)); setNewDoc({name:"",docType:DOC_TYPES[0]}); }; r.readAsDataURL(file); setSaved(false); };

  const removeGallery = (id: string) => updateDog("gallery", activeDog!.gallery.filter(g => g.id!==id));
  const removeDoc = (id: string) => updateDog("documents", activeDog!.documents.filter(d => d.id!==id));

  const age = (dob: string) => { if (!dob) return ""; const months = Math.floor((Date.now()-new Date(dob).getTime())/(1000*60*60*24*30)); if (months<12) return `${months} months old`; return `${Math.floor(months/12)} yr ${months%12} mo`; };
  const filteredDogs = dogs.filter(d => { const ms = d.name.toLowerCase().includes(search.toLowerCase())||d.id.toLowerCase().includes(search.toLowerCase()); const mk = filterKennel==="All"||d.kennel===filterKennel; return ms&&mk; });

  const inp = (val: string, onChange: (v:string)=>void, placeholder: string, type="text") => (
    <input type={type} value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
  );
  const autoInp = (val: string, onChange: (v:string)=>void, hint: string) => (
    <div>
      <input type="date" value={val} onChange={e=>onChange(e.target.value)} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1.5px solid #AFA9EC",background:"#EEEDFE",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
      {hint && <div style={{fontSize:10,color:"#534AB7",marginTop:2}}>{hint}</div>}
    </div>
  );
  const lbl = (text: string) => <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{text}</div>;
  const docIcon = (ft: string) => ft.includes("pdf")?"📄":ft.includes("image")?"🖼️":ft.includes("word")?"📝":"📎";

  const urgencyColor = (days: number) => {
    if (days<0) return {bg:"#FCEBEB",border:"#F09595",text:"#A32D2D",badge:"#E24B4A"};
    if (days<=7) return {bg:"#FAECE7",border:"#F0997B",text:"#993C1D",badge:"#D85A30"};
    if (days<=14) return {bg:"#FAEEDA",border:"#FAC775",text:"#633806",badge:"#BA7517"};
    return {bg:"#E6F1FB",border:"#85B7EB",text:"#0C447C",badge:"#378ADD"};
  };
  const urgencyLabel = (days: number) => { if (days<0) return `Overdue ${Math.abs(days)}d`; if (days===0) return "Due today!"; if (days===1) return "Due tomorrow"; return `In ${days} days`; };

  const vaccineAlerts = activeDog ? activeDog.vaccines.filter(v => { const dl=daysUntil(v.nextDate); return dl!==null&&dl<=vaccineReminder.days; }).map(v => ({name:v.name,dueDate:v.nextDate,daysLeft:daysUntil(v.nextDate)!})) : [];
  const heatAlerts = activeDog ? activeDog.heatRecords.filter(h => { const dl=daysUntil(h.nextHeat); return dl!==null&&dl<=heatReminder.days; }).map(h => ({nextHeat:h.nextHeat,daysLeft:daysUntil(h.nextHeat)!,notes:h.notes})) : [];
  const reminderCount = vaccineAlerts.length + heatAlerts.length;

  const TABS = [
    {k:"info",label:"📋 Info"},{k:"vaccine",label:"💉 Vaccines"},{k:"health",label:"🩺 Health"},
    {k:"heat",label:"🌡️ Heat Cycle"},{k:"gallery",label:"🖼️ Gallery"},{k:"docs",label:"📁 Documents"},
    {k:"reminders",label:`🔔 Reminders${reminderCount>0?` (${reminderCount})`:""}`},
  ];

  // Today's care status for a kennel
  const getTodayCare = (kennel: string) => {
    if (!todayJournal?.checks?.[kennel]) return null;
    const kc = todayJournal.checks[kennel];
    const steps = CARE_STEPS.map(s => ({
      ...s,
      done: kc[s.key] ? Object.values(kc[s.key]).filter(Boolean).length : 0,
    }));
    const totalDone = steps.reduce((a, s) => a + s.done, 0);
    const pct = Math.round((totalDone / (CARE_STEPS.length * TASK_COUNT)) * 100);
    return { steps, pct, allDone: pct === 100 };
  };

  if (loadingData) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,fontFamily:"var(--font-sans)",color:"var(--color-text-secondary)"}}>Loading profiles...</div>;

  return (
    <div style={{fontFamily:"var(--font-sans)",color:"var(--color-text-primary)",maxWidth:680,margin:"0 auto",padding:"16px 12px"}}>

      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:600,width:"100%",position:"relative"}}>
            {lightbox.type==="image" ? <img src={lightbox.url} alt="" style={{width:"100%",borderRadius:8,maxHeight:"80vh",objectFit:"contain"}} /> : <video src={lightbox.url} controls style={{width:"100%",borderRadius:8}} />}
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
          {syncMsg && <span style={{fontSize:12,color:"#1D9E75"}}>{syncMsg}</span>}
          <button onClick={addDog} style={{padding:"8px 16px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Add Dog</button>
        </div>
      </div>

      {!activeDog && (
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by name or ID..." style={{flex:1,padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
          <select value={filterKennel} onChange={e=>setFilterKennel(e.target.value)} style={{padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>
            <option value="All">All Kennels</option>
            {KENNELS.map(k=><option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}

      {!activeDog && (
        <>
          {filteredDogs.length===0 && <div style={{textAlign:"center",padding:"40px 0",color:"var(--color-text-tertiary)",fontSize:13}}>{dogs.length===0?"No profiles yet — click + Add Dog to get started":"No results found"}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filteredDogs.map(d => {
              const care = d.kennel ? getTodayCare(d.kennel) : null;
              return (
                <div key={d.id} onClick={()=>{setActiveDogId(d.id);setTab("info");setSaved(false);}} style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:48,height:48,borderRadius:"50%",overflow:"hidden",background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {d.avatar ? <img src={d.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{fontSize:22}}>🐶</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,fontSize:14}}>{d.name||"Unnamed"}</div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>{[d.breed,d.kennel,d.dob&&age(d.dob)].filter(Boolean).join(" · ")}</div>
                    {care && (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                        <div style={{height:4,width:60,background:"var(--color-border-tertiary)",borderRadius:99}}><div style={{height:"100%",width:care.pct+"%",background:care.allDone?"#1D9E75":"#7F77DD",borderRadius:99}} /></div>
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

      {activeDog && (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <button onClick={()=>setActiveDogId(null)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:13}}>← Back</button>
            <button onClick={()=>deleteDog(activeDog.id)} style={{background:"none",border:"1px solid #F09595",borderRadius:"var(--border-radius-md)",cursor:"pointer",color:"#E24B4A",fontSize:12,padding:"4px 10px"}}>Delete Profile</button>
          </div>

          <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",marginBottom:14,display:"flex",gap:14,alignItems:"center"}}>
            <div style={{position:"relative",flexShrink:0}}>
              <div style={{width:72,height:72,borderRadius:"50%",overflow:"hidden",background:"var(--color-border-tertiary)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--color-border-secondary)"}}>
                {activeDog.avatar ? <img src={activeDog.avatar} alt="dog" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <span style={{fontSize:28}}>🐶</span>}
              </div>
              <label style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:"50%",background:"#534AB7",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                <span style={{color:"#fff",fontSize:12}}>+</span>
                <input type="file" accept="image/*" onChange={handleAvatar} style={{display:"none"}} />
              </label>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:500}}>{activeDog.name||"Unnamed"}</div>
              {activeDog.breed && <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>🐾 {activeDog.breed}{activeDog.gender&&` · ${activeDog.gender}`}</div>}
              {activeDog.dob && <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:1}}>🎂 {age(activeDog.dob)}</div>}
              {activeDog.kennel && <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:1}}>🏠 {activeDog.kennel}</div>}
              <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{background:"#EEEDFE",color:"#3C3489",fontSize:11,padding:"2px 8px",borderRadius:99}}>{activeDog.id}</span>
                {reminderCount>0 && <span style={{background:"#E24B4A",color:"#fff",fontSize:11,padding:"2px 8px",borderRadius:99}}>🔔 {reminderCount}</span>}
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {TABS.map(t => <button key={t.k} onClick={()=>setTab(t.k as any)} style={{padding:"6px 10px",borderRadius:"var(--border-radius-md)",fontSize:12,cursor:"pointer",border:tab===t.k?"1.5px solid #534AB7":"1.5px solid var(--color-border-tertiary)",background:tab===t.k?"#EEEDFE":"var(--color-background-primary)",color:tab===t.k?"#3C3489":"var(--color-text-secondary)"}}>{t.label}</button>)}
          </div>

          {tab==="info" && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* Today's Care Status */}
              {activeDog.kennel && (() => {
                const care = getTodayCare(activeDog.kennel);
                if (!care) return <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",fontSize:13,color:"var(--color-text-tertiary)"}}>📋 No care data today for {activeDog.kennel}</div>;
                return (
                  <div style={{background:care.allDone?"#E1F5EE":"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",border:`1px solid ${care.allDone?"#5DCAA5":"var(--color-border-tertiary)"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontSize:13,fontWeight:500,color:care.allDone?"#085041":"var(--color-text-primary)"}}>📋 Today's Care — {activeDog.kennel}</div>
                      <span style={{fontSize:13,fontWeight:500,color:care.allDone?"#1D9E75":"#534AB7"}}>{care.pct}% {care.allDone?"✅":""}</span>
                    </div>
                    <div style={{height:5,background:"var(--color-border-tertiary)",borderRadius:99,marginBottom:10}}>
                      <div style={{height:"100%",width:care.pct+"%",background:care.allDone?"#1D9E75":"#7F77DD",borderRadius:99}} />
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                      {care.steps.map(s => {
                        const complete = s.done === TASK_COUNT;
                        return (
                          <div key={s.key} style={{textAlign:"center",padding:"6px 4px",borderRadius:6,background:complete?"#C8F0E2":"var(--color-background-primary)",border:`1px solid ${complete?"#5DCAA5":"var(--color-border-tertiary)"}`}}>
                            <div style={{fontSize:16}}>{s.icon}</div>
                            <div style={{fontSize:10,color:complete?"#085041":"var(--color-text-secondary)",marginTop:2}}>{s.label}</div>
                            <div style={{fontSize:11,fontWeight:500,color:complete?"#1D9E75":"var(--color-text-tertiary)"}}>{s.done}/{TASK_COUNT}</div>
                          </div>
                        );
                      })}
                    </div>
                    {todayJournal?.dogNames?.[activeDog.kennel] && (
                      <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:8}}>
                        Dog on record: {todayJournal.dogNames[activeDog.kennel]} · Staff: {todayJournal.assignedStaff?.[activeDog.kennel]||"—"}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>{lbl("Name")}{inp(activeDog.name,v=>updateDog("name",v),"Buddy, Max...")}</div>
                <div>{lbl("Breed")}
                  <select value={activeDog.breed} onChange={e=>updateDog("breed",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>
                    <option value="">-- Select breed --</option>
                    {BREED_LIST.map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>{lbl("Coat Colour")}{inp(activeDog.color,v=>updateDog("color",v),"Golden, White...")}</div>
                <div>{lbl("Gender")}
                  <select value={activeDog.gender} onChange={e=>updateDog("gender",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>
                    <option value="">-- Select --</option>
                    <option>Male</option><option>Female</option>
                  </select>
                </div>
                <div>{lbl("Date of Birth")}{inp(activeDog.dob,v=>updateDog("dob",v),"","date")}</div>
                <div>{lbl("Weight (kg)")}{inp(activeDog.weight,v=>updateDog("weight",v),"5.2")}</div>
                <div>{lbl("Microchip Number")}{inp(activeDog.chipNumber,v=>updateDog("chipNumber",v),"900123456789")}</div>
                <div>{lbl("Registration Number")}{inp(activeDog.regNumber,v=>updateDog("regNumber",v),"ANKC-2024-001")}</div>
              </div>
              <div>{lbl("Current Kennel")}
                <select value={activeDog.kennel} onChange={e=>updateDog("kennel",e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>
                  <option value="">-- Select Kennel --</option>
                  {KENNELS.map(k=><option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
          )}

          {tab==="vaccine" && (
            <div>
              {activeDog.vaccines.length===0&&!showAddVaccine && <div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No vaccination records yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {activeDog.vaccines.map((v,i) => {
                  const dl=daysUntil(v.nextDate); const isOD=dl!==null&&dl<0; const isSoon=dl!==null&&!isOD&&dl<=30;
                  return (
                    <div key={i} style={{background:"var(--color-background-primary)",border:`1px solid ${isOD?"#F09595":isSoon?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:500}}>💉 {v.name}</div>
                        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>Date given: {v.date}</div>
                        {v.nextDate && <div style={{fontSize:11,color:isOD?"#E24B4A":isSoon?"#BA7517":"var(--color-text-secondary)",marginTop:1}}>{isOD?"⚠️ Overdue: ":isSoon?"⏰ Due soon: ":"Next due: "}{v.nextDate}</div>}
                      </div>
                      <button onClick={()=>updateDog("vaccines",activeDog.vaccines.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                    </div>
                  );
                })}
              </div>
              {showAddVaccine ? (
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>

                  {/* Puppy Schedule Banner */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Add Vaccination Record</div>
                    <button onClick={()=>setShowPuppySchedule(!showPuppySchedule)} style={{fontSize:11,padding:"4px 10px",borderRadius:99,border:"1.5px solid #534AB7",background:showPuppySchedule?"#534AB7":"var(--color-background-primary)",color:showPuppySchedule?"#fff":"#534AB7",cursor:"pointer"}}>🐾 Puppy Schedule</button>
                  </div>

                  {/* Puppy Schedule */}
                  {showPuppySchedule && (
                    <div style={{background:"#EEEDFE",borderRadius:"var(--border-radius-md)",padding:"10px 12px"}}>
                      <div style={{fontSize:12,fontWeight:500,color:"#3C3489",marginBottom:8}}>Puppy Vaccination Schedule</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {PUPPY_VACCINES.map(pv => (
                          <div key={pv.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff",borderRadius:6,padding:"8px 10px"}}>
                            <div>
                              <div style={{fontSize:12,fontWeight:500,color:"#3C3489"}}>{pv.name}</div>
                              <div style={{fontSize:11,color:"#534AB7",marginTop:1}}>{pv.note}</div>
                            </div>
                            <button onClick={()=>{
                              const dob = activeDog?.dob;
                              let suggestedDate = "";
                              if (dob) {
                                const dobDate = new Date(dob);
                                dobDate.setDate(dobDate.getDate() + pv.weekMin * 7);
                                suggestedDate = dobDate.toISOString().split("T")[0];
                              }
                              const schedule = VACCINE_SCHEDULE[pv.name];
                              const nextDate = suggestedDate && schedule ? addDays(suggestedDate, schedule.intervalDays) : "";
                              setNewVaccine({name:pv.name, date:suggestedDate, nextDate});
                              setShowPuppySchedule(false);
                            }} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",background:"#534AB7",color:"#fff",cursor:"pointer"}}>Use</button>
                          </div>
                        ))}
                      </div>
                      {!activeDog?.dob && <div style={{fontSize:11,color:"#534AB7",marginTop:6}}>💡 Add Date of Birth in Info tab for auto-calculated dates</div>}
                    </div>
                  )}

                  {/* Vaccine Name */}
                  <div>{lbl("Vaccine Name")}
                    <div style={{display:"flex",gap:8"}}>
                      <input value={newVaccine.name} onChange={e=>{
                        const name = e.target.value;
                        const schedule = VACCINE_SCHEDULE[name];
                        const nextDate = schedule && newVaccine.date ? addDays(newVaccine.date, schedule.intervalDays) : newVaccine.nextDate;
                        setNewVaccine(p=>({...p, name, nextDate}));
                      }} placeholder="C5, Rabies, Lepto..." list="vaccine-list" style={{flex:1,boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
                      <datalist id="vaccine-list">
                        {Object.keys(VACCINE_SCHEDULE).map(v=><option key={v} value={v}/>)}
                      </datalist>
                    </div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div>{lbl("Date Given")}
                      <input type="date" value={newVaccine.date} onChange={e=>{
                        const date = e.target.value;
                        const schedule = VACCINE_SCHEDULE[newVaccine.name];
                        const nextDate = schedule && date ? addDays(date, schedule.intervalDays) : newVaccine.nextDate;
                        setNewVaccine(p=>({...p, date, nextDate}));
                      }} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
                    </div>
                    <div>{lbl("Next Due Date")}
                      <div style={{position:"relative"}}>
                        <input type="date" value={newVaccine.nextDate} onChange={e=>setNewVaccine(p=>({...p,nextDate:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border: VACCINE_SCHEDULE[newVaccine.name] && newVaccine.date ? "1.5px solid #AFA9EC" : "1px solid var(--color-border-secondary)",background: VACCINE_SCHEDULE[newVaccine.name] && newVaccine.date ? "#EEEDFE" : "var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
                        {VACCINE_SCHEDULE[newVaccine.name] && newVaccine.date && <div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto-calculated: {VACCINE_SCHEDULE[newVaccine.name].label}</div>}
                      </div>
                    </div>
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <button onClick={addVaccine} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Add</button>
                    <button onClick={()=>{setShowAddVaccine(false);setShowPuppySchedule(false);}} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>setShowAddVaccine(true)} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Vaccination Record</button>
              )}
            </div>
          )}

          {tab==="health" && (
            <div>
              {lbl("Health Notes")}
              <textarea value={activeDog.healthNotes} onChange={e=>updateDog("healthNotes",e.target.value)} placeholder="Allergies, chronic conditions, current medications, vet notes..." rows={6} style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",border:"1px solid var(--color-border-secondary)",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,resize:"vertical",outline:"none",lineHeight:1.6,fontFamily:"var(--font-sans)"}} />
            </div>
          )}

          {tab==="heat" && (
            <div>
              {activeDog.gender==="Male" && <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px",fontSize:13,color:"var(--color-text-secondary)",marginBottom:12}}>Heat cycle tracking is only applicable for female dogs.</div>}
              {activeDog.gender!=="Male" && (
                <>
                  {activeDog.heatRecords.length===0&&!showAddHeat && <div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No heat cycle records yet</div>}
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                    {activeDog.heatRecords.map((h,i) => {
                      const dl=daysUntil(h.nextHeat); const isOD=dl!==null&&dl<0; const isSoon=dl!==null&&!isOD&&dl<=30;
                      const w=getMatingWindow(activeDog.breed); const mateEnd=addDays(h.lastHeat,w.to);
                      const wFrom=h.matingDate?addDays(h.matingDate,63-WHELP_TOLERANCE):""; const wTo=h.matingDate?addDays(h.matingDate,63+WHELP_TOLERANCE):"";
                      return (
                        <div key={h.id} style={{background:"var(--color-background-primary)",border:`1px solid ${isOD?"#F09595":isSoon?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>🌡️ Heat Cycle {activeDog.heatRecords.length-i}</div>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px"}}>
                                {h.lastHeat && <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Last heat: <span style={{color:"var(--color-text-primary)"}}>{formatDate(h.lastHeat)}</span></div>}
                                {h.nextHeat && <div style={{fontSize:11,color:isOD?"#E24B4A":isSoon?"#BA7517":"var(--color-text-secondary)"}}>Next heat: {formatDate(h.nextHeat)}{dl!==null&&` · ${urgencyLabel(dl)}`}</div>}
                                {h.cycleLength && <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Cycle: <span style={{color:"var(--color-text-primary)"}}>{h.cycleLength} months</span></div>}
                                {h.readyToMate && <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Ready to mate: <span style={{color:"#0F6E56",fontWeight:500}}>{formatDateRange(h.readyToMate,mateEnd)}</span></div>}
                                {h.matingDate && <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Mating date: <span style={{color:"#534AB7",fontWeight:500}}>{formatDate(h.matingDate)}</span></div>}
                                {h.expectedWhelp && <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Expected whelp: <span style={{color:"var(--color-text-primary)"}}>{formatDateRange(wFrom,wTo)}</span></div>}
                                {h.actualWhelp && <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Actual whelp: <span style={{color:"#1D9E75",fontWeight:500}}>{formatDate(h.actualWhelp)}</span></div>}
                              </div>
                              {h.notes && <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:6}}>📝 {h.notes}</div>}
                            </div>
                            <button onClick={()=>updateDog("heatRecords",activeDog.heatRecords.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16,marginLeft:8}}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {showAddHeat ? (
                    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
                      {activeDog.breed&&activeDog.breed!=="Other" && <div style={{background:"#EEEDFE",borderRadius:"var(--border-radius-md)",padding:"8px 12px",fontSize:12,color:"#3C3489"}}>🐾 <strong>{activeDog.breed}</strong> — optimal mating window: day {getMatingWindow(activeDog.breed).from}–{getMatingWindow(activeDog.breed).to} · gestation: 63 days</div>}
                      <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Heat Cycle</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        <div>{lbl("Last Heat Date")}
                          <input type="date" value={newHeat.lastHeat} onChange={e=>{
                            const v=e.target.value;
                            const w=getMatingWindow(activeDog.breed);
                            const cycle=getBreedCycle(activeDog.breed);
                            const estNextHeat = v ? addDays(v, cycle.days) : "";
                            setNewHeat(p=>({...p,lastHeat:v,readyToMate:v?addDays(v,w.from):p.readyToMate,nextHeat:estNextHeat}));
                          }} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
                        </div>
                        <div>{lbl("Next Heat (estimated)")}
                          <div style={{position:"relative"}}>
                            <input type="date" value={newHeat.nextHeat} onChange={e=>setNewHeat(p=>({...p,nextHeat:e.target.value}))} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1.5px solid #AFA9EC",background:"#EEEDFE",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
                            {newHeat.lastHeat && <div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto-calculated: {getBreedCycle(activeDog.breed).label} cycle{activeDog.breed ? ` (${activeDog.breed})` : ""}</div>}
                          </div>
                        </div>
                        <div>{lbl("Cycle Length (months)")}{inp(newHeat.cycleLength,v=>setNewHeat(p=>({...p,cycleLength:v})),"6")}</div>
                      </div>
                      <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Mating</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        <div>{lbl("Ready to Mate (estimated)")}{autoInp(newHeat.readyToMate,v=>setNewHeat(p=>({...p,readyToMate:v})),newHeat.lastHeat?`Window: ${formatDateRange(addDays(newHeat.lastHeat,getMatingWindow(activeDog.breed).from),addDays(newHeat.lastHeat,getMatingWindow(activeDog.breed).to))} (day ${getMatingWindow(activeDog.breed).from}–${getMatingWindow(activeDog.breed).to})`:"")}</div>
                        <div>{lbl("Successful Mating Date")}
                          <input type="date" value={newHeat.matingDate} onChange={e=>{const v=e.target.value;setNewHeat(p=>({...p,matingDate:v,expectedWhelp:v?addDays(v,63):p.expectedWhelp}));}} style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}} />
                        </div>
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
                  ) : (
                    <button onClick={()=>setShowAddHeat(true)} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Heat Cycle Record</button>
                  )}
                </>
              )}
            </div>
          )}

          {tab==="gallery" && (
            <div>
              <input ref={galleryRef} type="file" accept="image/*,video/*" multiple onChange={handleGallery} style={{display:"none"}} />
              <button onClick={()=>galleryRef.current?.click()} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer",marginBottom:14}}>+ Upload Photos / Videos</button>
              {activeDog.gallery.length===0 && <div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No photos or videos yet</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8}}>
                {activeDog.gallery.map(item => (
                  <div key={item.id} style={{position:"relative",aspectRatio:"1",borderRadius:"var(--border-radius-md)",overflow:"hidden",background:"var(--color-background-secondary)",cursor:"pointer"}} onClick={()=>setLightbox(item)}>
                    {item.type==="image" ? <img src={item.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}><span style={{fontSize:28}}>▶️</span><span style={{fontSize:10,color:"var(--color-text-secondary)"}}>Video</span></div>}
                    <button onClick={e=>{e.stopPropagation();removeGallery(item.id);}} style={{position:"absolute",top:4,right:4,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",fontSize:10,cursor:"pointer"}}>✕</button>
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.5)",padding:"3px 6px"}}><div style={{fontSize:10,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.date}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==="docs" && (
            <div>
              <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>{lbl("Document Name")}{inp(newDoc.name,v=>setNewDoc(p=>({...p,name:v})),"File name...")}</div>
                  <div>{lbl("Document Type")}
                    <select value={newDoc.docType} onChange={e=>setNewDoc(p=>({...p,docType:e.target.value}))} style={{width:"100%",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"}}>
                      {DOC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleDoc} style={{display:"none"}} />
                <button onClick={()=>docRef.current?.click()} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>📎 Choose File (PDF, Word, Image)</button>
              </div>
              {activeDog.documents.length===0 && <div style={{textAlign:"center",padding:"24px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No documents uploaded yet</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {activeDog.documents.map(d => (
                  <div key={d.id} style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:24,flexShrink:0}}>{docIcon(d.fileType)}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{d.docType} · {d.date}</div>
                    </div>
                    <a href={d.url} download={d.name} style={{fontSize:18,textDecoration:"none",flexShrink:0}}>⬇️</a>
                    <button onClick={()=>removeDoc(d.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16,flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==="reminders" && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>Alerts for <strong>{activeDog.name||"this dog"}</strong></div>
                <button onClick={()=>setShowReminderSettings(!showReminderSettings)} style={{fontSize:12,padding:"5px 12px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:showReminderSettings?"#EEEDFE":"var(--color-background-primary)",color:showReminderSettings?"#3C3489":"var(--color-text-secondary)",cursor:"pointer"}}>⚙️ Settings</button>
              </div>
              {showReminderSettings && (
                <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    {[{label:"💉 Vaccine",state:vaccineReminder,setState:setVaccineReminder},{label:"🌡️ Heat cycle",state:heatReminder,setState:setHeatReminder}].map(({label,state,setState})=>(
                      <div key={label}>
                        <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:8}}>{label} reminder window</div>
                        {REMINDER_OPTIONS.map(opt=>(
                          <label key={opt.days} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer"}}>
                            <div onClick={()=>setState(opt)} style={{width:16,height:16,borderRadius:"50%",border:state.days===opt.days?"none":"2px solid var(--color-border-secondary)",background:state.days===opt.days?"#534AB7":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                              {state.days===opt.days && <div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}} />}
                            </div>
                            <span style={{fontSize:13,color:state.days===opt.days?"#3C3489":"var(--color-text-primary)"}}>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {reminderCount===0 && (
                <div style={{textAlign:"center",padding:"40px 0"}}>
                  <div style={{fontSize:36,marginBottom:10}}>✅</div>
                  <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>All clear!</div>
                  <div style={{fontSize:13,color:"var(--color-text-tertiary)"}}>No upcoming reminders within the selected window.</div>
                </div>
              )}
              {vaccineAlerts.length>0 && (
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>💉 Vaccine Alerts</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {vaccineAlerts.sort((a,b)=>a.daysLeft-b.daysLeft).map((a,i)=>{const c=urgencyColor(a.daysLeft);return(<div key={i} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:500,color:c.text}}>{a.name} vaccine</div><div style={{fontSize:11,color:c.text,opacity:0.8,marginTop:2}}>Due: {formatDate(a.dueDate)}</div></div><span style={{background:c.badge,color:"#fff",fontSize:12,fontWeight:500,padding:"3px 10px",borderRadius:99}}>{urgencyLabel(a.daysLeft)}</span></div>);})}
                  </div>
                </div>
              )}
              {heatAlerts.length>0 && (
                <div>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>🌡️ Heat Cycle Alerts</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {heatAlerts.sort((a,b)=>a.daysLeft-b.daysLeft).map((a,i)=>{const c=urgencyColor(a.daysLeft);return(<div key={i} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:500,color:c.text}}>Heat cycle expected</div>{a.notes&&<div style={{fontSize:11,color:c.text,opacity:0.8,marginTop:1}}>{a.notes}</div>}<div style={{fontSize:11,color:c.text,opacity:0.8,marginTop:2}}>Expected: {formatDate(a.nextHeat)}</div></div><span style={{background:c.badge,color:"#fff",fontSize:12,fontWeight:500,padding:"3px 10px",borderRadius:99}}>{urgencyLabel(a.daysLeft)}</span></div>);})}
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
            <button onClick={()=>setSaved(true)} style={{width:"100%",padding:"11px",borderRadius:"var(--border-radius-md)",border:"none",background:saved?"#1D9E75":"#534AB7",color:"#fff",fontSize:14,fontWeight:500,cursor:"pointer"}}>{saved?"✓ Profile Saved":"💾 Save Profile"}</button>
            <button onClick={()=>saveToFirebase(dogs)} disabled={syncing} style={{width:"100%",padding:"11px",borderRadius:"var(--border-radius-md)",border:"none",background:syncing?"#888":"#0F6E56",color:"#fff",fontSize:14,fontWeight:500,cursor:"pointer"}}>{syncing?"Saving...":"☁️ Sync to Firebase"}</button>
          </div>
        </>
      )}
    </div>
  );
}