import React from 'react'
import ReactDOM from 'react-dom/client'
import '../styles/base.css'
import '../styles/stage.css'
import { RendererErrorBoundary } from '../components/RendererErrorBoundary'
import { StageSurface } from './StageSurface'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RendererErrorBoundary surface="Stage">
      <StageSurface />
    </RendererErrorBoundary>
  </React.StrictMode>,
)
