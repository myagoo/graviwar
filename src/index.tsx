import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GameDemo } from './GameDemo'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameDemo />
  </StrictMode>,
)
