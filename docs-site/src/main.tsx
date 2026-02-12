import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// Silence React Router v7 future-flag warnings without risking TS type mismatches.
// If you're on a router version that doesn't support these flags yet, the spread
// keeps the compiler happy and has no functional impact.
const routerFuture = {
  future: { v7_startTransition: true, v7_relativeSplatPath: true }
} as any

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter {...routerFuture}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
