import { useState } from 'react';
import MotherDashboard from './MotherDashboard';
import { Assistant } from './Support';
export default function MotherExperience() {
  const [open,setOpen] = useState(false);
  return <><MotherDashboard /><aside className={`assistant-widget${open ? ' open' : ''}`} aria-label="MediMama Assistant">{open && <section className="assistant-window"><header><strong>MediMama Assistant</strong><button onClick={()=>setOpen(false)} aria-label="Close assistant">×</button></header><Assistant /></section>}<button className="assistant-launcher" onClick={()=>setOpen(!open)}><i className="fa-solid fa-robot" /><span>Chat with us</span></button></aside></>;
}
