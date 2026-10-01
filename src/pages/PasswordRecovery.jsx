import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageStyles } from '../components/PageStyles';
import { supabase } from '../lib/supabase';
import './Support.css';

export default function PasswordRecovery({reset=false}) {
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[done,setDone]=useState(false);
  useEffect(()=>{
    if(!reset)return;
    const {data:listener}=supabase.auth.onAuthStateChange((event,auth)=>{if(event==='PASSWORD_RECOVERY' || event==='INITIAL_SESSION')setReady(Boolean(auth));});
    supabase.auth.getSession().then(({data,error})=>{if(error)setError(error.message);setReady(Boolean(data.session));});
    return()=>listener.subscription.unsubscribe();
  },[reset]);
  const submit=async e=>{
    e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));setError('');setNotice('');
    if(reset && (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(values.password)))return setError('Use at least 8 characters, including uppercase, lowercase, a number and a symbol.');
    if(reset && values.password!==values.confirm)return setError('Passwords do not match.');
    setBusy(true);
    try{
      const result=reset?await supabase.auth.updateUser({password:values.password}):await supabase.auth.resetPasswordForEmail(values.email.trim(),{redirectTo:`${window.location.origin}/reset-password`});
      if(result.error)throw result.error;
      if(reset){await supabase.auth.signOut();localStorage.removeItem('medimama-current-session');setDone(true);setNotice('Password updated. You can now log in with your new password.');}
      else setNotice('If the address belongs to an account, a reset link will be sent. Check your inbox and spam folder.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <><PageStyles page="login"/><main style={{maxWidth:540,margin:'64px auto',padding:20}}><section className="support-panel"><h1>{reset?'Choose a new password':'Reset your password'}</h1>{error&&<p role="alert" className="support-message">{error}</p>}{notice&&<p role="status">{notice}</p>}{!done&&<form className="support-form" onSubmit={submit}>{reset?<><label>New password<input name="password" type="password" autoComplete="new-password" required maxLength={128}/></label><label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required maxLength={128}/></label>{!ready&&<p>Open the reset link from your email to continue. If it expired, request a new link.</p>}</>:<label>Email address<input name="email" type="email" autoComplete="email" required/></label>}<button disabled={busy||(reset&&!ready)}>{busy?'Please wait…':reset?'Save new password':'Send reset link'}</button></form>}<p><Link to="/login">Back to login</Link>{reset&&<> · <Link to="/forgot-password">Request another link</Link></>}</p></section></main></>;
}
