import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './store';
import { supabaseConfigured } from './lib/supabase';
import FormValidation from './components/FormValidation';
import './styles.css';
import './layout.css';

createRoot(document.getElementById('root')).render(
  supabaseConfigured ? (
    <BrowserRouter><StoreProvider><FormValidation /><App /></StoreProvider></BrowserRouter>
  ) : (
    <main role="alert" style={{ maxWidth: 640, margin: '64px auto', padding: 24, background: 'white', color: '#243530' }}>
      <h1>MediMama setup required</h1>
      <p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase project URL and publishable key:</p>
      <ul>
        <li><code>VITE_SUPABASE_URL</code></li>
        <li><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></li>
      </ul>
      <p>Restart the development server after saving the file.</p>
    </main>
  ),
);
