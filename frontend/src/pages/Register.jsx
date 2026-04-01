import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

const REGIONS = ['NAM', 'LATAM', 'EU', 'APAC']
const ORGS    = ['Credit Cards', 'Private Banking', 'Enterprise Technology',
                 'Global Functions Technologies', 'Business Organizations']

function validatePassword(password) {
  if (password.length < 8) return false
  if (!/[a-zA-Z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  if (!/[^a-zA-Z0-9]/.test(password)) return false
  return true
}

export default function Register() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [form, setForm] = useState({
    Fname: '', Lname: '', Email: '', Region: 'NAM',
    Organization: 'Credit Cards', Password: '', Confirm: '',
  })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.Password !== form.Confirm) {
      setError('Passwords do not match')
      return
    }
    if (!validatePassword(form.Password)) {
      setError('Password must be at least 8 characters and include letters, numbers, and a special character')
      return
    }
    setLoading(true)
    try {
      const data = await api.register({
        Fname: form.Fname, Lname: form.Lname, Email: form.Email,
        Region: form.Region, Organization: form.Organization,
        Password: form.Password,
      })
      login(data.user, data.token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">ACME Inc.</div>
        <div className="auth-title">Create account</div>
        <div className="auth-subtitle">New employees start as Employee role</div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input className="form-input" required value={form.Fname} onChange={set('Fname')} />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input className="form-input" required value={form.Lname} onChange={set('Lname')} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" required value={form.Email} onChange={set('Email')} placeholder="you@acme.com" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">Region</label>
              <select className="form-input" value={form.Region} onChange={set('Region')}>
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Organization</label>
              <select className="form-input" value={form.Organization} onChange={set('Organization')}>
                {ORGS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" required value={form.Password} onChange={set('Password')} placeholder="••••••••" />
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '5px' }}>
              Min 8 chars · letters · numbers · one special character
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input className="form-input" type="password" required value={form.Confirm} onChange={set('Confirm')} placeholder="••••••••" />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
