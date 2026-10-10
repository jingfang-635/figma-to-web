import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { OrganizationPage } from './pages/OrganizationPage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { DoctorsPage } from './pages/DoctorsPage'
import { SchedulesPage } from './pages/SchedulesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/organization" element={<OrganizationPage />} />
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/doctors" element={<DoctorsPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
