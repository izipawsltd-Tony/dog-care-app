import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import emailjs from "@emailjs/browser";

const COLOUR_LIST = ["Black","Yellow","Chocolate","Cream","Golden","Red","Silver","White","Black & Tan","Black & White","Brown","Fawn","Brindle","Merle","Sable","Tricolour","Other"];
const COLLAR_COLOURS = ["Red","Blue","Green","Yellow","Pink","Purple","Orange","White","Black","Brown","Teal","Grey"];
const PUPPY_STATUSES = ["Available","Deposit","Reserved","Sold","Kept"];
const VACCINE_SCHEDULE: Record<string,{intervalDays:number;label:string}> = {"C5":{intervalDays:365,label:"Annual"},"C3":{intervalDays:365,label:"Annual"},"Rabies":{intervalDays:365,label:"Annual"},"Puppy 1st":{intervalDays:28,label:"4 weeks"},"Puppy 2nd":{intervalDays:28,label:"4 weeks"},"Puppy Final":{intervalDays:365,label:"Annual after final"},"Kennel Cough":{intervalDays:365,label:"Annual"}};
const WORMING_SCHEDULE: Record<string,{intervalDays:number;label:string}> = {"Milbemax":{intervalDays:90,label:"Every 3 months"},"Drontal":{intervalDays:90,label:"Every 3 months"},"Interceptor":{intervalDays:30,label:"Monthly"},"Heartgard":{intervalDays:30,label:"Monthly"},"Panoramis":{intervalDays:30,label:"Monthly"},"Nexgard Spectra":{intervalDays:30,label:"Monthly"},"Other":{intervalDays:90,label:"Every 3 months"}};

const EMAILJS_SERVICE = "service_1xiqii4";
const EMAILJS_TEMPLATE = "template_6nkcrjc";
const EMAILJS_KEY = "EnExVywt47_FbtvbW";

const genId = () => Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,4).toUpperCase();
const addDays = (d:string,n:number) => { if(!d)return""; const x=new Date(d); x.setDate(x.getDate()+n); return x.toISOString().split("T")[0]; };
const formatDate = (d:string) => { if(!d)return""; const [y,m,day]=d.split("-"); return `${day}-${m}-${y}`; };
const todayISO = () => new Date().toISOString().split("T")[0];
const todayDisplay = () => new Date().toLocaleDateString("en-AU",{day:"2-digit",month:"2-digit",year:"numeric"});
const daysUntil = (d:string) => { if(!d)return null; return Math.ceil((new Date(d).getTime()-new Date().setHours(0,0,0,0))/(1000*60*60*24)); };

const statusStyle = (s:string):any => ({
  Available:{bg:"#E1F5EE",color:"#0F6E56"},
  Deposit:{bg:"#FFF3CD",color:"#856404"},
  Reserved:{bg:"#FAEEDA",color:"#633806"},
  Sold:{bg:"#FCEBEB",color:"#A32D2D"},
  Kept:{bg:"#EEEDFE",color:"#3C3489"},
}[s]||{bg:"#f0f0f0",color:"#666"});

