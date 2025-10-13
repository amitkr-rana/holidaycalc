import { Navigate, Route, Routes } from "react-router-dom"

import App from "./App"
import { HolidayDetailPage } from "./pages/HolidayDetailPage"
import { ItineraryPage } from "./pages/ItineraryPage"

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/holiday/:country/:year/:month/:day" element={<HolidayDetailPage />} />
      <Route path="/itinerary" element={<ItineraryPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default AppRoutes
