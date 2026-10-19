import React from 'react'
import {createRoot} from 'react-dom/client'
import { HashRouter } from 'react-router'
import './style.css'
import App from './App'
import { FrontendErrorBoundary } from './shared/error-reporting/FrontendErrorBoundary'
import { frontendErrorReporter, installGlobalErrorHandlers } from './shared/error-reporting/install-global-error-handlers'

// Installed before the first render so a failure while mounting is reported too (P7).
installGlobalErrorHandlers(window, frontendErrorReporter)

createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <HashRouter>
            <FrontendErrorBoundary>
                <App/>
            </FrontendErrorBoundary>
        </HashRouter>
    </React.StrictMode>
)
