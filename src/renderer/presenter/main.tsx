import React from 'react'
import ReactDOM from 'react-dom/client'
import { RendererErrorBoundary } from '../components/RendererErrorBoundary'
import { PresenterApp } from './PresenterApp'
import '../styles/base.css'
import './presenter.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RendererErrorBoundary surface="Presenter">
      <PresenterApp />
    </RendererErrorBoundary>
  </React.StrictMode>,
)