const IS:React.CSSProperties = {width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none"};
const lbl = (t:string) => <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{t}</div>;

function generatePuppyId(litterId:string, gender:string, existingPuppies:any[]) {
  const prefix = litterId ? litterId.replace(/[^A-Z0-9]/gi,"").toUpperCase().slice(0,8) : "PUP";
  const gChar = gender==="Male"?"M":gender==="Female"?"F":"X";
  const sameGender = existingPuppies.filter((p:any)=>(p.gender||"")===gender).length + 1;
  return `${prefix}-${gChar}${sameGender}`;
}

function generateReceiptHTML(puppy:any, litter:any, payment:{amount:string;type:string;date:string;notes:string}, breederName:string) {
  const buyer = puppy.buyer||{};
  const receiptNum = genId();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt - ${puppy.puppyId||puppy.name}</title>
<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#222;font-size:14px;}.header{text-align:center;border-bottom:2px solid #534AB7;padding-bottom:16px;margin-bottom:24px;}.brand{font-size:20px;font-weight:700;color:#534AB7;}.receipt-title{font-size:18px;font-weight:600;margin:16px 0 4px;}.receipt-num{font-size:12px;color:#666;}table{width:100%;border-collapse:collapse;margin:16px 0;}td{padding:8px 12px;border-bottom:1px solid #eee;}td:first-child{font-weight:500;color:#555;width:40%;}.amount-row td{font-size:18px;font-weight:700;color:#534AB7;border-top:2px solid #534AB7;border-bottom:2px solid #534AB7;}.footer{margin-top:32px;font-size:12px;color:#888;text-align:center;border-top:1px solid #eee;padding-top:16px;}.badge{display:inline-block;background:#EEEDFE;color:#3C3489;padding:2px 10px;border-radius:99px;font-size:12px;}</style></head><body>
<div class="header"><div style="font-size:28px">🐾</div><div class="brand">IziPaws</div><div class="receipt-title">${payment.type} Receipt</div><div class="receipt-num">Receipt #${receiptNum} · ${payment.date||todayDisplay()}</div></div>
<table>
<tr><td>Puppy</td><td><strong>${puppy.name||"Unnamed"}</strong> ${puppy.gender?"("+puppy.gender+")":""}</td></tr>
${puppy.puppyId?`<tr><td>Puppy ID</td><td>${puppy.puppyId}</td></tr>`:""}
${puppy.microchip?`<tr><td>Microchip</td><td>${puppy.microchip}</td></tr>`:""}
${puppy.colour?`<tr><td>Colour</td><td>${puppy.colour}</td></tr>`:""}
${litter.litterId?`<tr><td>Litter</td><td>${litter.litterId}</td></tr>`:""}
${litter.dob?`<tr><td>Date of Birth</td><td>${formatDate(litter.dob)}</td></tr>`:""}
${litter.sire?`<tr><td>Sire</td><td>${litter.sire}</td></tr>`:""}
${litter.dam?`<tr><td>Dam</td><td>${litter.dam}</td></tr>`:""}
</table>
<table>
<tr><td>Buyer</td><td><strong>${buyer.name||"—"}</strong></td></tr>
${buyer.phone?`<tr><td>Phone</td><td>${buyer.phone}</td></tr>`:""}
${buyer.email?`<tr><td>Email</td><td>${buyer.email}</td></tr>`:""}
${buyer.address?`<tr><td>Address</td><td>${buyer.address}</td></tr>`:""}
</table>
<table>
<tr class="amount-row"><td>Amount Paid <span class="badge">${payment.type}</span></td><td>$${payment.amount} AUD</td></tr>
<tr><td>Payment Date</td><td>${payment.date||todayDisplay()}</td></tr>
${payment.notes?`<tr><td>Notes</td><td>${payment.notes}</td></tr>`:""}
</table>
<div class="footer">Thank you for choosing ${breederName||"IziPaws"} 🐾<br>Generated on ${todayDisplay()}</div>
</body></html>`;
}

// ---- Send Email helper ----
async function sendEmail(toEmail:string, toName:string, subject:string, message:string) {
  return emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
    to_email: toEmail,
    to_name: toName||"there",
    subject,
    message,
  }, EMAILJS_KEY);
}

// ---- Share Modal ----
function ShareModal({puppy,litter,onClose}:{puppy:any;litter:any;onClose:()=>void}) {
  const [shareId,setShareId] = useState("");
  const [generating,setGenerating] = useState(false);
  const [copied,setCopied] = useState(false);
  const [emailTo,setEmailTo] = useState(puppy.buyer?.email||"");
  const [toName,setToName] = useState(puppy.buyer?.name||"");
  const [sending,setSending] = useState(false);
  const [sentMsg,setSentMsg] = useState("");
  const [shareWhat,setShareWhat] = useState<"both"|"photos"|"docs">("both");
  const [emailType,setEmailType] = useState<"enquiry"|"update"|"deposit">("update");

  const shareLink = shareId ? `${window.location.origin}/?share=${shareId}` : "";

  const generateLink = async () => {
    setGenerating(true);
    try {
      const id = genId();
      const vaccineInfo = (puppy.vaccines||[]).map((v:any)=>`${v.name} — Given: ${formatDate(v.date)}${v.nextDate?` · Next: ${formatDate(v.nextDate)}`:""}`).join("\n");
      const wormInfo = (puppy.wormRecords||[]).map((w:any)=>`${w.name} — Given: ${formatDate(w.date)}${w.nextDate?` · Next: ${formatDate(w.nextDate)}`:""}`).join("\n");
      const latestWeight = (puppy.weightHistory||[]).slice(-1)[0];
      const shareData = {
        puppyName: puppy.name||"Unnamed",
        puppyId: puppy.puppyId||"",
        microchip: puppy.microchip||"",
        colour: puppy.colour||"",
        gender: puppy.gender||"",
        collarColour: puppy.collarColour||"",
        status: puppy.status||"Available",
        litterId: litter.litterId||"",
        dob: litter.dob||"",
        sire: litter.sire||"",
        dam: litter.dam||"",
        latestWeight: latestWeight?`${latestWeight.kg} kg (${formatDate(latestWeight.date)})`:"",
        vaccineInfo,
        wormInfo,
        gallery: shareWhat!=="docs" ? (puppy.gallery||[]).map((img:any)=>({
          id:String(img.id||""),url:String(img.url||""),name:String(img.name||""),date:String(img.date||""),
        })) : [],
        documents: shareWhat!=="photos" ? (puppy.documents||[]).map((d:any)=>({
          id:String(d.id||""),name:String(d.name||""),docType:String(d.docType||"Other"),
          date:String(d.date||""),fileType:String(d.fileType||""),url:String(d.url||""),
        })) : [],
        createdAt: new Date().toISOString(),
        expiresAt: addDays(todayISO(),30),
      };
      await setDoc(doc(db,"puppyShares",id), shareData);
      setShareId(id);
    } catch(e){ console.error(e); }
    setGenerating(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const getEmailContent = () => {
    const latestWeight = (puppy.weightHistory||[]).slice(-1)[0];
    const nextVax = (puppy.vaccines||[]).filter((v:any)=>!v.completed&&v.nextDate).sort((a:any,b:any)=>a.nextDate.localeCompare(b.nextDate))[0];
    const nextWorm = (puppy.wormRecords||[]).filter((w:any)=>w.nextDate).sort((a:any,b:any)=>a.nextDate.localeCompare(b.nextDate))[0];
    const nextDate = nextVax?formatDate(nextVax.nextDate):nextWorm?formatDate(nextWorm.nextDate):"TBA";

    if(emailType==="enquiry") return {
      subject: `Puppy Enquiry — ${litter.sire||""}${litter.dam?` x ${litter.dam}`:""}`,
      message: `Thank you for your enquiry about our puppies.\n\nWe currently have ${puppy.colour||""} ${puppy.gender||""} puppies available from our ${litter.litterId||""} litter (born ${formatDate(litter.dob)}).\n\n${shareLink?"View photos and documents here:\n"+shareLink+"\n\n":""}If you would like to arrange a visit or video call to meet the puppies, please let me know a suitable time.\n\nI look forward to hearing from you.\n\nKind regards,\nIziPaws 🐾`,
    };
    if(emailType==="update") return {
      subject: `Puppy Update — ${puppy.name||"Your Puppy"} 🐾`,
      message: `Just a quick update on ${puppy.name||"your puppy"}.\n\nHe/She is doing very well, eating well and growing nicely.\n\n${latestWeight?`Current weight: ${latestWeight.kg} kg\n`:""}${nextDate!=="TBA"?`Next vaccination/worming: ${nextDate}\n`:""}\n${shareLink?"View the latest photos and documents here:\n"+shareLink+"\n\n":""}Please let me know if you would like any additional updates.\n\nKind regards,\nIziPaws 🐾`,
    };
    return {
      subject: `Deposit Confirmed — ${puppy.name||"Your Puppy"} is Reserved for You! 🐾`,
      message: `Thank you for your deposit for ${puppy.name||"your puppy"}.\n\nYour puppy is now reserved for you. We will continue to provide regular updates, photos and videos until collection day.\n\n${shareLink?"View photos and updates here:\n"+shareLink+"\n\n":""}Please feel free to contact us anytime if you have any questions.\n\nKind regards,\nIziPaws 🐾`,
    };
  };

  const sendShareEmail = async () => {
    if(!emailTo)return;
    setSending(true);
    try {
      const {subject,message} = getEmailContent();
      await sendEmail(emailTo, toName, subject, message);
      setSentMsg("✓ Email sent!");
    } catch(e){ setSentMsg("Error — check EmailJS"); console.error(e); }
    setSending(false);
    setTimeout(()=>setSentMsg(""),3000);
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-lg)",padding:20,width:"100%",maxWidth:460,display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:15,fontWeight:600}}>📤 Share — {puppy.name}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"var(--color-text-tertiary)"}}>✕</button>
        </div>

        {/* Step 1: What to share */}
        <div>
          {lbl("What to share")}
          <div style={{display:"flex",gap:6}}>
            {[{k:"both",l:"Photos + Docs"},{k:"photos",l:"Photos only"},{k:"docs",l:"Docs only"}].map(o=>(
              <button key={o.k} onClick={()=>setShareWhat(o.k as any)} style={{flex:1,padding:"6px",borderRadius:6,fontSize:12,cursor:"pointer",border:shareWhat===o.k?"1.5px solid #534AB7":"1px solid var(--color-border-secondary)",background:shareWhat===o.k?"#EEEDFE":"var(--color-background-primary)",color:shareWhat===o.k?"#3C3489":"var(--color-text-secondary)"}}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* Step 2: Generate link */}
        {!shareId?(
          <button onClick={generateLink} disabled={generating} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"none",background:generating?"#888":"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>
            {generating?"Generating...":"🔗 Generate Share Link"}
          </button>
        ):(
          <div style={{background:"#EEEDFE",borderRadius:"var(--border-radius-md)",padding:"10px 12px"}}>
            <div style={{fontSize:11,color:"#3C3489",marginBottom:6,fontWeight:500}}>✅ Share link ready — valid 30 days:</div>
            <div style={{fontSize:11,wordBreak:"break-all",color:"#534AB7",marginBottom:8,background:"#fff",padding:"6px 8px",borderRadius:6}}>{shareLink}</div>
            <button onClick={copyLink} style={{width:"100%",padding:"7px",borderRadius:6,border:"none",background:copied?"#1D9E75":"#534AB7",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:500}}>{copied?"✓ Copied!":"📋 Copy Link"}</button>
          </div>
        )}

        {/* Step 3: Email */}
        <div style={{borderTop:"1px solid var(--color-border-tertiary)",paddingTop:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>📧 Send Email to Buyer</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>{lbl("Buyer Name")}<input value={toName} onChange={e=>setToName(e.target.value)} placeholder="Jane Smith" style={IS}/></div>
            <div>{lbl("Email Address")}<input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="jane@email.com" type="email" style={IS}/></div>
          </div>
          {lbl("Email Type")}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{k:"enquiry",l:"🔍 Enquiry"},{k:"update",l:"📸 Puppy Update"},{k:"deposit",l:"💰 Deposit Confirm"}].map(o=>(
              <button key={o.k} onClick={()=>setEmailType(o.k as any)} style={{flex:1,padding:"6px",borderRadius:6,fontSize:11,cursor:"pointer",border:emailType===o.k?"1.5px solid #534AB7":"1px solid var(--color-border-secondary)",background:emailType===o.k?"#EEEDFE":"var(--color-background-primary)",color:emailType===o.k?"#3C3489":"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{o.l}</button>
            ))}
          </div>
          {!shareId&&<div style={{fontSize:11,color:"#BA7517",background:"#FAEEDA",padding:"6px 10px",borderRadius:6}}>💡 Generate share link first to include it in the email</div>}
          <button onClick={sendShareEmail} disabled={sending||!emailTo} style={{width:"100%",padding:"9px",borderRadius:"var(--border-radius-md)",border:"none",background:sending||!emailTo?"#ccc":"#1D9E75",color:"#fff",fontSize:13,cursor:sending||!emailTo?"not-allowed":"pointer",fontWeight:500}}>
            {sending?"Sending...":sentMsg||"Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Receipt Modal ----
function ReceiptModal({puppy,litter,onClose}:{puppy:any;litter:any;onClose:()=>void}) {
  const [payment,setPayment] = useState({amount:"",type:"Deposit",date:todayDisplay(),notes:""});
  const [breederName,setBreederName] = useState("IziPaws");
  const [emailTo,setEmailTo] = useState(puppy.buyer?.email||"");
  const [toName,setToName] = useState(puppy.buyer?.name||"");
  const [sending,setSending] = useState(false);
  const [sentMsg,setSentMsg] = useState("");

  const printReceipt = () => {
    if(!payment.amount){alert("Please enter payment amount");return;}
    const html = generateReceiptHTML(puppy,litter,payment,breederName);
    const w = window.open("","_blank");
    if(!w)return;
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),500);
  };

  const sendReceiptEmail = async () => {
    if(!emailTo||!payment.amount)return;
    setSending(true);
    const buyer = puppy.buyer||{};
    const receiptText = `━━━━━━━━━━━━━━━━━━━━━━\n🐾 ${breederName}\n${payment.type.toUpperCase()} RECEIPT\n━━━━━━━━━━━━━━━━━━━━━━\n\nPuppy: ${puppy.name||"Unnamed"} ${puppy.gender?"("+puppy.gender+")":""}\n${puppy.puppyId?"Puppy ID: "+puppy.puppyId+"\n":""}${puppy.colour?"Colour: "+puppy.colour+"\n":""}Litter: ${litter.litterId||"—"}\nDate of Birth: ${formatDate(litter.dob)||"—"}\n${litter.sire?"Sire: "+litter.sire+"\n":""}${litter.dam?"Dam: "+litter.dam+"\n":""}\nBuyer: ${buyer.name||"—"}\n${buyer.phone?"Phone: "+buyer.phone+"\n":""}${buyer.address?"Address: "+buyer.address+"\n":""}\n━━━━━━━━━━━━━━━━━━━━━━\nAmount Paid: $${payment.amount} AUD\nPayment Type: ${payment.type}\nDate: ${payment.date}\n${payment.notes?"Notes: "+payment.notes+"\n":""}\n━━━━━━━━━━━━━━━━━━━━━━\n\nThank you for choosing ${breederName} 🐾`;
    try {
      await sendEmail(emailTo, toName, `${payment.type} Receipt — ${puppy.name||"Your Puppy"} 🐾`, receiptText);
      setSentMsg("✓ Receipt sent!");
    } catch(e){ setSentMsg("Error — check EmailJS"); console.error(e); }
    setSending(false);
    setTimeout(()=>setSentMsg(""),3000);
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-lg)",padding:20,width:"100%",maxWidth:440,display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:15,fontWeight:600}}>🧾 Receipt — {puppy.name}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"var(--color-text-tertiary)"}}>✕</button>
        </div>

        {puppy.buyer?.name&&(
          <div style={{background:"#EEEDFE",borderRadius:"var(--border-radius-md)",padding:"8px 12px",fontSize:12,color:"#3C3489"}}>
            👤 <strong>{puppy.buyer.name}</strong>{puppy.buyer.phone&&` · ${puppy.buyer.phone}`}{puppy.buyer.email&&` · ${puppy.buyer.email}`}
          </div>
        )}

        <div>{lbl("Breeder / Kennel Name")}<input value={breederName} onChange={e=>setBreederName(e.target.value)} style={IS}/></div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>{lbl("Payment Type")}<select value={payment.type} onChange={e=>setPayment(p=>({...p,type:e.target.value}))} style={IS}><option>Deposit</option><option>Full Payment</option><option>Balance</option><option>Other</option></select></div>
          <div>{lbl("Amount (AUD $)")}<input value={payment.amount} onChange={e=>setPayment(p=>({...p,amount:e.target.value}))} placeholder="500" style={IS}/></div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>{lbl("Payment Date")}<input value={payment.date} onChange={e=>setPayment(p=>({...p,date:e.target.value}))} style={IS}/></div>
          <div>{lbl("Notes")}<input value={payment.notes} onChange={e=>setPayment(p=>({...p,notes:e.target.value}))} placeholder="Bank transfer, cash..." style={IS}/></div>
        </div>

        <button onClick={printReceipt} style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:500}}>🖨️ Print / Save as PDF</button>

        <div style={{borderTop:"1px solid var(--color-border-tertiary)",paddingTop:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>📧 Email Receipt to Buyer</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>{lbl("Buyer Name")}<input value={toName} onChange={e=>setToName(e.target.value)} placeholder="Jane Smith" style={IS}/></div>
            <div>{lbl("Email Address")}<input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="jane@email.com" type="email" style={IS}/></div>
          </div>
          <button onClick={sendReceiptEmail} disabled={sending||!emailTo||!payment.amount} style={{width:"100%",padding:"9px",borderRadius:"var(--border-radius-md)",border:"none",background:sending||!emailTo||!payment.amount?"#ccc":"#1D9E75",color:"#fff",fontSize:13,cursor:sending||!emailTo||!payment.amount?"not-allowed":"pointer",fontWeight:500}}>
            {sending?"Sending...":sentMsg||"Send Receipt by Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Public Share View (shown when ?share=ID in URL) ----
export function PuppyShareView({shareId}:{shareId:string}) {
  const [data,setData] = useState<any>(null);
  const [loading,setLoading] = useState(true);
  const [lightbox,setLightbox] = useState<string|null>(null);
  const [notFound,setNotFound] = useState(false);

  useEffect(()=>{
    const load = async () => {
      try {
        const snap = await getDoc(doc(db,"puppyShares",shareId));
        if(snap.exists()) setData(snap.data());
        else setNotFound(true);
      } catch(e){ setNotFound(true); }
      setLoading(false);
    };
    load();
  },[shareId]);

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#666"}}>Loading puppy info... 🐾</div>;
  if(notFound||!data) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#666",gap:12}}>
      <div style={{fontSize:48}}>🐾</div>
      <div style={{fontSize:18,fontWeight:500}}>Link not found or expired</div>
      <div style={{fontSize:13,color:"#999"}}>This share link may have expired or been removed.</div>
    </div>
  );

  return (
    <div style={{fontFamily:"sans-serif",maxWidth:560,margin:"0 auto",padding:"16px 12px",color:"#222"}}>
      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <img src={lightbox} alt="" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:8,objectFit:"contain"}}/>
          <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:16,right:16,width:32,height:32,borderRadius:"50%",background:"#fff",border:"none",cursor:"pointer",fontSize:16}}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{textAlign:"center",padding:"20px 0",borderBottom:"2px solid #534AB7",marginBottom:20}}>
        <div style={{fontSize:36,marginBottom:4}}>🐾</div>
        <div style={{fontSize:20,fontWeight:700,color:"#534AB7"}}>IziPaws</div>
        <div style={{fontSize:12,color:"#999",marginTop:4}}>Puppy Information</div>
      </div>

      {/* Puppy info */}
      <div style={{background:"#EEEDFE",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
        <div style={{fontSize:18,fontWeight:600,marginBottom:8}}>{data.puppyName}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",fontSize:13}}>
          {data.gender&&<div>Gender: <strong>{data.gender}</strong></div>}
          {data.colour&&<div>Colour: <strong>{data.colour}</strong></div>}
          {data.puppyId&&<div>ID: <strong>{data.puppyId}</strong></div>}
          {data.microchip&&<div>Microchip: <strong>{data.microchip}</strong></div>}
          {data.dob&&<div>Born: <strong>{formatDate(data.dob)}</strong></div>}
          {data.litterId&&<div>Litter: <strong>{data.litterId}</strong></div>}
          {data.sire&&<div>Sire: <strong>{data.sire}</strong></div>}
          {data.dam&&<div>Dam: <strong>{data.dam}</strong></div>}
          {data.latestWeight&&<div>Weight: <strong>{data.latestWeight}</strong></div>}
        </div>
      </div>

      {/* Vaccine / Worming */}
      {(data.vaccineInfo||data.wormInfo)&&(
        <div style={{background:"#fff",border:"1px solid #eee",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
          {data.vaccineInfo&&(
            <div style={{marginBottom:data.wormInfo?12:0}}>
              <div style={{fontSize:12,fontWeight:600,color:"#534AB7",marginBottom:6}}>💉 Vaccinations</div>
              {data.vaccineInfo.split("\n").filter(Boolean).map((v:string,i:number)=>(
                <div key={i} style={{fontSize:12,color:"#444",padding:"3px 0",borderBottom:"1px solid #f5f5f5"}}>✓ {v}</div>
              ))}
            </div>
          )}
          {data.wormInfo&&(
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"#534AB7",marginBottom:6}}>🐛 Worming</div>
              {data.wormInfo.split("\n").filter(Boolean).map((w:string,i:number)=>(
                <div key={i} style={{fontSize:12,color:"#444",padding:"3px 0",borderBottom:"1px solid #f5f5f5"}}>✓ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Photos */}
      {data.gallery&&data.gallery.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"#534AB7",marginBottom:10}}>🖼️ Photos ({data.gallery.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {data.gallery.map((img:any,i:number)=>(
              <div key={i} style={{position:"relative",aspectRatio:"1",borderRadius:8,overflow:"hidden",cursor:"pointer",background:"#f5f5f5"}} onClick={()=>setLightbox(img.url)}>
                <img src={img.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                {img.date&&<div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.45)",color:"#fff",fontSize:9,padding:"2px 4px",textAlign:"center"}}>{img.date}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {data.documents&&data.documents.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:"#534AB7",marginBottom:10}}>📁 Documents ({data.documents.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {data.documents.map((d:any,i:number)=>(
              <div key={i} style={{background:"#fff",border:"1px solid #eee",borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13}}>{d.fileType?.includes("pdf")?"📄":d.fileType?.includes("image")?"🖼️":"📎"} {d.name}</div>
                  <div style={{fontSize:11,color:"#999",marginTop:2}}>{d.date}</div>
                </div>
                <a href={d.url} download={d.name} style={{fontSize:12,padding:"5px 12px",borderRadius:6,border:"1px solid #534AB7",color:"#534AB7",textDecoration:"none",fontWeight:500}}>⬇ Download</a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{textAlign:"center",fontSize:12,color:"#aaa",marginTop:24,paddingTop:16,borderTop:"1px solid #eee"}}>
        Shared by IziPaws 🐾 · {formatDate(data.createdAt?.split("T")[0]||"")}
      </div>
    </div>
  );
}

// ---- DogSelect ----
function DogSelect({label,value,onChange,dogs}:{label:string;value:string;onChange:(v:string)=>void;dogs:any[]}) {
  const [mode,setMode] = useState<"select"|"manual">("select");
  const list = label.toLowerCase().includes("dam")?dogs.filter(d=>d.gender==="Female"||!d.gender):dogs.filter(d=>d.gender==="Male"||!d.gender);
  const displayList = list.length>0?list:dogs;
  return (
    <div>
      {lbl(label)}
      <div style={{display:"flex",gap:6,marginBottom:6}}>
        <button onClick={()=>setMode("select")} style={{flex:1,padding:"5px",borderRadius:6,border:mode==="select"?"1.5px solid #534AB7":"1px solid var(--color-border-secondary)",background:mode==="select"?"#EEEDFE":"var(--color-background-primary)",color:mode==="select"?"#3C3489":"var(--color-text-secondary)",fontSize:11,cursor:"pointer"}}>From Profiles</button>
        <button onClick={()=>setMode("manual")} style={{flex:1,padding:"5px",borderRadius:6,border:mode==="manual"?"1.5px solid #534AB7":"1px solid var(--color-border-secondary)",background:mode==="manual"?"#EEEDFE":"var(--color-background-primary)",color:mode==="manual"?"#3C3489":"var(--color-text-secondary)",fontSize:11,cursor:"pointer"}}>Manual</button>
      </div>
      {mode==="select"
        ?<select value={value} onChange={e=>onChange(e.target.value)} style={IS}><option value="">-- Select --</option>{displayList.map(d=><option key={d.id} value={d.callName?`${d.callName} (${d.name})`:d.name}>{d.callName?`${d.callName} (${d.name})`:d.name}{d.breed?` — ${d.breed}`:""}</option>)}</select>
        :<input value={value} onChange={e=>onChange(e.target.value)} placeholder={`Enter ${label.toLowerCase()} name...`} style={IS}/>
      }
    </div>
  );
}

// ---- EditLitterForm ----
function EditLitterForm({litter,dogs,onSave,onCancel}:{litter:any;dogs:any[];onSave:(u:any)=>void;onCancel:()=>void}) {
  const [form,setForm] = useState({litterId:litter.litterId||"",dob:litter.dob||"",sire:litter.sire||"",dam:litter.dam||"",maleCount:litter.maleCount||"",femaleCount:litter.femaleCount||"",notes:litter.notes||""});
  return (
    <div style={{background:"var(--color-background-primary)",borderRadius:"var(--border-radius-lg)",padding:"14px",border:"1.5px solid #534AB7",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:12,fontWeight:500,color:"#3C3489",textTransform:"uppercase",letterSpacing:"0.06em"}}>✏️ Edit Litter</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>{lbl("Litter ID")}<input value={form.litterId} onChange={e=>setForm(p=>({...p,litterId:e.target.value}))} style={IS}/></div>
        <div>{lbl("Date of Birth")}<input type="date" value={form.dob} onChange={e=>setForm(p=>({...p,dob:e.target.value}))} style={IS}/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <DogSelect label="Sire (Father)" value={form.sire} onChange={v=>setForm(p=>({...p,sire:v}))} dogs={dogs}/>
        <DogSelect label="Dam (Mother)" value={form.dam} onChange={v=>setForm(p=>({...p,dam:v}))} dogs={dogs}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>{lbl("No. of Males")}<input value={form.maleCount} onChange={e=>setForm(p=>({...p,maleCount:e.target.value}))} placeholder="0" style={IS}/></div>
        <div>{lbl("No. of Females")}<input value={form.femaleCount} onChange={e=>setForm(p=>({...p,femaleCount:e.target.value}))} placeholder="0" style={IS}/></div>
      </div>
      <div>{lbl("Notes")}<input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={IS}/></div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>onSave({...litter,...form})} style={{flex:1,padding:"9px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>✓ Save Changes</button>
        <button onClick={onCancel} style={{flex:1,padding:"9px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );
}

// ---- PuppyCard ----
function PuppyCard({puppy,litterId,litter,litters,onChange}:{puppy:any;litterId:string;litter:any;litters:any[];onChange:(l:any[])=>void}) {
  const [open,setOpen] = useState(false);
  const [subTab,setSubTab] = useState("info");
  const [showAddWeight,setShowAddWeight] = useState(false);
  const [newWeight,setNewWeight] = useState({kg:"",date:todayISO(),notes:""});
  const [editWeightId,setEditWeightId] = useState<string|null>(null);
  const [editWeightForm,setEditWeightForm] = useState({kg:"",date:"",notes:""});
  const [showAddVax,setShowAddVax] = useState(false);
  const [newVax,setNewVax] = useState({name:"",date:"",nextDate:""});
  const [showAddWorm,setShowAddWorm] = useState(false);
  const [newWorm,setNewWorm] = useState({name:"",date:"",nextDate:"",notes:""});
  const [showBuyer,setShowBuyer] = useState(false);
  const [showShare,setShowShare] = useState(false);
  const [showReceipt,setShowReceipt] = useState(false);
  const [lightbox,setLightbox] = useState<string|null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const updatePuppy = (patch:any) => onChange(litters.map(l=>l.id===litterId?{...l,puppies:l.puppies.map((p:any)=>p.id===puppy.id?{...p,...patch}:p)}:l));
  const deletePuppy = () => { if(!confirm(`Delete ${puppy.name||"this puppy"}?`))return; onChange(litters.map(l=>l.id===litterId?{...l,puppies:l.puppies.filter((p:any)=>p.id!==puppy.id)}:l)); };
  const handleGallery = (e:React.ChangeEvent<HTMLInputElement>) => { Array.from(e.target.files||[]).forEach(f=>{ const r=new FileReader(); r.onload=ev=>updatePuppy({gallery:[...(puppy.gallery||[]),{id:genId(),url:ev.target?.result,name:f.name,date:new Date().toLocaleDateString("en-AU")}]}); r.readAsDataURL(f); }); };
  const handleDoc = (e:React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>updatePuppy({documents:[...(puppy.documents||[]),{id:genId(),name:f.name,docType:"Other",date:new Date().toLocaleDateString("en-AU"),url:ev.target?.result,fileType:f.type}]}); r.readAsDataURL(f); };
  const addVaccine = () => { if(!newVax.name||!newVax.date)return; updatePuppy({vaccines:[...(puppy.vaccines||[]),{id:genId(),...newVax}]}); setNewVax({name:"",date:"",nextDate:""}); setShowAddVax(false); };
  const addWorm = () => { if(!newWorm.name||!newWorm.date)return; updatePuppy({wormRecords:[...(puppy.wormRecords||[]),{id:genId(),...newWorm}]}); setNewWorm({name:"",date:"",nextDate:"",notes:""}); setShowAddWorm(false); };
  const addWeight = () => { if(!newWeight.kg)return; updatePuppy({weightHistory:[...(puppy.weightHistory||[]),{id:genId(),...newWeight}]}); setNewWeight({kg:"",date:todayISO(),notes:""}); setShowAddWeight(false); };
  const saveWeightEdit = (id:string) => { updatePuppy({weightHistory:(puppy.weightHistory||[]).map((w:any)=>w.id===id?{...w,...editWeightForm}:w)}); setEditWeightId(null); };

  const st = statusStyle(puppy.status||"Available");
  const latestWeight = (puppy.weightHistory||[]).slice(-1)[0];
  const SUBTABS = [
    {k:"info",label:"Info"},
    {k:"weight",label:`⚖️ Weight${(puppy.weightHistory||[]).length>0?` (${puppy.weightHistory.length})`:""}`},
    {k:"vaccine",label:`💉 Vaccines${(puppy.vaccines||[]).length>0?` (${puppy.vaccines.length})`:""}`},
    {k:"worming",label:`🐛 Worming${(puppy.wormRecords||[]).length>0?` (${puppy.wormRecords.length})`:""}`},
    {k:"gallery",label:`🖼️ Photos${(puppy.gallery||[]).length>0?` (${puppy.gallery.length})`:""}`},
    {k:"docs",label:`📁 Docs${(puppy.documents||[]).length>0?` (${puppy.documents.length})`:""}`},
  ];

  return (
    <div style={{border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",overflow:"hidden",background:"var(--color-background-primary)"}}>
      {showShare&&<ShareModal puppy={puppy} litter={litter} onClose={()=>setShowShare(false)}/>}
      {showReceipt&&<ReceiptModal puppy={puppy} litter={litter} onClose={()=>setShowReceipt(false)}/>}
      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:560,width:"100%",position:"relative"}}>
            <img src={lightbox} alt="" style={{width:"100%",borderRadius:8,maxHeight:"80vh",objectFit:"contain"}}/>
            <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:-12,right:-12,width:28,height:28,borderRadius:"50%",background:"#fff",border:"none",cursor:"pointer",fontSize:14}}>✕</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer",userSelect:"none"}} onClick={()=>setOpen(o=>!o)}>
        <div style={{width:44,height:44,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1.5px solid var(--color-border-tertiary)",position:"relative"}}>
          {(puppy.gallery||[]).length>0?<img src={puppy.gallery[0].url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🐶"}
          {puppy.collarColour&&<div style={{position:"absolute",bottom:1,right:1,width:12,height:12,borderRadius:"50%",background:puppy.collarColour.toLowerCase(),border:"1.5px solid #fff"}}/>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:500,fontSize:13,display:"flex",alignItems:"center",gap:6}}>
            {puppy.name||"Unnamed"}
            {puppy.gender&&<span style={{fontSize:11,color:puppy.gender==="Male"?"#185FA5":"#993556"}}>{puppy.gender==="Male"?"♂":"♀"}</span>}
          </div>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{[puppy.puppyId&&`ID: ${puppy.puppyId}`,puppy.colour,latestWeight&&`${latestWeight.kg} kg`].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
          <span style={{fontSize:11,padding:"3px 8px",borderRadius:99,fontWeight:500,background:st.bg,color:st.color}}>{puppy.status||"Available"}</span>
          <button onClick={e=>{e.stopPropagation();setShowShare(true);}} title="Share photos & docs" style={{background:"none",border:"1px solid var(--color-border-secondary)",borderRadius:6,cursor:"pointer",color:"var(--color-text-secondary)",fontSize:11,padding:"3px 7px"}}>📤</button>
          <button onClick={e=>{e.stopPropagation();setShowReceipt(true);}} title="Create receipt" style={{background:"none",border:"1px solid var(--color-border-secondary)",borderRadius:6,cursor:"pointer",color:"var(--color-text-secondary)",fontSize:11,padding:"3px 7px"}}>🧾</button>
          <span style={{fontSize:14,color:"var(--color-text-tertiary)",transform:open?"rotate(180deg)":"none",transition:"transform 0.18s"}}>▾</span>
          <button onClick={e=>{e.stopPropagation();deletePuppy();}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16,padding:"0 2px"}}>✕</button>
        </div>
      </div>

      {open&&(
        <div style={{borderTop:"1px solid var(--color-border-tertiary)",padding:"12px 14px",background:"var(--color-background-secondary)"}}>
          <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
            {SUBTABS.map(t=><button key={t.k} onClick={()=>setSubTab(t.k)} style={{padding:"5px 9px",borderRadius:"var(--border-radius-md)",fontSize:11,cursor:"pointer",border:subTab===t.k?"1.5px solid #534AB7":"1.5px solid var(--color-border-tertiary)",background:subTab===t.k?"#EEEDFE":"var(--color-background-primary)",color:subTab===t.k?"#3C3489":"var(--color-text-secondary)",whiteSpace:"nowrap"}}>{t.label}</button>)}
          </div>

          {subTab==="info"&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>{lbl("Name")}<input value={puppy.name||""} onChange={e=>updatePuppy({name:e.target.value})} placeholder="Puppy name..." style={IS}/></div>
                <div>{lbl("Gender")}<select value={puppy.gender||""} onChange={e=>updatePuppy({gender:e.target.value})} style={IS}><option value="">-- Select --</option><option>Male</option><option>Female</option></select></div>
                <div>
                  {lbl("Puppy ID")}
                  <input value={puppy.puppyId||""} onChange={e=>updatePuppy({puppyId:e.target.value})} placeholder="Auto-generate below..." style={IS}/>
                  <div style={{fontSize:10,color:"#534AB7",marginTop:2,cursor:"pointer"}} onClick={()=>updatePuppy({puppyId:generatePuppyId(litter.litterId,puppy.gender,litter.puppies.filter((p:any)=>p.id!==puppy.id))})}>↻ Auto-generate ID</div>
                </div>
                <div>{lbl("Microchip No.")}<input value={puppy.microchip||""} onChange={e=>updatePuppy({microchip:e.target.value})} placeholder="(add when available)" style={IS}/></div>
                <div>{lbl("Coat Colour")}<select value={puppy.colour||""} onChange={e=>updatePuppy({colour:e.target.value})} style={IS}><option value="">-- Select --</option>{COLOUR_LIST.map(c=><option key={c}>{c}</option>)}</select></div>
                <div>
                  {lbl("Collar Colour")}
                  <select value={puppy.collarColour||""} onChange={e=>updatePuppy({collarColour:e.target.value})} style={IS}><option value="">-- None --</option>{COLLAR_COLOURS.map(c=><option key={c}>{c}</option>)}</select>
                  {puppy.collarColour&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}><div style={{width:14,height:14,borderRadius:"50%",background:puppy.collarColour.toLowerCase(),border:"1px solid var(--color-border-secondary)"}}/><span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{puppy.collarColour}</span></div>}
                </div>
                <div style={{gridColumn:"1/-1"}}>{lbl("Status")}<select value={puppy.status||"Available"} onChange={e=>updatePuppy({status:e.target.value})} style={IS}>{PUPPY_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setShowShare(true)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid #534AB7",background:"#EEEDFE",color:"#3C3489",fontSize:12,cursor:"pointer"}}>📤 Share Photos & Docs</button>
                <button onClick={()=>setShowReceipt(true)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid #1D9E75",background:"#E1F5EE",color:"#0F6E56",fontSize:12,cursor:"pointer"}}>🧾 Create Receipt</button>
              </div>
              {(puppy.status==="Reserved"||puppy.status==="Sold"||puppy.status==="Deposit")&&(
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
                      <div>{lbl("Notes")}<textarea value={puppy.buyer?.notes||""} onChange={e=>updatePuppy({buyer:{...puppy.buyer,notes:e.target.value}})} placeholder="Deposit amount, pick-up date..." rows={2} style={{...IS,resize:"vertical",lineHeight:1.5,fontFamily:"var(--font-sans)"}}/></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {subTab==="weight"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(puppy.weightHistory||[]).length===0&&!showAddWeight&&<div style={{textAlign:"center",padding:"16px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No weight records yet</div>}
              {(puppy.weightHistory||[]).map((w:any)=>(
                editWeightId===w.id?(
                  <div key={w.id} style={{background:"var(--color-background-primary)",border:"1.5px solid #534AB7",borderRadius:"var(--border-radius-md)",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{fontSize:12,fontWeight:500,color:"#3C3489"}}>Edit Weight Record</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      <div>{lbl("Weight (kg)")}<input value={editWeightForm.kg} onChange={e=>setEditWeightForm(p=>({...p,kg:e.target.value}))} style={IS}/></div>
                      <div>{lbl("Date")}<input type="date" value={editWeightForm.date} onChange={e=>setEditWeightForm(p=>({...p,date:e.target.value}))} style={IS}/></div>
                      <div>{lbl("Notes")}<input value={editWeightForm.notes} onChange={e=>setEditWeightForm(p=>({...p,notes:e.target.value}))} style={IS}/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>saveWeightEdit(w.id)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:12,cursor:"pointer"}}>Save</button>
                      <button onClick={()=>setEditWeightId(null)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <div key={w.id} style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:500}}>⚖️ {w.kg} kg</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>📅 {formatDate(w.date)}{w.notes&&` · ${w.notes}`}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setEditWeightId(w.id);setEditWeightForm({kg:w.kg,date:w.date,notes:w.notes||""});}} style={{background:"none",border:"1px solid var(--color-border-secondary)",borderRadius:6,cursor:"pointer",color:"var(--color-text-secondary)",fontSize:11,padding:"3px 8px"}}>Edit</button>
                      <button onClick={()=>updatePuppy({weightHistory:(puppy.weightHistory||[]).filter((x:any)=>x.id!==w.id)})} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                    </div>
                  </div>
                )
              ))}
              {showAddWeight?(
                <div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"12px",display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>Add Weight Record</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <div>{lbl("Weight (kg)")}<input value={newWeight.kg} onChange={e=>setNewWeight(p=>({...p,kg:e.target.value}))} placeholder="0.5" style={IS}/></div>
                    <div>{lbl("Date")}<input type="date" value={newWeight.date} onChange={e=>setNewWeight(p=>({...p,date:e.target.value}))} style={IS}/></div>
                    <div>{lbl("Notes")}<input value={newWeight.notes} onChange={e=>setNewWeight(p=>({...p,notes:e.target.value}))} placeholder="Optional..." style={IS}/></div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={addWeight} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:12,cursor:"pointer"}}>Add</button>
                    <button onClick={()=>setShowAddWeight(false)} style={{flex:1,padding:"7px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              ):(
                <button onClick={()=>setShowAddWeight(true)} style={{width:"100%",padding:"8px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Weight Record</button>
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

          {subTab==="gallery"&&(
            <div>
              <input ref={galleryRef} type="file" accept="image/*" multiple onChange={handleGallery} style={{display:"none"}}/>
              <button onClick={()=>galleryRef.current?.click()} style={{width:"100%",padding:"9px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer",marginBottom:10}}>+ Upload Photos</button>
              {(puppy.gallery||[]).length===0&&<div style={{textAlign:"center",padding:"16px 0",color:"var(--color-text-tertiary)",fontSize:13}}>No photos yet</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {(puppy.gallery||[]).map((img:any)=>(
                  <div key={img.id} style={{position:"relative",borderRadius:"var(--border-radius-md)",overflow:"hidden",aspectRatio:"1",cursor:"pointer",background:"var(--color-background-secondary)"}} onClick={()=>setLightbox(img.url)}>
                    <img src={img.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    <button onClick={e=>{e.stopPropagation();updatePuppy({gallery:(puppy.gallery||[]).filter((x:any)=>x.id!==img.id)});}} style={{position:"absolute",top:3,right:3,width:20,height:20,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",cursor:"pointer",color:"#fff",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                    <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.45)",color:"#fff",fontSize:9,padding:"2px 4px",textAlign:"center"}}>{img.date}</div>
                  </div>
                ))}
              </div>
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

// ---- PuppyFilter ----
function PuppyFilter({puppies,litterId,litter,litters,onChange}:{puppies:any[];litterId:string;litter:any;litters:any[];onChange:(l:any[])=>void}) {
  const [filter,setFilter] = useState("All");
  const counts:Record<string,number> = {All:puppies.length};
  PUPPY_STATUSES.forEach(s=>{ counts[s]=puppies.filter((p:any)=>(p.status||"Available")===s).length; });
  const visible = filter==="All"?puppies:puppies.filter((p:any)=>(p.status||"Available")===filter);
  return (
    <div>
      <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
        {["All",...PUPPY_STATUSES].map(s=>{
          const st = s==="All"?{bg:"#EEEDFE",color:"#3C3489"}:statusStyle(s);
          const active=filter===s;
          return (counts[s]>0||s==="All")?(
            <button key={s} onClick={()=>setFilter(s)} style={{padding:"4px 10px",borderRadius:99,fontSize:11,cursor:"pointer",border:active?`1.5px solid ${st.color}`:"1.5px solid var(--color-border-tertiary)",background:active?st.bg:"var(--color-background-primary)",color:active?st.color:"var(--color-text-secondary)",fontWeight:active?500:400}}>
              {s} {counts[s]>0&&`(${counts[s]})`}
            </button>
          ):null;
        })}
      </div>
      {visible.length===0&&<div style={{textAlign:"center",padding:"12px 0",color:"var(--color-text-tertiary)",fontSize:12}}>No puppies{filter!=="All"?` with status "${filter}"`:" added yet"}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {visible.map((puppy:any)=>(
          <PuppyCard key={puppy.id} puppy={puppy} litterId={litterId} litter={litter} litters={litters} onChange={onChange}/>
        ))}
      </div>
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
  const [editingLitterId,setEditingLitterId] = useState<string|null>(null);
  const [newLitter,setNewLitter] = useState({litterId:"",dob:"",sire:"",dam:"",maleCount:"",femaleCount:"",notes:""});
  const [addPuppyFor,setAddPuppyFor] = useState<string|null>(null);
  const [newPuppy,setNewPuppy] = useState({name:"",gender:"",colour:"",collarColour:"",puppyId:"",microchip:"",status:"Available",buyer:{},vaccines:[],wormRecords:[],weightHistory:[],gallery:[],documents:[]});
  const [search,setSearch] = useState("");

  // Check for share link in URL
  

  useEffect(()=>{
    const load = async () => {
      try {
        const [ls,ds] = await Promise.all([getDoc(doc(db,"litters","all")),getDoc(doc(db,"dogProfiles","all"))]);
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
    const updated=[...litters,litter]; setLitters(updated); save(updated);
    setNewLitter({litterId:"",dob:"",sire:"",dam:"",maleCount:"",femaleCount:"",notes:""});
    setShowAddLitter(false);
    setExpandedIds(prev=>new Set([...prev,litter.id]));
  };
  const deleteLitter = (id:string) => { if(!confirm("Delete this litter and all puppies?"))return; const updated=litters.filter(l=>l.id!==id); setLitters(updated); save(updated); };
  const saveLitterEdit = (updated:any) => { const nl=litters.map(l=>l.id===updated.id?updated:l); setLitters(nl); save(nl); setEditingLitterId(null); };
  const addPuppy = (litterId:string, litter:any) => {
    if(!newPuppy.name)return;
    const autoId = generatePuppyId(litter.litterId, newPuppy.gender, litter.puppies);
    const updated=litters.map(l=>l.id===litterId?{...l,puppies:[...l.puppies,{id:genId(),...newPuppy,puppyId:newPuppy.puppyId||autoId}]}:l);
    setLitters(updated); save(updated);
    setNewPuppy({name:"",gender:"",colour:"",collarColour:"",puppyId:"",microchip:"",status:"Available",buyer:{},vaccines:[],wormRecords:[],weightHistory:[],gallery:[],documents:[]});
    setAddPuppyFor(null);
  };
  const handleLittersChange = (updated:any[]) => { setLitters(updated); save(updated); };
  const stats = (l:any) => ({
    avail:l.puppies.filter((p:any)=>p.status==="Available"||!p.status).length,
    deposit:l.puppies.filter((p:any)=>p.status==="Deposit").length,
    reserved:l.puppies.filter((p:any)=>p.status==="Reserved").length,
    sold:l.puppies.filter((p:any)=>p.status==="Sold").length,
    kept:l.puppies.filter((p:any)=>p.status==="Kept").length,
  });
  const filtered = litters.filter(l=>!search||l.litterId?.toLowerCase().includes(search.toLowerCase())||l.sire?.toLowerCase().includes(search.toLowerCase())||l.dam?.toLowerCase().includes(search.toLowerCase()));

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,fontFamily:"var(--font-sans)",color:"var(--color-text-secondary)"}}>Loading litters...</div>;

  return (
    <div style={{fontFamily:"var(--font-sans)",color:"var(--color-text-primary)",maxWidth:680,margin:"0 auto",padding:"16px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Litters</div>
          <div style={{fontSize:18,fontWeight:500}}>{litters.length} litter{litters.length!==1?"s":""} recorded</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {syncMsg&&<span style={{fontSize:12,color:"#1D9E75"}}>{syncMsg}</span>}
          <button onClick={()=>save(litters)} disabled={syncing} style={{padding:"8px 14px",borderRadius:"var(--border-radius-md)",border:"none",background:syncing?"#888":"#1D9E75",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>💾 Save</button>
          <button onClick={()=>{setShowAddLitter(true);setEditingLitterId(null);}} style={{padding:"8px 14px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer"}}>+ New Litter</button>
        </div>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by litter ID, sire or dam..." style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:13,outline:"none",marginBottom:14}}/>
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
            <button onClick={()=>{setShowAddLitter(false);setNewLitter({litterId:"",dob:"",sire:"",dam:"",maleCount:"",femaleCount:"",notes:""});}} style={{flex:1,padding:"9px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
      {filtered.length===0&&!showAddLitter&&(
        <div style={{textAlign:"center",padding:"48px 0",color:"var(--color-text-tertiary)",fontSize:13}}>
          <div style={{fontSize:40,marginBottom:12}}>🐾</div>
          <div>{search?"No litters found":"No litters recorded yet — click + New Litter"}</div>
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {filtered.map(litter=>{
          const exp=expandedIds.has(litter.id);
          const s=stats(litter);
          const isEditing=editingLitterId===litter.id;
          return(
            <div key={litter.id} style={{border:`1px solid ${isEditing?"#534AB7":"var(--color-border-tertiary)"}`,borderRadius:"var(--border-radius-lg)",overflow:"hidden"}}>
              {isEditing?(
                <div style={{padding:"14px"}}><EditLitterForm litter={litter} dogs={dogs} onSave={saveLitterEdit} onCancel={()=>setEditingLitterId(null)}/></div>
              ):(
                <>
                  <div style={{background:"var(--color-background-secondary)",padding:"12px 14px",cursor:"pointer",userSelect:"none"}} onClick={()=>toggleLitter(litter.id)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:500,fontSize:14,display:"flex",alignItems:"center",gap:8}}>🐾 {litter.litterId}<span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)"}}>Born {formatDate(litter.dob)}</span></div>
                        <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:3}}>{[litter.sire&&`Sire: ${litter.sire}`,litter.dam&&`Dam: ${litter.dam}`].filter(Boolean).join(" · ")}</div>
                        {litter.puppies.length>0&&(
                          <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                            {s.avail>0&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:"#E1F5EE",color:"#0F6E56"}}>✔ {s.avail} Available</span>}
                            {s.deposit>0&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:"#FFF3CD",color:"#856404"}}>💰 {s.deposit} Deposit</span>}
                            {s.reserved>0&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:"#FAEEDA",color:"#633806"}}>⏳ {s.reserved} Reserved</span>}
                            {s.sold>0&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:"#FCEBEB",color:"#A32D2D"}}>🏷 {s.sold} Sold</span>}
                            {s.kept>0&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:99,background:"#EEEDFE",color:"#3C3489"}}>🏠 {s.kept} Kept</span>}
                          </div>
                        )}
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <span style={{background:"#EEEDFE",color:"#3C3489",fontSize:11,padding:"2px 8px",borderRadius:99}}>{litter.puppies.length} pup{litter.puppies.length!==1?"s":""}</span>
                        {litter.maleCount&&<span style={{fontSize:11,color:"#185FA5"}}>♂ {litter.maleCount}</span>}
                        {litter.femaleCount&&<span style={{fontSize:11,color:"#993556"}}>♀ {litter.femaleCount}</span>}
                        <button onClick={e=>{e.stopPropagation();setEditingLitterId(litter.id);setExpandedIds(prev=>{const n=new Set(prev);n.delete(litter.id);return n;});}} style={{background:"none",border:"1px solid var(--color-border-secondary)",borderRadius:6,cursor:"pointer",color:"var(--color-text-secondary)",fontSize:11,padding:"3px 8px"}}>✏️ Edit</button>
                        <span style={{fontSize:14,color:"var(--color-text-tertiary)",transform:exp?"rotate(180deg)":"none",transition:"transform 0.18s"}}>▾</span>
                        <button onClick={e=>{e.stopPropagation();deleteLitter(litter.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16}}>✕</button>
                      </div>
                    </div>
                    {litter.notes&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:6}}>📝 {litter.notes}</div>}
                  </div>
                  {exp&&(
                    <div style={{padding:"14px",background:"var(--color-background-primary)",display:"flex",flexDirection:"column",gap:10}}>
                      <PuppyFilter puppies={litter.puppies} litterId={litter.id} litter={litter} litters={litters} onChange={handleLittersChange}/>
                      {addPuppyFor===litter.id?(
                        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px",border:"1px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",gap:10}}>
                          <div style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)"}}>New Puppy</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                            <div>{lbl("Name")}<input value={newPuppy.name} onChange={e=>setNewPuppy(p=>({...p,name:e.target.value}))} placeholder="Puppy name..." style={IS}/></div>
                            <div>{lbl("Gender")}<select value={newPuppy.gender} onChange={e=>setNewPuppy(p=>({...p,gender:e.target.value}))} style={IS}><option value="">-- Select --</option><option>Male</option><option>Female</option></select></div>
                            <div>{lbl("Coat Colour")}<select value={newPuppy.colour} onChange={e=>setNewPuppy(p=>({...p,colour:e.target.value}))} style={IS}><option value="">-- Select --</option>{COLOUR_LIST.map(c=><option key={c}>{c}</option>)}</select></div>
                            <div>{lbl("Collar Colour")}<select value={newPuppy.collarColour} onChange={e=>setNewPuppy(p=>({...p,collarColour:e.target.value}))} style={IS}><option value="">-- None --</option>{COLLAR_COLOURS.map(c=><option key={c}>{c}</option>)}</select></div>
                            <div>{lbl("Puppy ID (auto)")}<input value={newPuppy.puppyId} onChange={e=>setNewPuppy(p=>({...p,puppyId:e.target.value}))} placeholder={`${litter.litterId||"LIT"}-M1 (auto)`} style={IS}/></div>
                            <div>{lbl("Status")}<select value={newPuppy.status} onChange={e=>setNewPuppy(p=>({...p,status:e.target.value}))} style={IS}>{PUPPY_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={()=>addPuppy(litter.id,litter)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"none",background:"#534AB7",color:"#fff",fontSize:13,cursor:"pointer"}}>Add Puppy</button>
                            <button onClick={()=>setAddPuppyFor(null)} style={{flex:1,padding:"8px",borderRadius:"var(--border-radius-md)",border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>Cancel</button>
                          </div>
                        </div>
                      ):(
                        <button onClick={()=>setAddPuppyFor(litter.id)} style={{width:"100%",padding:"9px",borderRadius:"var(--border-radius-md)",border:"1.5px dashed var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:13,cursor:"pointer"}}>+ Add Puppy</button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}