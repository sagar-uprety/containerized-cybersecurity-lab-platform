export default function Header({ user, onLogout }) {
  const brandHref = user.role === "instructor" ? "/instructor" : "/";
  return (
    <header className="header">
      <a href={brandHref} className="header-brand">Thesis Lab Portal</a>
      <div className="header-user">
        <span>
          <strong>{user.username}</strong>{" "}
          <span className="badge" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
            {user.role}
          </span>
        </span>
        {user.role === "instructor" && (
          <a href="/instructor" className="btn btn-ghost btn-sm">Instructor</a>
        )}
        {user.role === "student" && (
          <a href="/" className="btn btn-ghost btn-sm">Labs</a>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
