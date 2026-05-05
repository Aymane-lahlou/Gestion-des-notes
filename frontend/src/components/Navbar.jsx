import { BookOpen, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDefaultRouteByRole } from "../lib/routes";

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const roleLinks = {
    admin: [
      { to: "/admin/stats", label: "Administration", icon: ShieldCheck },
    ],
    teacher: [
      { to: "/teacher/dashboard", label: "Espace Enseignant", icon: UsersRound },
    ],
    student: [
      { to: "/student/overview", label: "Espace Etudiant", icon: UserRound },
    ],
  };

  const links = roleLinks[user.role] || [];

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.container}>
        <Link to={getDefaultRouteByRole(user.role)} style={styles.brand}>
          <BookOpen size={28} className="text-crimson" />
          <span style={styles.brandText}>Gestion des Notes</span>
        </Link>

        <div style={styles.links}>
          {links.map((link) => {
            const Icon = link.icon;
            const active =
              user.role === "admin"
                ? location.pathname.startsWith("/admin")
                : user.role === "teacher"
                ? location.pathname.startsWith("/teacher")
                : location.pathname.startsWith("/student");
            return (
              <Link
                key={link.to}
                to={link.to}
                style={{ ...styles.link, ...(active ? styles.activeLink : {}) }}
              >
                <Icon size={18} />
                {link.label}
              </Link>
            );
          })}
        </div>

        <div style={styles.actions}>
          <span className="text-muted" style={styles.userMeta}>
            {user.first_name} {user.last_name} ({user.role})
          </span>
          <button type="button" onClick={handleLogout} style={styles.logoutBtn}>
            <LogOut size={18} />
            <span>Deconnexion</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

const styles = {
  nav: {
    backgroundColor: "var(--color-paper)",
    borderBottom: "1px solid var(--color-border)",
    padding: "1rem 0",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    width: "90%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    textDecoration: "none",
  },
  brandText: {
    fontFamily: "var(--font-heading)",
    fontSize: "1.4rem",
    fontWeight: "700",
    color: "var(--color-oxford-blue)",
  },
  links: {
    display: "flex",
    gap: "1rem",
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    textDecoration: "none",
    color: "var(--color-ink-light)",
    fontFamily: "var(--font-heading)",
    fontWeight: "600",
  },
  activeLink: {
    color: "var(--color-crimson)",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  userMeta: {
    fontSize: "0.9rem",
  },
  logoutBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    textDecoration: "none",
    color: "var(--color-oxford-blue)",
    fontFamily: "var(--font-body)",
    fontWeight: "600",
    padding: "0.5rem 1rem",
    border: "1px solid var(--color-oxford-blue)",
    borderRadius: "var(--border-radius-sm)",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
};

export default Navbar;
