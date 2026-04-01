import { useState, useEffect } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'

const regionIcons = {
  NAM: '🌎',
  LATAM: '🌎',
  EU: '🌍',
  APAC: '🌏',
}

const regionBadgeClass = {
  NAM: 'badge-blue',
  LATAM: 'badge-green',
  EU: 'badge-gold',
  APAC: 'badge-purple',
}

const REGION_ORDER = ['NAM', 'LATAM', 'EU', 'APAC']

export default function Regions() {
  const [regions, setRegions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchRegions()
  }, [])

  const fetchRegions = async () => {
    try {
      const [individualsData, teamsData] = await Promise.all([
        api.getIndividuals(),
        api.getTeams(),
      ])

      const empMap = {}
      individualsData.forEach(e => { empMap[e.ID] = e })

      const regionData = {}
      REGION_ORDER.forEach(r => {
        regionData[r] = { region: r, employees: [], teamCount: 0 }
      })

      individualsData.forEach(e => {
        if (regionData[e.Region]) regionData[e.Region].employees.push(e)
      })

      teamsData.forEach(t => {
        const leader = empMap[t.LeaderId]
        if (leader && regionData[leader.Region]) regionData[leader.Region].teamCount++
      })

      setRegions(REGION_ORDER.map(r => regionData[r]))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner text="Finding regions…" />
  if (error) return <div>Error: {error}</div>

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Regions</div>
          <div className="topbar-subtitle">{regions.length} global regions</div>
        </div>
      </div>

      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Regions</div>
            <div className="stat-value">{regions.length}</div>
            <div className="stat-change">NAM · LATAM · EU · APAC</div>
          </div>
          {regions.map(r => (
            <div key={r.region} className="stat-card">
              <div className="stat-label">{r.region}</div>
              <div className="stat-value">{r.employees.length}</div>
              <div className="stat-change">{r.teamCount} team{r.teamCount !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        <div className="content-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {regions.map(r => (
            <div key={r.region} className="location-card">
              <div className="location-header">
                <div>
                  <div className="location-name">{r.region}</div>
                  <div className="location-country">{r.employees.length} members · {r.teamCount} team{r.teamCount !== 1 ? 's' : ''}</div>
                </div>
                <div className="location-icon">{regionIcons[r.region]}</div>
              </div>

              <div>
                <span className={`badge ${regionBadgeClass[r.region] || 'badge-gold'}`}>{r.region}</span>
              </div>

              <div className="location-stats" style={{ flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                {r.employees.filter(e => e.Role === 'Leader').map(leader => (
                  <div key={leader.ID} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{leader.Fname} {leader.Lname}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{leader.Organization}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
