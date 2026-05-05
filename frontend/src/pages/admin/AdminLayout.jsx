import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";

const AdminLayout = () => {
  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const onResize = () => setIsCompactLayout(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div style={{ ...styles.layout, ...(isCompactLayout ? styles.layoutCompact : null) }} className="animate-fade-in-up">
      <aside style={{ ...styles.sidebar, ...(isCompactLayout ? styles.sidebarCompact : null) }}>
        <AdminSidebar />
      </aside>
      <div style={styles.content}>
        <Outlet />
      </div>
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
  layoutCompact: {
    gridTemplateColumns: "1fr",
  },
  sidebar: {
    position: "sticky",
    top: "100px",
  },
  sidebarCompact: {
    position: "static",
  },
  content: {
    minWidth: 0,
  },
};

export default AdminLayout;
