export default function Spinner({ text = 'Loading…' }) {
  return (
    <div className="spinner-overlay">
      <div className="spinner-ring" />
      <div className="spinner-text">{text}</div>
    </div>
  )
}
