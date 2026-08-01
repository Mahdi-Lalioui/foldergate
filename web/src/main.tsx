import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DesignSystem from './DesignSystem.tsx'

// Living style guide at /?design. Branching here rather than inside App keeps App's
// hooks unconditional -- an early return above useState breaks the Rules of Hooks.
const showDesignSystem = window.location.search.includes('design')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{showDesignSystem ? <DesignSystem /> : <App />}</StrictMode>,
)
