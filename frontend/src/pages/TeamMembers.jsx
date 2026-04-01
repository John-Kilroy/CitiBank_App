import { useState, useEffect } from 'react'
import { api } from '../api'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'

const REGIONS = ['NAM', 'LATAM', 'EU', 'APAC']
const ORGS = ['Credit Cards', 'Private Banking', 'Enterprise Technology', 'Global Functions Technologies', 'Business Organizations']
const ROLES = ['Employee', 'Leader']

const orgBadgeClass = {
  'Credit Cards': 'badge-gold',
  'Private Banking': 'badge-blue',
  'Enterprise Technology': 'badge-purple',
  'Global Functions Technologies': 'badge-green',
  'Business Organizations': 'badge-green',
}

const EMPTY_FORM = { Fname: '', Lname: '', Email: '', Region: 'NAM', Organization: 'Credit Cards', Role: 'Employee' }

function nextId(existing) {
  const nums = existing.map(e => parseInt((e.ID || '').replace('EMP-', '')) || 0)
  return `EMP-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
}

export default function TeamMembers() {
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [empTeamMap, setEmpTeamMap] = useState({}) // empId -> [teamId, ...]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filterOrg, setFilterOrg] = useState('All')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedTeams, setSelectedTeams] = useState([])
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [emailError, setEmailError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      const [empData, teamsData] = await Promise.all([api.getIndividuals(), api.getTeams()])
      setMembers(empData)
      setTeams(teamsData)

      // Build map of empId -> [teamId, ...]
      const map = {}
      empData.forEach(e => { map[e.ID] = [] })
      teamsData.forEach(t => {
        (t.Members || []).forEach(empId => {
          if (!map[empId]) map[empId] = []
          map[empId].push(t.ID)
        })
      })
      setEmpTeamMap(map)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setSelectedTeams([])
    setEditId(null)
    setEmailError('')
    setModal('create')
  }

  const openEdit = (m) => {
    setForm({ Fname: m.Fname, Lname: m.Lname, Email: m.Email, Region: m.Region, Organization: m.Organization, Role: m.Role })
    setSelectedTeams(empTeamMap[m.ID] || [])
    setEditId(m.ID)
    setEmailError('')
    setModal('edit')
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this employee?')) return
    try {
      await api.deleteIndividual(id)
      // Remove from all teams they belong to
      for (const tid of (empTeamMap[id] || [])) {
        const team = teams.find(t => t.ID === tid)
        if (!team) continue
        await api.updateTeam(tid, { ...team, Members: (team.Members || []).filter(mid => mid !== id) })
      }
      await load()
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  const toggleTeam = (tid) => {
    setSelectedTeams(prev =>
      prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Client-side duplicate email check
    const duplicate = members.find(m =>
      m.Email.toLowerCase() === form.Email.toLowerCase() && m.ID !== editId
    )
    if (duplicate) {
      setEmailError(`Already used by ${duplicate.Fname} ${duplicate.Lname}`)
      return
    }
    setSaving(true)
    try {
      let empId
      if (modal === 'create') {
        empId = nextId(members)
        await api.createIndividual({ ID: empId, ...form })
      } else {
        empId = editId
        await api.updateIndividual(editId, { ID: editId, ...form })
      }

      // Diff team memberships and update changed teams
      const prevTeams = modal === 'edit' ? (empTeamMap[empId] || []) : []
      const toAdd = selectedTeams.filter(tid => !prevTeams.includes(tid))
      const toRemove = prevTeams.filter(tid => !selectedTeams.includes(tid))

      for (const tid of toAdd) {
        const team = teams.find(t => t.ID === tid)
        if (!team) continue
        await api.updateTeam(tid, { ...team, Members: [...(team.Members || []), empId] })
      }
      for (const tid of toRemove) {
        const team = teams.find(t => t.ID === tid)
        if (!team) continue
        await api.updateTeam(tid, { ...team, Members: (team.Members || []).filter(id => id !== empId) })
      }

      setModal(null)
      await load()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Teams in the same region as the form's current region
  const eligibleTeams = teams.filter(t => {
    const leader = members.find(m => m.ID === t.LeaderId)
    return leader && leader.Region === form.Region
  })

  const { user } = useAuth()
  const isLeader = user?.Role === 'Leader'

  const orgs = ['All', ...new Set(members.map(m => m.Organization).filter(Boolean))]

  const filtered = members.filter(m => {
    const matchSearch = `${m.Fname} ${m.Lname}`.toLowerCase().includes(search.toLowerCase()) ||
      (m.Role || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.Region || '').toLowerCase().includes(search.toLowerCase())
    const matchOrg = filterOrg === 'All' || m.Organization === filterOrg
    return matchSearch && matchOrg
  })

  if (loading) return <Spinner text="Fetching employees…" />
  if (error) return <div>Error: {error}</div>

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Team Members</div>
          <div className="topbar-subtitle">{members.length} people across {new Set(members.map(m => m.Region)).size} regions</div>
        </div>
        {isLeader && (
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={openCreate}>+ Add Member</button>
          </div>
        )}
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                className="search-input"
                placeholder="Search by name, role, region…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {orgs.map(o => (
                  <button
                    key={o}
                    className={`btn ${filterOrg === o ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                    onClick={() => setFilterOrg(o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="icon">◉</div>
              <p>No members match your search.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Organization</th>
                  <th>Region</th>
                  <th>Teams</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const memberTeams = (empTeamMap[m.ID] || []).map(tid => teams.find(t => t.ID === tid)).filter(Boolean)
                  return (
                    <tr key={m.ID}>
                      <td>
                        <div className="member-cell">
                          <div className="avatar">{m.Fname?.[0]}{m.Lname?.[0]}</div>
                          <div className="member-info">
                            <div className="name">{m.Fname} {m.Lname}</div>
                            <div className="email">{m.Email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${m.Role === 'Leader' ? 'badge-gold' : 'badge-blue'}`}>{m.Role}</span>
                      </td>
                      <td>
                        <span className={`badge ${orgBadgeClass[m.Organization] || 'badge-gold'}`}>{m.Organization}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{m.Region}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {memberTeams.length > 0
                            ? memberTeams.map(t => (
                                <span key={t.ID} className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{t.Name}</span>
                              ))
                            : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>None</span>
                          }
                        </div>
                      </td>
                      <td>
                        {isLeader && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-ghost btn-icon" onClick={() => openEdit(m)}>Edit</button>
                            <button className="btn btn-danger btn-icon" onClick={() => handleDelete(m.ID)}>Del</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? 'Add Member' : 'Edit Member'}</div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input className="form-input" required value={form.Fname} onChange={e => setForm(f => ({ ...f, Fname: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input className="form-input" required value={form.Lname} onChange={e => setForm(f => ({ ...f, Lname: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  required
                  value={form.Email}
                  onChange={e => { setEmailError(''); setForm(f => ({ ...f, Email: e.target.value })) }}
                  style={emailError ? { borderColor: '#f87171' } : {}}
                />
                {emailError && <div style={{ fontSize: '0.78rem', color: '#f87171', marginTop: '5px' }}>{emailError}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div className="form-group">
                  <label className="form-label">Region</label>
                  <select className="form-input" value={form.Region}
                    onChange={e => {
                      setForm(f => ({ ...f, Region: e.target.value }))
                      setSelectedTeams([]) // reset teams when region changes
                    }}>
                    {REGIONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={form.Role} onChange={e => setForm(f => ({ ...f, Role: e.target.value }))}>
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Organization</label>
                <select className="form-input" value={form.Organization} onChange={e => setForm(f => ({ ...f, Organization: e.target.value }))}>
                  {ORGS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Team Assignment (max 5 members per team)</label>
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}>
                  {eligibleTeams.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No teams in the {form.Region} region.</div>
                  ) : eligibleTeams.map(t => {
                    const isSelected = selectedTeams.includes(t.ID)
                    const currentCount = (t.Members || []).length
                    const atCapacity = currentCount >= 5 && !isSelected
                    return (
                      <label key={t.ID} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '0.85rem',
                        color: atCapacity ? 'var(--text-muted)' : 'var(--text-primary)',
                        cursor: atCapacity ? 'not-allowed' : 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={atCapacity}
                          onChange={() => toggleTeam(t.ID)}
                        />
                        {t.Name}
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: atCapacity ? '#f87171' : 'var(--text-muted)' }}>
                          {currentCount}/5{atCapacity ? ' — full' : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
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
