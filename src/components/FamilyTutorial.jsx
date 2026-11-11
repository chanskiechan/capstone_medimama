import { useEffect, useMemo, useState } from 'react';
import './FamilyTutorial.css';

const tutorialSteps = {
  mother: [
    {
      icon: 'fa-house',
      label: 'Home',
      title: 'Magsimula sa Home',
      text: 'Dito makikita ang iyong care summary, susunod na appointment, pregnancy status, at mahahalagang paalala.',
    },
    {
      icon: 'fa-clipboard-list',
      label: 'Records',
      title: 'Tingnan ang iyong records',
      text: 'Buksan ang Records para makita ang prenatal, postnatal, immunization, appointment, at infant records. Maaari ring tingnan ang history at mag-download ng PDF.',
    },
    {
      icon: 'fa-people-group',
      label: 'Caregiver',
      title: 'Mag-manage ng caregiver',
      text: 'Sa Caregiver, maaari kang mag-request o mag-manage ng taong bibigyan mo ng access sa iyong care records.',
    },
    {
      icon: 'fa-bell',
      label: 'Notifications',
      title: 'Huwag palampasin ang updates',
      text: 'Pindutin ang bell icon para makita ang announcements, appointment updates, at reminders mula sa health center.',
    },
    {
      icon: 'fa-hand-holding-heart',
      label: 'Support',
      title: 'Humingi ng dagdag na tulong',
      text: 'Gamitin ang Care Request at Family Support para sa health education, concerns, at pakikipag-ugnayan sa health worker.',
    },
  ],
  caregiver: [
    {
      icon: 'fa-hand-holding-heart',
      label: 'Care workspace',
      title: 'Magsimula sa Care workspace',
      text: 'Dito mo makikita ang linked family care at mahahalagang update tungkol sa ina at sanggol na naka-link sa iyo.',
    },
    {
      icon: 'fa-clipboard-list',
      label: 'Records',
      title: 'Tingnan ang shared records',
      text: 'Buksan ang Records para makita ang maternal, infant, prenatal, postnatal, at immunization records ng linked family.',
    },
    {
      icon: 'fa-calendar-check',
      label: 'Appointments',
      title: 'Suriin ang appointments',
      text: 'Tingnan ang schedule, status, at updates ng appointments para mas madali mong matulungan ang iyong pamilya.',
    },
    {
      icon: 'fa-bell',
      label: 'Notifications',
      title: 'Basahin ang updates',
      text: 'Pindutin ang bell icon para makita ang announcements, appointment updates, at health reminders.',
    },
    {
      icon: 'fa-user',
      label: 'Profile',
      title: 'Panatilihing updated ang profile',
      text: 'Buksan ang profile menu para makita o i-update ang iyong account information at mag-log out nang maayos.',
    },
  ],
};

export default function FamilyTutorial({ role = 'mother', userId, userEmail }) {
  const userRole = role === 'caregiver' ? 'caregiver' : 'mother';
  const steps = useMemo(() => tutorialSteps[userRole], [userRole]);
  const tutorialIdentity = userId || userEmail || 'guest';
  const storageKey = `medimama-family-tutorial-v1-${userRole}-${tutorialIdentity}`;
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    let completed = false;
    try {
      completed = window.localStorage.getItem(storageKey) === 'done';
    } catch {
      completed = false;
    }
    if (!completed) {
      try {
        window.localStorage.setItem(storageKey, 'done');
      } catch {
        // The tutorial can still be shown when storage is unavailable.
      }
      setOpen(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeWithEscape = event => {
      if (event.key === 'Escape') finishTutorial();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  const finishTutorial = () => {
    try {
      window.localStorage.setItem(storageKey, 'done');
    } catch {
      // The tutorial can still be closed when storage is unavailable.
    }
    setOpen(false);
    setStepIndex(0);
  };

  const showTutorial = () => {
    setStepIndex(0);
    setOpen(true);
  };

  const nextStep = () => {
    if (stepIndex === steps.length - 1) finishTutorial();
    else setStepIndex(index => index + 1);
  };

  const currentStep = steps[stepIndex];
  return <>
    <button type="button" className="family-tutorial-launcher" onClick={showTutorial} aria-label="Buksan ang MediMama tutorial" title="Tutorial">
      <i className="fa-solid fa-circle-question" aria-hidden="true" />
      <span>Tutorial</span>
    </button>
    {open && <div className="family-tutorial-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && finishTutorial()}>
      <section className="family-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="family-tutorial-title" aria-describedby="family-tutorial-text">
        <header className="family-tutorial-header">
          <div>
            <p>MediMama guide</p>
            <h2 id="family-tutorial-title">{userRole === 'caregiver' ? 'Caregiver tutorial' : 'Mother tutorial'}</h2>
          </div>
          <button type="button" className="family-tutorial-close" onClick={finishTutorial} aria-label="Isara ang tutorial"><i className="fa-solid fa-xmark" aria-hidden="true" /></button>
        </header>
        <div className="family-tutorial-progress" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          <span>Step {stepIndex + 1} of {steps.length}</span>
          <div>{steps.map((item, index) => <i key={item.label} className={index === stepIndex ? 'active' : index < stepIndex ? 'complete' : ''} />)}</div>
        </div>
        <div className="family-tutorial-content">
          <div className="family-tutorial-icon"><i className={`fa-solid ${currentStep.icon}`} aria-hidden="true" /></div>
          <span className="family-tutorial-label">{currentStep.label}</span>
          <h3>{currentStep.title}</h3>
          <p id="family-tutorial-text">{currentStep.text}</p>
        </div>
        <footer className="family-tutorial-footer">
          <button type="button" className="family-tutorial-skip" onClick={finishTutorial}>Laktawan</button>
          <div>
            <button type="button" className="family-tutorial-secondary" onClick={() => setStepIndex(index => index - 1)} disabled={stepIndex === 0}>Bumalik</button>
            <button type="button" className="family-tutorial-primary" onClick={nextStep}>{stepIndex === steps.length - 1 ? 'Tapos na' : 'Susunod'} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button>
          </div>
        </footer>
      </section>
    </div>}
  </>;
}
