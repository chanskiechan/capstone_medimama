import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './store';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter><StoreProvider><App /></StoreProvider></BrowserRouter>,
);
