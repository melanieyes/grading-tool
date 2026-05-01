import { Routes, Route } from 'react-router-dom'
import './App.css'
import TopNav from './components/TopNav'
import HomePage from './pages/HomePage'
import EvaluationPage from './pages/EvaluationPage'
import QuestionIntakePage from './pages/QuestionIntakePage'
import RubricReviewPage from './pages/RubricReviewPage'
import SubmissionGradingPage from './pages/SubmissionGradingPage'

export default function App() {
  return (
    <div className="app-shell">
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/intake" element={<QuestionIntakePage />} />
        <Route path="/rubric" element={<RubricReviewPage />} />
        <Route path="/grading" element={<SubmissionGradingPage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
      </Routes>
    </div>
  )
}