import {createRoot} from 'react-dom/client'
import { HashRouter } from 'react-router'
import './style.css'
import App from './App'

const container = document.getElementById('root')

const root = createRoot(container!)

// NOTE: React.StrictMode is intentionally omitted. @dnd-kit (the ordering board's
// drag layer) relies on pointer-event node registration that StrictMode's dev-only
// double-mount breaks under React 19, leaving cards undraggable. Dropping StrictMode
// only loses dev-time double-invoke checks; it has no production effect.
root.render(
    <HashRouter>
        <App/>
    </HashRouter>
)
