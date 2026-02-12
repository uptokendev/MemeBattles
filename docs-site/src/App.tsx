import { Navigate, Route, Routes } from 'react-router-dom'
import DocLayout from './components/DocLayout'
import DocPage from './components/DocPage'

export default function App() {
  return (
    <Routes>
      <Route element={<DocLayout />}>
        <Route path="/" element={<Navigate to="/introduction" replace />} />
        <Route path="/*" element={<DocPage />} />
      </Route>
    </Routes>
  )
}
