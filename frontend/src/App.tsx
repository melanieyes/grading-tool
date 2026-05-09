import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import TopNav from './components/TopNav'
import HomePage from './pages/HomePage'
import EvaluationPage from './pages/EvaluationPage'
import QuestionUploadPage from './pages/QuestionUploadPage'
import SubmissionGradingPage from './pages/SubmissionGradingPage'

export default function App() {
  return (
    <div className="app-shell">
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/intake" element={<QuestionUploadPage />} />
        <Route path="/rubric" element={<Navigate to="/intake" replace />} />
        <Route path="/grading" element={<SubmissionGradingPage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
      </Routes>
    </div>
  )
}
