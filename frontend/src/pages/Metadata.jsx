import { useState, useEffect } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'

export default function Metadata() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('team')
  const [teamMetadata, setTeamMetadata] = useState({})
  const [individualMetadata, setIndividualMetadata] = useState([])

  useEffect(() => {
    fetchMetadata()
  }, [])

  const fetchMetadata = async () => {
    try {
      const [teamsData, individualsData] = await Promise.all([api.getTeams(), api.getIndividuals()])

      const leaders = individualsData.filter(i => i.Role === 'Leader')
      const orgs = [...new Set(individualsData.map(i => i.Organization))]
      const regions = [...new Set(individualsData.map(i => i.Region))]

      setTeamMetadata({
        name: 'ACME Inc.',
        founded: '2021',
        industry: 'Financial Services',
        totalHeadcount: individualsData.length,
        totalTeams: teamsData.length,
        regions: regions.join(', '),
        organizations: orgs.join(', '),
        leaders: leaders.length,
      })

      setIndividualMetadata(
        individualsData.map(i => ({
          id: i.ID,
          initials: `${i.Fname[0]}${i.Lname[0]}`,
          name: `${i.Fname} ${i.Lname}`,
          role: i.Role,
          organization: i.Organization,
          region: i.Region,
          email: i.Email,
        }))
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner text="Fetching metadata…" />
  if (error) return <div>Error: {error}</div>

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Metadata</div>
          <div className="topbar-subtitle">Company and individual metadata</div>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button
            className={`btn ${activeTab === 'team' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('team')}
          >
            ⊞ Company Metadata
          </button>
          <button
            className={`btn ${activeTab === 'individual' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('individual')}
          >
            ◉ Individual Metadata
          </button>
        </div>

        {activeTab === 'team' && (
          <div className="card">
            <div className="card-header" style={{ marginBottom: '16px' }}>
              <div className="card-title">Company Profile</div>
            </div>
            <div className="meta-grid">
              {[
                ['Company', teamMetadata.name],
                ['Founded', teamMetadata.founded],
                ['Industry', teamMetadata.industry],
                ['Total Headcount', teamMetadata.totalHeadcount],
                ['Active Teams', teamMetadata.totalTeams],
                ['Team Leaders', teamMetadata.leaders],
                ['Regions', teamMetadata.regions],
                ['Organizations', teamMetadata.organizations],
              ].map(([k, v]) => (
                <div key={k} className="meta-item">
                  <span className="meta-key">{k}</span>
                  <span className="meta-value">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'individual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {individualMetadata.map(m => (
              <div key={m.id} className="card">
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '180px' }}>
                    <div className="avatar avatar-lg">{m.initials}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.email}</div>
                      <div style={{ marginTop: '6px' }}>
                        <span className={`badge ${m.role === 'Leader' ? 'badge-gold' : 'badge-blue'}`}>
                          {m.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="divider" style={{ width: '1px', height: 'auto', margin: '0 8px', background: 'var(--border)' }} />

                  <div style={{ flex: 1, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <div>
                      <div className="meta-key" style={{ marginBottom: '4px' }}>Organization</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.organization}</div>
                    </div>
                    <div>
                      <div className="meta-key" style={{ marginBottom: '4px' }}>Region</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.region}</div>
                    </div>
                    <div>
                      <div className="meta-key" style={{ marginBottom: '4px' }}>ID</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{m.id}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
