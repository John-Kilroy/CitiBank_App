import { useState, useEffect } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'

function nextId(existing) {
  const nums = existing.map(a => parseInt((a.ID || '').replace('ACH-', '')) || 0)
  return `ACH-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
}

export default function Achievements() {
  const [achievements, setAchievements] = useState([])
  const [teams, setTeams] = useState([])
  const [empMap, setEmpMap] = useState({})
  const [rawAch, setRawAch] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterTeam, setFilterTeam] = useState('All')
  const [modal, setModal] = useState(null)   // null | 'create' | 'edit'
  const [form, setForm] = useState({ TeamId: '', Desc: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      const [achData, teamsData, individualsData] = await Promise.all([
        api.getAchievements(),
        api.getTeams(),
        api.getIndividuals(),
      ])

      const newEmpMap = {}
      individualsData.forEach(e => { newEmpMap[e.ID] = e })

      const teamMap = {}
      teamsData.forEach(t => { teamMap[t.ID] = t })

      const transformed = achData.map(ach => {
        const team = teamMap[ach.TeamId]
        const leader = team ? newEmpMap[team.LeaderId] : null
        return {
          id: ach.ID,
          teamId: ach.TeamId,
          teamName: team ? team.Name : ach.TeamId,
          leaderName: leader ? `${leader.Fname} ${leader.Lname}` : 'Unknown',
          desc: ach.Desc,
        }
      })

      transformed.sort((a, b) =>
        parseInt(b.id.replace('ACH-', '')) - parseInt(a.id.replace('ACH-', ''))
      )
      setRawAch(achData)
      setTeams(teamsData)
      setEmpMap(newEmpMap)
      setAchievements(transformed)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setForm({ TeamId: teams[0]?.ID || '', Desc: '' })
    setEditId(null)
    setModal('create')
  }

  const openEdit = (a) => {
    setForm({ TeamId: a.teamId, Desc: a.desc })
    setEditId(a.id)
    setModal('edit')
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this achievement?')) return
    try {
      await api.deleteAchievement(id)
      await load()
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'create') {
        const id = nextId(rawAch)
        await api.createAchievement({ ID: id, TeamId: form.TeamId, Desc: form.Desc })
      } else {
        await api.updateAchievement(editId, { ID: editId, TeamId: form.TeamId, Desc: form.Desc })
      }
      setModal(null)
      await load()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const { user } = useAuth()
  const isLeader = user?.Role === 'Leader'

  const teamNames = ['All', ...new Set(achievements.map(a => a.teamName))]

  const filtered = achievements.filter(a =>
    filterTeam === 'All' || a.teamName === filterTeam
  )

  if (loading) return <Spinner text="Fetching achievements…" />
  if (error) return <div>Error: {error}</div>

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Achievements</div>
          <div className="topbar-subtitle">{achievements.length} team accomplishments</div>
        </div>
        {isLeader && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={openCreate}>+ Add Achievement</button>
          </div>
        )}
      </div>

      <div className="page-content">
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Team</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {teamNames.map(t => (
                  <button
                    key={t}
                    className={`btn ${filterTeam === t ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                    onClick={() => setFilterTeam(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">★</div>
            <p>No achievements match the selected filter.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map(a => (
              <div key={a.id} className="achievement-card">
                <div className="achievement-icon">🏆</div>
                <div className="achievement-body">
                  <div className="achievement-title">{a.desc}</div>
                  <div className="achievement-meta">
                    <span className="badge badge-gold">{a.teamName}</span>
                    <span className="achievement-date">· Leader: {a.leaderName}</span>
                    {isLeader && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => openEdit(a)}>Edit</button>
                        <button className="btn btn-danger btn-icon" onClick={() => handleDelete(a.id)}>Del</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? 'Add Achievement' : 'Edit Achievement'}</div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Team</label>
                <select
                  className="form-input"
                  value={form.TeamId}
                  onChange={e => setForm(f => ({ ...f, TeamId: e.target.value }))}
                  required
                >
                  {teams.map(t => <option key={t.ID} value={t.ID}>{t.Name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  required
                  rows={4}
                  value={form.Desc}
                  onChange={e => setForm(f => ({ ...f, Desc: e.target.value }))}
                  placeholder="Describe the achievement…"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
