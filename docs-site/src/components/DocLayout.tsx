import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function DocLayout() {
  return (
    <div className="mb-shell relative min-h-screen">
      <TopBar />
      <div className="relative z-10 mx-auto max-w-[1440px] px-4 sm:px-5 lg:px-6">
        <div className="grid grid-cols-1 gap-6 pt-5 lg:grid-cols-[300px_1fr] lg:gap-7 lg:pt-7">
          <aside className="hidden lg:block sticky top-24 h-[calc(100vh-112px)]">
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
