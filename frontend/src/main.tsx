import React from 'react'
import {createRoot} from 'react-dom/client'
import { HashRouter } from 'react-router'
import './style.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <HashRouter>
            <App/>
        </HashRouter>
    </React.StrictMode>
)
