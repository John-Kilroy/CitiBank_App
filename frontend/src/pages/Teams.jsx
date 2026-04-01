import { useState, useEffect } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'

const REGIONS = ['NAM', 'LATAM', 'EU', 'APAC']
const ORGS = ['Credit Cards', 'Private Banking', 'Enterprise Technology', 'Global Functions Technologies', 'Business Organizations']

function nextId(existing) {
  const nums = existing.map(t => parseInt((t.ID || '').replace('TEAM-', '')) || 0)
  return `TEAM-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
}

const EMPTY_FORM = { Name: '', Region: 'NAM', Organization: 'Credit Cards', LeaderId: '', Members: [] }

export default function Teams() {
  const { user } = useAuth()
  const isLeader = user?.Role === 'Leader'

  const [teams, setTeams] = useState([])
  const [employees, setEmployees] = useState([])
  const [empMap, setEmpMap] = useState({})
  const [achMap, setAchMap] = useState({})  // teamId -> [achievement, ...]
  const [requests, setRequests] = useState([])  // all team requests
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [requestsPanel, setRequestsPanel] = useState(null)  // teamId shown in requests panel

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      const [teamsData, individualsData, achData, reqData] = await Promise.all([
        api.getTeams(), api.getIndividuals(), api.getAchievements(), api.getTeamRequests(),
      ])
      const map = {}
      individualsData.forEach(e => { map[e.ID] = e })
      const amap = {}
      achData.forEach(a => {
        if (!amap[a.TeamId]) amap[a.TeamId] = []
        amap[a.TeamId].push(a)
      })
      setTeams(teamsData)
      setEmployees(individualsData)
      setEmpMap(map)
      setAchMap(amap)
      setRequests(reqData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRequest = async (teamId) => {
    if (!user) return
    try {
      await api.createTeamRequest({ TeamId: teamId, EmployeeId: user.sub, Status: 'pending' })
      await load()
    } catch (err) {
      alert('Request failed: ' + err.message)
    }
  }

  const handleRequestAction = async (reqId, status) => {
    try {
      await api.updateTeamRequest(reqId, { Status: status })
      await load()
    } catch (err) {
      alert('Action failed: ' + err.message)
    }
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setModal('create')
  }

  const openEdit = (t) => {
    const leader = empMap[t.LeaderId]
    setForm({
      Name: t.Name,
      Region: t.Region || leader?.Region || 'NAM',
      Organization: t.Organization || '',
      LeaderId: t.LeaderId,
      Members: t.Members || [],
    })
    setEditId(t.ID)
    setModal('edit')
  }

  const handleRegionChange = (region) => {
    setForm(f => ({ ...f, Region: region, LeaderId: '', Members: [] }))
  }

  const handleLeaderChange = (leaderId) => {
    setForm(f => ({ ...f, LeaderId: leaderId, Members: leaderId ? [leaderId] : [] }))
  }

  const toggleMember = (empId) => {
    setForm(f => {
      if (f.LeaderId === empId) return f
      const already = f.Members.includes(empId)
      if (already) return { ...f, Members: f.Members.filter(id => id !== empId) }
      if (f.Members.length >= 5) return f
      return { ...f, Members: [...f.Members, empId] }
    })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this team?')) return
    try {
      await api.deleteTeam(id)
      await load()
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.LeaderId) return alert('Select a leader.')
    const members = form.Members.includes(form.LeaderId)
      ? form.Members
      : [form.LeaderId, ...form.Members]
    setSaving(true)
    try {
      // Promote leader if they're not already a Leader
      const leaderEmp = empMap[form.LeaderId]
      if (leaderEmp && leaderEmp.Role !== 'Leader') {
        await api.updateIndividual(form.LeaderId, { ...leaderEmp, Role: 'Leader' })
      }

      const payload = {
        Name: form.Name,
        Region: form.Region,
        Organization: form.Organization,
        LeaderId: form.LeaderId,
        Members: members,
      }
      if (modal === 'create') {
        await api.createTeam({ ID: nextId(teams), ...payload })
      } else {
        await api.updateTeam(editId, { ID: editId, ...payload })
      }
      setModal(null)
      await load()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Employees in the selected region (for leader + member dropdowns)
  const regionEmployees = employees.filter(e => e.Region === form.Region)
  const eligibleMembers = regionEmployees.filter(e => e.ID !== form.LeaderId)

  if (loading) return <Spinner text="Loading teams…" />
  if (error) return <div>Error: {error}</div>

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Teams</div>
          <div className="topbar-subtitle">{teams.length} teams — max 5 members each</div>
        </div>
        {isLeader && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={openCreate}>+ New Team</button>
          </div>
        )}
      </div>

      <div className="page-content">
        {teams.length === 0 ? (
          <div className="empty-state">
            <div className="icon">◈</div>
            <p>No teams yet. Add one to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {teams.map(t => {
              const leader = empMap[t.LeaderId]
              const memberList = (t.Members || []).map(id => empMap[id]).filter(Boolean)
              const region = t.Region || leader?.Region || '—'
              const achievements = achMap[t.ID] || []
              const isMember = user && (t.Members || []).includes(user.sub)
              const pendingReqs = requests.filter(r => r.TeamId === t.ID && r.Status === 'pending')
              const myRequest = requests.find(r => r.TeamId === t.ID && r.EmployeeId === user?.sub)
              const showRequestsPanel = requestsPanel === t.ID
              return (
                <div key={t.ID} className="card" style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{t.Name}</span>
                        <span className="badge badge-blue">{region}</span>
                        {t.Organization && <span className="badge badge-gold">{t.Organization}</span>}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.ID}</span>
                      </div>
                      {leader && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                          Leader: <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{leader.Fname} {leader.Lname}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: achievements.length ? '14px' : '0' }}>
                        {memberList.map(m => (
                          <span key={m.ID} className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                            {m.Fname} {m.Lname}{m.ID === t.LeaderId ? ' ★' : ''}
                          </span>
                        ))}
                      </div>
                      {achievements.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                            Achievements ({achievements.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {achievements.map(a => (
                              <div key={a.ID} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                <span style={{ color: 'var(--gold)', flexShrink: 0 }}>🏆</span>
                                <span>{a.Desc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Requests panel (leaders only) */}
                      {isLeader && showRequestsPanel && (
                        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                            Pending Join Requests
                          </div>
                          {pendingReqs.length === 0 ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No pending requests.</div>
                          ) : pendingReqs.map(r => {
                            const emp = empMap[r.EmployeeId]
                            return (
                              <div key={r.ID} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', flex: 1 }}>
                                  {emp ? `${emp.Fname} ${emp.Lname}` : r.EmployeeId}
                                </span>
                                <button className="btn btn-ghost btn-icon" onClick={() => handleRequestAction(r.ID, 'accepted')}>Accept</button>
                                <button className="btn btn-danger btn-icon" onClick={() => handleRequestAction(r.ID, 'rejected')}>Reject</button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                      {isLeader ? (
                        <>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-ghost btn-icon" onClick={() => openEdit(t)}>Edit</button>
                            <button className="btn btn-danger btn-icon" onClick={() => handleDelete(t.ID)}>Del</button>
                          </div>
                          <button
                            className={`btn btn-icon ${showRequestsPanel ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setRequestsPanel(showRequestsPanel ? null : t.ID)}
                          >
                            Requests{pendingReqs.length > 0 ? ` (${pendingReqs.length})` : ''}
                          </button>
                        </>
                      ) : !isMember && (
                        myRequest ? (
                          <span style={{ fontSize: '0.78rem', color: myRequest.Status === 'rejected' ? '#f87171' : 'var(--text-muted)' }}>
                            {myRequest.Status === 'pending' ? 'Request sent' : 'Request rejected'}
                          </span>
                        ) : (
                          <button className="btn btn-ghost btn-icon" onClick={() => handleJoinRequest(t.ID)}>
                            Request to Join
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? 'New Team' : 'Edit Team'}</div>
            <form onSubmit={handleSubmit}>

              <div className="form-group">
                <label className="form-label">Team Name</label>
                <input
                  className="form-input"
                  required
                  value={form.Name}
                  onChange={e => setForm(f => ({ ...f, Name: e.target.value }))}
                  placeholder="e.g. NAM Credit Cards"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div className="form-group">
                  <label className="form-label">Region</label>
                  <select
                    className="form-input"
                    value={form.Region}
                    onChange={e => handleRegionChange(e.target.value)}
                  >
                    {REGIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Organization</label>
                  <select
                    className="form-input"
                    value={form.Organization}
                    onChange={e => setForm(f => ({ ...f, Organization: e.target.value }))}
                  >
                    {ORGS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Leader</label>
                <select
                  className="form-input"
                  value={form.LeaderId}
                  onChange={e => handleLeaderChange(e.target.value)}
                  required
                >
                  <option value="">— Select leader —</option>
                  {regionEmployees.map(emp => (
                    <option key={emp.ID} value={emp.ID}>
                      {emp.Fname} {emp.Lname} · {emp.Organization}
                      {emp.Role !== 'Leader' ? '  ⬆ will be promoted' : ''}
                    </option>
                  ))}
                </select>
                {form.LeaderId && empMap[form.LeaderId]?.Role !== 'Leader' && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--gold)', marginTop: '6px' }}>
                    ⬆ {empMap[form.LeaderId]?.Fname} {empMap[form.LeaderId]?.Lname} will be promoted to Leader on save.
                  </div>
                )}
              </div>

              {form.LeaderId && (
                <div className="form-group">
                  <label className="form-label">
                    Members ({form.Members.length}/5 — {form.Region} region)
                  </label>
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--gold)' }}>
                      <input type="checkbox" checked readOnly disabled />
                      {empMap[form.LeaderId]?.Fname} {empMap[form.LeaderId]?.Lname} ★ Leader
                    </label>
                    {eligibleMembers.map(emp => {
                      const checked = form.Members.includes(emp.ID)
                      const atMax = form.Members.length >= 5 && !checked
                      return (
                        <label key={emp.ID} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          fontSize: '0.85rem',
                          color: atMax ? 'var(--text-muted)' : 'var(--text-primary)',
                          cursor: atMax ? 'not-allowed' : 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={atMax}
                            onChange={() => toggleMember(emp.ID)}
                          />
                          {emp.Fname} {emp.Lname} · {emp.Organization}
                          {atMax && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#f87171' }}>team full</span>}
                        </label>
                      )
                    })}
                    {eligibleMembers.length === 0 && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No other employees in {form.Region}.</div>
                    )}
                  </div>
                </div>
              )}

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
