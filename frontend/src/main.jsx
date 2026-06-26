import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { ErrorBoundary } from './App.jsx'
import { Toaster } from 'react-hot-toast'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
    <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
  </ErrorBoundary>
)
