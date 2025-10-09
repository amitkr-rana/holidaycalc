import { Navigate, Route, Routes } from "react-router-dom"

import App from "./App"
import { HolidayDetailPage } from "./pages/HolidayDetailPage"

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/holiday/:country/:year/:month/:day" element={<HolidayDetailPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default AppRoutes
