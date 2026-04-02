import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/',             icon: '◈', label: 'Dashboard' },
  { to: '/members',      icon: '◉', label: 'Team Members' },
  { to: '/teams',        icon: '◇', label: 'Teams' },
  { to: '/locations',    icon: '◎', label: 'Regions' },
  { to: '/achievements', icon: '★', label: 'Achievements' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const initials = user ? `${user.Fname?.[0] || ''}${user.Lname?.[0] || ''}` : '?'

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>ACME Inc.</h1>
        <p>Team Dashboard</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-user-name">{user.Fname} {user.Lname}</div>
              <span className={`badge ${user.Role === 'Leader' ? 'badge-gold' : 'badge-blue'}`} style={{ fontSize: '0.65rem' }}>
                {user.Role}
              </span>
            </div>
          </div>
          <button className="btn btn-ghost sidebar-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        &copy; {new Date().getFullYear()} ACME Inc.
      </div>
    </aside>
  )
}
