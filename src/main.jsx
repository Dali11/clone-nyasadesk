import React from 'react'
import { ThemeProvider } from '@/lib/ThemeContext'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider><App /></ThemeProvider>
)