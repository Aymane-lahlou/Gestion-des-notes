import { BarChart3, BookOpen, FilePenLine, GraduationCap, Users } from "lucide-react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/admin/stats", label: "Statistiques", icon: BarChart3 },
  { to: "/admin/students", label: "Etudiants", icon: Users },
  { to: "/admin/subjects", label: "Matieres", icon: BookOpen },
  { to: "/admin/grades", label: "Notes", icon: FilePenLine },
];

const AdminSidebar = ({ refreshing }) => {
  return (
    <div className="card" style={styles.sidebarCard}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.8rem" }}>
        <GraduationCap size={20} className="text-crimson" />
        <h2 className="heading-md" style={{ marginBottom: 0 }}>Admin</h2>
      </div>
      <nav style={styles.nav}>
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              style={({ isActive }) => ({
                ...styles.link,
                ...(isActive ? styles.linkActive : {}),
              })}
            >
              <Icon size={15} />
              {link.label}
            </NavLink>
          );
        })}
      </nav>
      {refreshing ? (
        <p className="text-muted" style={{ fontSize: "0.9rem", marginTop: "0.8rem" }}>
          Synchronisation...
        </p>
      ) : null}
    </div>
  );
};

const styles = {
  sidebarCard: {
    padding: "1rem",
  },
  nav: {
    display: "grid",
    gap: "0.4rem",
  },
  link: {
    textDecoration: "none",
    color: "var(--color-oxford-blue)",
    fontWeight: 600,
    padding: "0.45rem 0.6rem",
    borderRadius: "var(--border-radius-sm)",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
  },
  linkActive: {
    backgroundColor: "var(--color-oxford-blue)",
    color: "var(--color-paper)",
    border: "1px solid var(--color-oxford-blue)",
  },
};

export default AdminSidebar;
