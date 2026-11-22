import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../App'
import { PetWindow } from '../pet/PetWindow'
import '../styles.css'
const view = new URLSearchParams(location.search).get('view') ?? 'control'
document.body.dataset.view = view
document.documentElement.dataset.view = view
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'pet' ? (
      <PetWindow />
    ) : view === 'overlay' ? (
      <div className="victory-overlay">NIGHTLORD SLAIN</div>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
