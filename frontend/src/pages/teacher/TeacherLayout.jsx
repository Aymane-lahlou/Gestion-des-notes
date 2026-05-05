import { LayoutDashboard, NotebookPen } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/teacher/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/teacher/grades", label: "Saisie des notes", icon: NotebookPen },
];

const TeacherLayout = () => {
  return (
    <div style={styles.layout} className="animate-fade-in-up">
      <aside style={styles.sidebar}>
        <div className="card" style={styles.sidebarCard}>
          <h2 className="heading-md" style={{ marginBottom: "0.75rem" }}>
            Enseignant
          </h2>
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
        </div>
      </aside>
      <section style={styles.content}>
        <Outlet />
      </section>
    </div>
  );
};

const styles = {
  layout: {
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1fr)",
    gap: "1rem",
    alignItems: "start",
  },
  sidebar: {
    position: "sticky",
    top: "100px",
  },
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
  content: {
    minWidth: 0,
  },
};

export default TeacherLayout;
