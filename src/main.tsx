import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AppRoutes } from './AppRoutes.tsx'

const BASENAME = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASENAME}>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
