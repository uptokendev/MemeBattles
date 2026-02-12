import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function DocLayout() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 pt-6">
          <aside className="hidden lg:block sticky top-20 h-[calc(100vh-96px)]">
            <Sidebar />
          </aside>
          <main className="min-w-0 pb-16">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
