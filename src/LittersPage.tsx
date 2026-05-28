import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const COLOUR_LIST = ["Black","Yellow","Chocolate","Cream","Golden","Red","Silver","White","Black & Tan","Black & White","Brown","Fawn","Brindle","Merle","Sable","Tricolour","Other"];
const COLLAR_COLOURS = ["Red","Blue","Green","Yellow","Pink","Purple","Orange","White","Black","Brown","Teal","Grey"];
const PUPPY_STATUSES = ["Available","Reserved","Sold","Kept"];
const VACCINE_SCHEDULE: Record<string,{intervalDays:number;label:string}> = {"C5":{intervalDays:365,label:"Annual"},"C3":{intervalDays:365,label:"Annual"},"Rabies":{intervalDays:365,label:"Annual"},"Puppy 1st":{intervalDays:28,label:"4 weeks"},"Puppy 2nd":{intervalDays:28,label:"4 weeks"},"Puppy Final":{intervalDays:365,label:"Annual after final"},"Kennel Cough":{intervalDays:365,label:"Annual"}};
const WORMING_SCHEDULE: Record<string,{intervalDays:number;label:string}> = {"Milbemax":{intervalDays:90,label:"Every 3 months"},"Drontal":{intervalDays:90,label:"Every 3 months"},"Interceptor":{intervalDays:30,label:"Monthly"},"Heartgard":{intervalDays:30,label:"Monthly"},"Panoramis":{intervalDays:30,label:"Monthly"},"Nexgard Spectra":{intervalDays:30,label:"Monthly"},"Other":{intervalDays:90,label:"Every 3 months"}};

