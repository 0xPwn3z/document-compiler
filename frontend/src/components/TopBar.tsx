export function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          dc
        </span>
        <span className="brand-name">Document Compiler</span>
      </div>
      <div className="security-note">
        <span className="pulse" aria-hidden="true" />
        locale · dati nel workspace
      </div>
    </header>
  )
}
