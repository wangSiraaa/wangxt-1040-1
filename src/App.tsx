import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import Layout from "@/components/Layout"
import Dashboard from "@/pages/Dashboard"
import QueuePage from "@/pages/QueuePage"
import StaffPage from "@/pages/StaffPage"
import OperationsPage from "@/pages/OperationsPage"
import OrdersPage from "@/pages/OrdersPage"

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
        </Routes>
      </Layout>
    </Router>
  )
}
