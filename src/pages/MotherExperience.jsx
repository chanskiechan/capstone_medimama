import { useEffect, useState } from 'react';
import MotherDashboard from './MotherDashboard';
import { session } from '../care';

const Icon = ({ name }) => <i className={`fa-solid fa-${name}`} />;

function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ from: 'bot', text: 'Hi ' + (session().name || 'there') + '! How can I help with your maternal or baby-care questions today?' }]);
  useEffect(() => {
    const intercept = (event) => {
      const link = event.target.closest('a[href="/caregiver"]');
      if (!link) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, []);
  const send = (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((items) => [...items, { from: 'user', text }, { from: 'bot', text: 'I can help with appointment reminders, baby immunization, and general maternal-care guidance. For urgent symptoms, please contact your health center.' }]);
    setInput('');
  };
  return <aside className={`assistant-widget${open ? ' open' : ''}`} aria-label="MediMama Assistant"><section className="assistant-window"><header><span><Icon name="robot" /> MediMama Assistant</span><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button></header><div className="assistant-messages">{messages.map((message, index) => <p key={index} className={message.from}>{message.text}</p>)}</div><div className="assistant-prompts"><button type="button" onClick={() => setInput('When is my next appointment?')}>Next appointment</button><button type="button" onClick={() => setInput('What vaccine is due next?')}>Vaccines due</button></div><form onSubmit={send}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a message..." aria-label="Message MediMama Assistant" /><button aria-label="Send"><Icon name="paper-plane" /></button></form></section><button type="button" className="assistant-launcher" onClick={() => setOpen(!open)} aria-label="Open MediMama Assistant"><Icon name="robot" /><span>Chat with us</span></button></aside>;
}

export default function MotherExperience() { return <><MotherDashboard /><AssistantWidget /></>; }
