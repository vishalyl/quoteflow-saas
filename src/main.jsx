import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles/index.css'

// No StrictMode — prevents double-seeding in dev
ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter>
    <App />
  </HashRouter>
)