const genId = () => Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase();
const addDays = (d:string,n:number) => { if(!d)return""; const x=new Date(d); x.setDate(x.getDate()+n); return x.toISOString().split("T")[0]; };
const formatDate = (d:string) => { if(!d)return""; const [y,m,day]=d.split("-"); return `${day}-${m}-${y}`; };
const daysUntil = (d:string) => { if(!d)return null; return Math.ceil((new Date(d).getTime()-new Date().setHours(0,0,0,0))/(1000*60*60*24)); };
const statusStyle = (s:string) => ({Available:{bg:"#E1F5EE",color:"#0F6E56"},Reserved:{bg:"#FAEEDA",color:"#633806"},Sold:{bg:"#FCEBEB",color:"#A32D2D"},Kept:{bg:"#EEEDFE",color:"#3C3489"}}[s]||{bg:"#f0f0f0",color:"#666"});
const IS:React.CSSProperties = {width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"};
const lbl = (t:string) => <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{t}</div>;

// ---- DogSelect: chọn từ profiles hoặc nhập tay ----
function DogSelect({label,value,onChange,dogs}:{label:string;value:string;onChange:(v:string)=>void;dogs:any[]}) {
  const [mode,setMode] = useState<"select"|"manual">(dogs.some(d=>d.name===value||`${d.callName} (${d.name})`===value)?"select":"manual");
  const femaleDogs = dogs.filter(d=>d.gender==="Female"||!d.gender);
  const maleDogs = dogs.filter(d=>d.gender==="Male"||!d.gender);
  const list = label.toLowerCase().includes("dam") ? femaleDogs : maleDogs.length>0 ? maleDogs : dogs;

  return (
    <div>
      {lbl(label)}
      <div style={{display:"flex",gap:6,marginBottom:6}}>
        <button onClick={()=>setMode("select")} style={{flex:1,padding:"5px",borderRadius:6,border:mode==="select"?"1.5px solid #534AB7":"1px solid var(--color-border-secondary)",background:mode==="select"?"#EEEDFE":"var(--color-background-primary)",color:mode==="select"?"#3C3489":"var(--color-text-secondary)",fontSize:11,cursor:"pointer"}}>From Profiles</button>
        <button onClick={()=>setMode("manual")} style={{flex:1,padding:"5px",borderRadius:6,border:mode==="manual"?"1.5px solid #534AB7":"1px solid var(--color-border-secondary)",background:mode==="manual"?"#EEEDFE":"var(--color-background-primary)",color:mode==="manual"?"#3C3489":"var(--color-text-secondary)",fontSize:11,cursor:"pointer"}}>Manual</button>
      </div>
      {mode==="select"?(
        <select value={value} onChange={e=>onChange(e.target.value)} style={IS}>
          <option value="">-- Select --</option>
          {list.map(d=>(
            <option key={d.id} value={d.callName?`${d.callName} (${d.name})`:d.name}>
              {d.callName?`${d.callName} (${d.name})`:d.name}{d.breed?` — ${d.breed}`:""}
            </option>
          ))}
          <option value="__manual__">Other (type below)</option>
        </select>
      ):(
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder={`Enter ${label.toLowerCase()} name...`} style={IS}/>
      )}
    </div>
  );
}

// ---- PuppyCard ----
function PuppyCard({puppy,litterId,litters,onChange}:{puppy:any;litterId:string;litters:any[];onChange:(l:any[])=>void}) {
  const [open,setOpen] = useState(false);
  const [subTab,setSubTab] = useState("info");
  const [showAddVax,setShowAddVax] = useState(false);
  const [newVax,setNewVax] = useState({name:"",date:"",nextDate:""});
  const [showAddWorm,setShowAddWorm] = useState(false);
  const [newWorm,setNewWorm] = useState({name:"",date:"",nextDate:"",notes:""});
  const [showBuyer,setShowBuyer] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const updatePuppy = (patch:any) => onChange(litters.map(l=>l.id===litterId?{...l,puppies:l.puppies.map((p:any)=>p.id===puppy.id?{...p,...patch}:p)}:l));
  const deletePuppy = () => { if(!confirm(`Delete ${puppy.name||"this puppy"}?`))return; onChange(litters.map(l=>l.id===litterId?{...l,puppies:l.puppies.filter((p:any)=>p.id!==puppy.id)}:l)); };
  const handlePhoto = (e:React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>updatePuppy({photo:ev.target?.result}); r.readAsDataURL(f); };
  const handleDoc = (e:React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>updatePuppy({documents:[...(puppy.documents||[]),{id:genId(),name:f.name,docType:"Other",date:new Date().toLocaleDateString("en-AU"),url:ev.target?.result,fileType:f.type}]}); r.readAsDataURL(f); };
  const addVaccine = () => { if(!newVax.name||!newVax.date)return; updatePuppy({vaccines:[...(puppy.vaccines||[]),{id:genId(),...newVax}]}); setNewVax({name:"",date:"",nextDate:""}); setShowAddVax(false); };
  const addWorm = () => { if(!newWorm.name||!newWorm.date)return; updatePuppy({wormRecords:[...(puppy.wormRecords||[]),{id:genId(),...newWorm}]}); setNewWorm({name:"",date:"",nextDate:"",notes:""}); setShowAddWorm(false); };
  const st = statusStyle(puppy.status||"Available");
  const SUBTABS = [{k:"info",label:"Info"},{k:"vaccine",label:`Vaccines${(puppy.vaccines||[]).length>0?` (${puppy.vaccines.length})`:""}`},{k:"worming",label:`Worming${(puppy.wormRecords||[]).length>0?` (${puppy.wormRecords.length})`:""}`},{k:"docs",label:`Docs${(puppy.documents||[]).length>0?` (${puppy.documents.length})`:""}`}];

  return (
    <div style={{border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",overflow:"hidden",background:"var(--color-background-primary)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer",userSelect:"none"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{width:44,height:44,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1.5px solid var(--color-border-tertiary)",position:"relative"}}>
          {puppy.photo?<img src={puppy.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🐶"}
          {puppy.collarColour&&<div style={{position:"absolute",bottom:1,right:1,width:12,height:12,borderRadius:"50%",background:puppy.collarColour.toLowerCase(),border:"1.5px solid #fff"}}/>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:500,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            {puppy.name||"Unnamed puppy"}
            {puppy.gender&&<span style={{fontSize:11,color:puppy.gender==="Male"?"#185FA5":"#993556"}}>{puppy.gender==="Male"?"♂":"♀"}</span>}
          </div>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{[puppy.colour,puppy.weight&&`${puppy.weight} kg`].filter(Boolean).join(" · ")}</div>
        </div>
        <span style={{fontSize:11,padding:"3px 8px",borderRadius:99,fontWeight:500,background:st.bg,color:st.color,flexShrink:0}}>{puppy.status||"Available"}</span>
        <span style={{fontSize:14,color:"var(--color-text-tertiary)",transform:open?"rotate(180deg)":"none",transition:"transform 0.18s"}}>▾</span>
        <button onClick={e=>{e.stopPropagation();deletePuppy();}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16,padding:"0 2px"}}>✕</button>
      </div>

      {open&&(
        <div style={{borderTop:"1px solid var(--color-border-tertiary)",padding:"12px 14px",background:"var(--color-background-secondary)"}}>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {SUBTABS.map(t=><button key={t.k} onClick={()=>setSubTab(t.k)} style={{padding:"5px 10px",borderRadius:"var(--border-radius-md)",fontSize:11,cursor:"pointer",border:subTab===t.k?"1.5px solid #534AB7":"1.5px solid var(--color-border-tertiary)",background:subTab===t.k?"#EEEDFE":"var(--color-background-primary)",color:subTab===t.k?"#3C3489":"var(--color-text-secondary)"}}>{t.label}</button>)}
          </div>

          {subTab==="info"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:64,height:64,borderRadius:8,overflow:"hidden",background:"var(--color-border-tertiary)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>
                  {puppy.photo?<img src={puppy.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🐶"}
                </div>
                <div>
                  <button onClick={()=>photoRef.current?.click()} style={{padding:"6px 12px",borderRadius:"var(--border-radius-md)",fontSize:12,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",cursor:"pointer"}}>📷 Change photo</button>
                  <input ref={photoRef} type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>{lbl("Name")}<input value={puppy.name||""} onChange={e=>updatePuppy({name:e.target.value})} placeholder="Puppy name..." style={IS}/></div>
                <div>{lbl("Gender")}<select value={puppy.gender||""} onChange={e=>updatePuppy({gender:e.target.value})} style={IS}><option value="">-- Select --</option><option>Male</option><option>Female</option></select></div>
                <div>{lbl("Coat Colour")}<select value={puppy.colour||""} onChange={e=>updatePuppy({colour:e.target.value})} style={IS}><option value="">-- Select --</option>{COLOUR_LIST.map(c=><option key={c}>{c}</option>)}</select></div>
                <div>
                  {lbl("Collar Colour")}
                  <select value={puppy.collarColour||""} onChange={e=>updatePuppy({collarColour:e.target.value})} style={IS}><option value="">-- None --</option>{COLLAR_COLOURS.map(c=><option key={c}>{c}</option>)}</select>
                  {puppy.collarColour&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}><div style={{width:14,height:14,borderRadius:"50%",background:puppy.collarColour.toLowerCase(),border:"1px solid var(--color-border-secondary)"}}/><span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{puppy.collarColour}</span></div>}
                </div>
                <div>{lbl("Weight (kg)")}<input value={puppy.weight||""} onChange={e=>updatePuppy({weight:e.target.value})} placeholder="0.5" style={IS}/></div>
                <div>{lbl("Status")}<select value={puppy.status||"Available"} onChange={e=>updatePuppy({status:e.target.value})} style={IS}>{PUPPY_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              </div>
              {(puppy.status==="Reserved"||puppy.status==="Sold")&&(
                <div style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-tertiary)",overflow:"hidden"}}>
                  <div style={{padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setShowBuyer(o=>!o)}>
                    <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>👤 Buyer Info {puppy.buyer?.name&&`— ${puppy.buyer.name}`}</div>
                    <span style={{fontSize:13,color:"var(--color-text-tertiary)"}}>{showBuyer?"▲":"▼"}</span>
                  </div>
                  {showBuyer&&(
                    <div style={{padding:"0 12px 12px",display:"flex",flexDirection:"column",gap:8,borderTop:"1px solid var(--color-border-tertiary)"}}>
                      <div style={{height:8}}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>{lbl("Full Name")}<input value={puppy.buyer?.name||""} onChange={e=>updatePuppy({buyer:{...puppy.buyer,name:e.target.value}})} placeholder="Jane Smith" style={IS}/></div>
                        <div>{lbl("Phone")}<input value={puppy.buyer?.phone||""} onChange={e=>updatePuppy({buyer:{...puppy.buyer,phone:e.target.value}})} placeholder="04xx xxx xxx" style={IS}/></div>
                        <div>{lbl("Email")}<input value={puppy.buyer?.email||""} onChange={e=>updatePuppy({buyer:{...puppy.buyer,email:e.target.value}})} placeholder="jane@email.com" style={IS}/></div>
                        <div>{lbl("Address")}<input value={puppy.buyer?.address||""} onChange={e=>updatePuppy({buyer:{...puppy.buyer,address:e.target.value}})} placeholder="123 Main St..." style={IS}/></div>
                      </div>
                      <div>{lbl("Notes")}<textarea value={puppy.buyer?.notes||""} onChange={e=>updatePuppy({buyer:{...puppy.buyer,notes:e.target.value}})} placeholder="Deposit paid, pick-up date..." rows={2} style={{...IS,resize:"vertical",lineHeight:1.5,fontFamily:"var(--font-sans)"}}/></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {subTab==="vaccine"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(puppy.vaccines||[]).length===0&&!showAddVax&&<div style={{textAlign:"center",padding:"16px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No vaccine records yet</div>}
              {(puppy.vaccines||[]).map((v:any,i:number)=>{
                const dl=daysUntil(v.nextDate); const ov=dl!==null&&dl<0&&!v.completed; const sn=dl!==null&&dl>=0&&dl<=30&&!v.completed;
                return(
                  <div key={v.id} style={{background:"var(--color-background-primary)",border:`1px solid ${ov?"#F09595":sn?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:v.completed?0.6:1}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:500}}>💉 {v.name}{v.completed&&<span style={{marginLeft:6,fontSize:10,background:"#1D9E75",color:"#fff",padding:"1px 6px",borderRadius:99}}>Done</span>}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>Given: {formatDate(v.date)}</div>
                      {v.nextDate&&!v.completed&&<div style={{fontSize:11,color:ov?"#E24B4A":sn?"#BA7517":"var(--color-text-secondary)",marginTop:1}}>{ov?"⚠️ Overdue: ":sn?"⏰ Due soon: ":"Next: "}{formatDate(v.nextDate)}</div>}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {!v.completed&&<button onClick={()=>updatePuppy({vaccines:(puppy.vaccines||[]).map((x:any,j:number)=>j===i?{...x,completed:true}:x)})} style={{background:"none",border:"1px solid #1D9E75",borderRadius:6,cursor:"pointer",color:"#1D9E75",fontSize:11,padding:"3px 8px"}}>✓ Done</button>}
                      <button onClick={()=>updatePuppy({vaccines:(puppy.vaccines||[]).filter((_:any,j:number)=>j!==i)})} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                    </div>
                  </div>
                );
              })}
              {showAddVax?(
                <div style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-md)",padding:"12px",display:"flex",flexDirection:"column",gap:8,border:"1px solid var(--color-border-tertiary)"}}>
                  {lbl("Vaccine Name")}
                  <input value={newVax.name} onChange={e=>{const name=e.target.value;const sc=VACCINE_SCHEDULE[name];setNewVax(p=>({...p,name,nextDate:sc&&p.date?addDays(p.date,sc.intervalDays):p.nextDate}));}} placeholder="C5, Puppy 1st..." list="pv-vax-list" style={IS}/>
                  <datalist id="pv-vax-list">{Object.keys(VACCINE_SCHEDULE).map(v=><option key={v} value={v}/>)}</datalist>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>{lbl("Date Given")}<input type="date" value={newVax.date} onChange={e=>{const date=e.target.value;const sc=VACCINE_SCHEDULE[newVax.name];setNewVax(p=>({...p,date,nextDate:sc&&date?addDays(date,sc.intervalDays):p.nextDate}));}} style={IS}/></div>
                    <div>{lbl("Next Due")}<input type="date" value={newVax.nextDate} onChange={e=>setNewVax(p=>({...p,nextDate:e.target.value}))} style={{...IS,border:VACCINE_SCHEDULE[newVax.name]&&newVax.date?"1.5px solid #AFA9EC":IS.border as string,background:VACCINE_SCHEDULE[newVax.name]&&newVax.date?"#EEEDFE":IS.background as string}}/>{VACCINE_SCHEDULE[newVax.name]&&newVax.date&&<div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto: {VACCINE_SCHEDULE[newVax.name].label}</div>}</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={addVaccine} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:12,cursor:"pointer"}}>Add</button>
                    <button onClick={()=>setShowAddVax(false)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowAddVax(true)} style={{width:"100%",padding:"8px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Vaccine</button>
              )}
            </div>
          )}

          {subTab==="worming"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(puppy.wormRecords||[]).length===0&&!showAddWorm&&<div style={{textAlign:"center",padding:"16px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No worming records yet</div>}
              {(puppy.wormRecords||[]).map((w:any,i:number)=>{
                const dl=daysUntil(w.nextDate); const ov=dl!==null&&dl<0; const sn=dl!==null&&dl>=0&&dl<=30;
                return(
                  <div key={w.id} style={{background:"var(--color-background-primary)",border:`1px solid ${ov?"#F09595":sn?"#FAC775":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-md)",padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:500}}>🐛 {w.name}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>Given: {formatDate(w.date)}</div>
                      {w.nextDate&&<div style={{fontSize:11,color:ov?"#E24B4A":sn?"#BA7517":"var(--color-text-secondary)",marginTop:1}}>{ov?"⚠️ Overdue: ":sn?"⏰ Due soon: ":"Next: "}{formatDate(w.nextDate)}</div>}
                      {w.notes&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:1}}>📝 {w.notes}</div>}
                    </div>
                    <button onClick={()=>updatePuppy({wormRecords:(puppy.wormRecords||[]).filter((_:any,j:number)=>j!==i)})} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                  </div>
                );
              })}
              {showAddWorm?(
                <div style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-md)",padding:"12px",display:"flex",flexDirection:"column",gap:8,border:"1px solid var(--color-border-tertiary)"}}>
                  {lbl("Product")}
                  <input value={newWorm.name} onChange={e=>{const name=e.target.value;const sc=WORMING_SCHEDULE[name];setNewWorm(p=>({...p,name,nextDate:sc&&p.date?addDays(p.date,sc.intervalDays):p.nextDate}));}} placeholder="Milbemax, Drontal..." list="pv-worm-list" style={IS}/>
                  <datalist id="pv-worm-list">{Object.keys(WORMING_SCHEDULE).map(v=><option key={v} value={v}/>)}</datalist>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>{lbl("Date Given")}<input type="date" value={newWorm.date} onChange={e=>{const date=e.target.value;const sc=WORMING_SCHEDULE[newWorm.name];setNewWorm(p=>({...p,date,nextDate:sc&&date?addDays(date,sc.intervalDays):p.nextDate}));}} style={IS}/></div>
                    <div>{lbl("Next Due")}<input type="date" value={newWorm.nextDate} onChange={e=>setNewWorm(p=>({...p,nextDate:e.target.value}))} style={{...IS,border:WORMING_SCHEDULE[newWorm.name]&&newWorm.date?"1.5px solid #AFA9EC":IS.border as string,background:WORMING_SCHEDULE[newWorm.name]&&newWorm.date?"#EEEDFE":IS.background as string}}/>{WORMING_SCHEDULE[newWorm.name]&&newWorm.date&&<div style={{fontSize:10,color:"#534AB7",marginTop:2}}>Auto: {WORMING_SCHEDULE[newWorm.name].label}</div>}</div>
                  </div>
                  <div>{lbl("Notes")}<input value={newWorm.notes} onChange={e=>setNewWorm(p=>({...p,notes:e.target.value}))} placeholder="Weight, dose..." style={IS}/></div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={addWorm} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:12,cursor:"pointer"}}>Add</button>
                    <button onClick={()=>setShowAddWorm(false)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowAddWorm(true)} style={{width:"100%",padding:"8px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Worming Record</button>
              )}
            </div>
          )}

          {subTab==="docs"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(puppy.documents||[]).length===0&&<div style={{textAlign:"center",padding:"16px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No documents yet</div>}
              {(puppy.documents||[]).map((d:any)=>(
                <div key={d.id} style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13}}>{d.fileType?.includes("pdf")?"📄":d.fileType?.includes("image")?"🖼️":"📎"} {d.name}</div>
                    <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{d.date}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <a href={d.url} download={d.name} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid var(--color-border-secondary)",color:"var(--color-text-secondary)",textDecoration:"none"}}>⬇</a>
                    <button onClick={()=>updatePuppy({documents:(puppy.documents||[]).filter((x:any)=>x.id!==d.id)})} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                  </div>
                </div>
              ))}
              <label style={{display:"block",width:"100%",padding:"8px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer",textAlign:"center",boxSizing:"border-box"}}>
                + Upload Document
                <input ref={docRef} type="file" accept=".pdf,.jpg,.png,.doc,.docx" onChange={handleDoc} style={{display:"none"}}/>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main LittersPage ----
export default function LittersPage() {
  const [litters,setLitters] = useState<any[]>([]);
  const [dogs,setDogs] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  const [syncing,setSyncing] = useState(false);
  const [syncMsg,setSyncMsg] = useState("");
  const [expandedIds,setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddLitter,setShowAddLitter] = useState(false);
  const [newLitter,setNewLitter] = useState({litterId:"",dob:"",sire:"",dam:"",maleCount:"",femaleCount:"",notes:""});
  const [addPuppyFor,setAddPuppyFor] = useState<string|null>(null);
  const [newPuppy,setNewPuppy] = useState({name:"",gender:"",colour:"",collarColour:"",weight:"",photo:"",status:"Available",buyer:{},vaccines:[],wormRecords:[],documents:[]});
  const [search,setSearch] = useState("");

  useEffect(()=>{
    const load = async () => {
      try {
        const [ls,ds] = await Promise.all([
          getDoc(doc(db,"litters","all")),
          getDoc(doc(db,"dogProfiles","all")),
        ]);
        if(ls.exists()&&ls.data().litters) setLitters(ls.data().litters);
        if(ds.exists()&&ds.data().dogs) setDogs(ds.data().dogs);
      } catch(e){console.error(e);}
      setLoading(false);
    };
    load();
  },[]);

  const save = async (data:any[]) => {
    setSyncing(true);
    try {
      await setDoc(doc(db,"litters","all"),{litters:data,updatedAt:new Date().toISOString()});
      setSyncMsg("✓ Saved"); setTimeout(()=>setSyncMsg(""),2000);
    } catch(e){setSyncMsg("Error!");}
    setSyncing(false);
  };

  const toggleLitter = (id:string) => setExpandedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});

  const addLitter = () => {
    if(!newLitter.dob)return;
    const litter={id:genId(),litterId:newLitter.litterId||`LIT-${genId()}`,dob:newLitter.dob,sire:newLitter.sire,dam:newLitter.dam,maleCount:newLitter.maleCount,femaleCount:newLitter.femaleCount,notes:newLitter.notes,puppies:[]};
    const updated=[...litters,litter];
    setLitters(updated); save(updated);
    setNewLitter({litterId:"",dob:"",sire:"",dam:"",maleCount:"",femaleCount:"",notes:""});
    setShowAddLitter(false);
    setExpandedIds(prev=>new Set([...prev,litter.id]));
  };

  const deleteLitter = (id:string) => {
    if(!confirm("Delete this litter and all puppies?"))return;
    const updated=litters.filter(l=>l.id!==id);
    setLitters(updated); save(updated);
  };

  const addPuppy = (litterId:string) => {
    if(!newPuppy.name)return;
    const updated=litters.map(l=>l.id===litterId?{...l,puppies:[...l.puppies,{id:genId(),...newPuppy}]}:l);
    setLitters(updated); save(updated);
    setNewPuppy({name:"",gender:"",colour:"",collarColour:"",weight:"",photo:"",status:"Available",buyer:{},vaccines:[],wormRecords:[],documents:[]});
    setAddPuppyFor(null);
  };

  const handleLittersChange = (updated:any[]) => { setLitters(updated); save(updated); };

  const stats = (l:any) => ({
    avail:l.puppies.filter((p:any)=>p.status==="Available"||!p.status).length,
    reserved:l.puppies.filter((p:any)=>p.status==="Reserved").length,
    sold:l.puppies.filter((p:any)=>p.status==="Sold").length,
    kept:l.puppies.filter((p:any)=>p.status==="Kept").length,
  });

  const filtered = litters.filter(l=>
    !search ||
    l.litterId?.toLowerCase().includes(search.toLowerCase()) ||
    l.sire?.toLowerCase().includes(search.toLowerCase()) ||
    l.dam?.toLowerCase().includes(search.toLowerCase())
  );

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,fontFamily:"var(--font-sans)",color:"var(--color-text-secondary)"}}>Loading litters...</div>;

  return (
    <div style={{fontFamily:"var(--font-sans)",color:"var(--color-text-primary)",maxWidth:680,margin:"0 auto",padding:"16px 12px"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Litters</div>
          <div style={{fontSize:18,fontWeight:500}}>{litters.length} litter{litters.length!==1?"s":""} recorded</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {syncMsg&&<span style={{fontSize:12,color:"#1D9E75"}}>{syncMsg}</span>}
          <button onClick={()=>save(litters)} disabled={syncing} style={{padding:"8px 14px",borderRadius:"var(--border-radius-md)",border:"none",background:syncing?"#888":"#1D9E75",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>💾 Save</button>
          <button onClick={()=>setShowAddLitter(true)} style={{padding:"8px 14px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>+ New Litter</button>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by litter ID, sire or dam..." style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none",marginBottom:14}}/>

      {/* Add Litter Form */}
      {showAddLitter&&(
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"14px",border:"1px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em"}}>New Litter</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>{lbl("Litter ID")}<input value={newLitter.litterId} onChange={e=>setNewLitter(p=>({...p,litterId:e.target.value}))} placeholder="LIT-2026-001..." style={IS}/></div>
            <div>{lbl("Date of Birth *")}<input type="date" value={newLitter.dob} onChange={e=>setNewLitter(p=>({...p,dob:e.target.value}))} style={IS}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <DogSelect label="Sire (Father)" value={newLitter.sire} onChange={v=>setNewLitter(p=>({...p,sire:v}))} dogs={dogs}/>
            <DogSelect label="Dam (Mother)" value={newLitter.dam} onChange={v=>setNewLitter(p=>({...p,dam:v}))} dogs={dogs}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>{lbl("No. of Males")}<input value={newLitter.maleCount} onChange={e=>setNewLitter(p=>({...p,maleCount:e.target.value}))} placeholder="0" style={IS}/></div>
            <div>{lbl("No. of Females")}<input value={newLitter.femaleCount} onChange={e=>setNewLitter(p=>({...p,femaleCount:e.target.value}))} placeholder="0" style={IS}/></div>
          </div>
          <div>{lbl("Notes")}<input value={newLitter.notes} onChange={e=>setNewLitter(p=>({...p,notes:e.target.value}))} placeholder="Any notes..." style={IS}/></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addLitter} style={{flex:1,padding:"9px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Create Litter</button>
            <button onClick={()=>{setShowAddLitter(false);setNewLitter({litterId:"",dob:"",sire:"",dam:"",maleCount:"",femaleCount:"",notes:""}); }} style={{flex:1,padding:"9px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}

      {filtered.length===0&&!showAddLitter&&(
        <div style={{textAlign:"center",padding:"48px 0",color:"var(--color-text-tertiary)",fontSize:13}}>
          <div style={{fontSize:40,marginBottom:12}}>🐾</div>
          <div>{search?"No litters found":"No litters recorded yet — click + New Litter"}</div>
        </div>
      )}

      {/* Litter list */}
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {filtered.map(litter=>{
          const exp=expandedIds.has(litter.id);
          const s=stats(litter);
          return(
            <div key={litter.id} style={{border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",overflow:"hidden"}}>
              {/* Litter header */}
              <div style={{background:"var(--color-background-secondary)",padding:"12px 14px",cursor:"pointer",userSelect:"none"}} onClick={()=>toggleLitter(litter.id)}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,fontSize:14,display:"flex",alignItems:"center",gap:8}}>
                      🐾 {litter.litterId}
                      <span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)"}}>Born {formatDate(litter.dob)}</span>
                    </div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:3}}>
                      {[litter.sire&&`Sire: ${litter.sire}`,litter.dam&&`Dam: ${litter.dam}`].filter(Boolean).join(" · ")}
                    </div>
                    {litter.puppies.length>0&&(
                      <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                        {s.avail>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#E1F5EE",color:"#0F6E56"}}>✔ {s.avail} Available</span>}
                        {s.reserved>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#FAEEDA",color:"#633806"}}>⏳ {s.reserved} Reserved</span>}
                        {s.sold>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#FCEBEB",color:"#A32D2D"}}>💰 {s.sold} Sold</span>}
                        {s.kept>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#EEEDFE",color:"#3C3489"}}>🏠 {s.kept} Kept</span>}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <span style={{background:"#EEEDFE",color:"#3C3489",fontSize:11,padding:"2px 8px",borderRadius:99}}>{litter.puppies.length} pup{litter.puppies.length!==1?"s":""}</span>
                    {litter.maleCount&&<span style={{fontSize:11,color:"#185FA5"}}>♂ {litter.maleCount}</span>}
                    {litter.femaleCount&&<span style={{fontSize:11,color:"#993556"}}>♀ {litter.femaleCount}</span>}
                    <span style={{fontSize:14,color:"var(--color-text-tertiary)",transform:exp?"rotate(180deg)":"none",transition:"transform 0.18s"}}>▾</span>
                    <button onClick={e=>{e.stopPropagation();deleteLitter(litter.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                  </div>
                </div>
                {litter.notes&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:6}}>📝 {litter.notes}</div>}
              </div>

              {/* Litter body */}
              {exp&&(
                <div style={{padding:"14px",background:"var(--color-background-primary)",display:"flex",flexDirection:"column",gap:10}}>
                  {litter.puppies.length===0&&<div style={{textAlign:"center",padding:"12px 0",color:"var(--color-text-tertiary)",fontSize:12}}>No puppies added yet</div>}
                  {litter.puppies.map((puppy:any)=>(
                    <PuppyCard key={puppy.id} puppy={puppy} litterId={litter.id} litters={litters} onChange={handleLittersChange}/>
                  ))}

                  {addPuppyFor===litter.id?(
                    <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px",border:"1px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",gap:10}}>
                      <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>New Puppy</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div>{lbl("Name")}<input value={newPuppy.name} onChange={e=>setNewPuppy(p=>({...p,name:e.target.value}))} placeholder="Puppy name..." style={IS}/></div>
                        <div>{lbl("Gender")}<select value={newPuppy.gender} onChange={e=>setNewPuppy(p=>({...p,gender:e.target.value}))} style={IS}><option value="">-- Select --</option><option>Male</option><option>Female</option></select></div>
                        <div>{lbl("Coat Colour")}<select value={newPuppy.colour} onChange={e=>setNewPuppy(p=>({...p,colour:e.target.value}))} style={IS}><option value="">-- Select --</option>{COLOUR_LIST.map(c=><option key={c}>{c}</option>)}</select></div>
                        <div>{lbl("Collar Colour")}<select value={newPuppy.collarColour} onChange={e=>setNewPuppy(p=>({...p,collarColour:e.target.value}))} style={IS}><option value="">-- None --</option>{COLLAR_COLOURS.map(c=><option key={c}>{c}</option>)}</select></div>
                        <div>{lbl("Weight (kg)")}<input value={newPuppy.weight} onChange={e=>setNewPuppy(p=>({...p,weight:e.target.value}))} placeholder="0.5" style={IS}/></div>
                        <div>{lbl("Status")}<select value={newPuppy.status} onChange={e=>setNewPuppy(p=>({...p,status:e.target.value}))} style={IS}>{PUPPY_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>addPuppy(litter.id)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Add Puppy</button>
                        <button onClick={()=>setAddPuppyFor(null)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <button onClick={()=>setAddPuppyFor(litter.id)} style={{width:"100%",padding:"9px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Puppy</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}