import { useState, useEffect } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'

export default function Dashboard() {
  const [stats, setStats] = useState({ members: 0, teams: 0, achievements: 0, regions: 0 })
  const [recentAchievements, setRecentAchievements] = useState([])
  const [leaders, setLeaders] = useState([])
  const [orgBreakdown, setOrgBreakdown] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [individualsData, teamsData, achData] = await Promise.all([
        api.getIndividuals(),
        api.getTeams(),
        api.getAchievements(),
      ])

      const regions = new Set(individualsData.map(e => e.Region)).size
      setStats({
        members: individualsData.length,
        teams: teamsData.length,
        achievements: achData.length,
        regions,
      })

      const teamMap = {}
      teamsData.forEach(t => { teamMap[t.ID] = t })
      const empMap = {}
      individualsData.forEach(e => { empMap[e.ID] = e })

      setRecentAchievements(
        achData.slice(0, 3).map(a => {
          const team = teamMap[a.TeamId]
          return { id: a.ID, desc: a.Desc, teamName: team ? team.Name : a.TeamId }
        })
      )

      setLeaders(
        individualsData.filter(e => e.Role === 'Leader').slice(0, 4).map(e => ({
          id: e.ID,
          name: `${e.Fname} ${e.Lname}`,
          role: `${e.Organization} Leader`,
          region: e.Region,
          initials: `${e.Fname[0]}${e.Lname[0]}`,
        }))
      )

      const orgCounts = {}
      individualsData.forEach(e => {
        orgCounts[e.Organization] = (orgCounts[e.Organization] || 0) + 1
      })
      const total = individualsData.length
      setOrgBreakdown(
        Object.entries(orgCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      )
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner text="Loading dashboard…" />

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Dashboard</div>
          <div className="topbar-subtitle">Welcome back — here's what's happening at ACME Inc.</div>
        </div>
      </div>

      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Members</div>
            <div className="stat-value">{stats.members}</div>
            <div className="stat-change">Across {stats.regions} regions</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Teams</div>
            <div className="stat-value">{stats.teams}</div>
            <div className="stat-change">Max 5 members per team</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Achievements</div>
            <div className="stat-value">{stats.achievements}</div>
            <div className="stat-change">Across all teams</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Regions</div>
            <div className="stat-value">{stats.regions}</div>
            <div className="stat-change">NAM · LATAM · EU · APAC</div>
          </div>
        </div>

        <div className="content-grid two-col">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Recent Achievements</div>
                <div className="card-subtitle">Latest team milestones</div>
              </div>
              <a href="/achievements" style={{ fontSize: '0.8rem' }}>View all →</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentAchievements.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🏆</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.desc}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.teamName}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Team Leaders</div>
                <div className="card-subtitle">One leader per team</div>
              </div>
              <a href="/members" style={{ fontSize: '0.8rem' }}>View all →</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {leaders.map(m => (
                <div key={m.id} className="member-cell">
                  <div className="avatar">{m.initials}</div>
                  <div className="member-info">
                    <div className="name">{m.name}</div>
                    <div className="email">{m.role} · {m.region}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Organization Headcount</div>
                <div className="card-subtitle">Distribution across organizations</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {orgBreakdown.map(d => (
                <div key={d.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{d.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.count} members</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
