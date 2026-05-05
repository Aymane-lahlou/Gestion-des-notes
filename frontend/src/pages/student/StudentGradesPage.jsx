import { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { api } from "../../lib/api";

const StudentGradesPage = () => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const gradesRes = await api.get("/grades/?period=current");
        setGrades(gradesRes.data);
      } catch {
        setError("Impossible de charger vos notes.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const sortedGrades = useMemo(
    () =>
      [...grades].sort((a, b) => {
        const da = new Date(a.date_recorded);
        const db = new Date(b.date_recorded);
        return db - da;
      }),
    [grades]
  );

  if (loading) {
    return <div>Chargement...</div>;
  }

  return (
    <div>
      <header style={styles.header}>
        <h1 className="heading-jumbo">Mes Notes</h1>
        <p className="text-muted">Historique des notes de la periode courante.</p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.tableHeader}>
          <h2 className="heading-md" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Award className="text-crimson" /> Notes actuelles
          </h2>
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Matiere</th>
                <th>Type</th>
                <th>Periode</th>
                <th>Note</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sortedGrades.length === 0 ? (
                <tr>
                  <td colSpan={5}>Aucune note disponible.</td>
                </tr>
              ) : null}
              {sortedGrades.map((grade) => (
                <tr key={grade.id}>
                  <td style={{ fontWeight: 600 }}>{grade.subject_name || "-"}</td>
                  <td>{grade.grade_type}</td>
                  <td>{grade.period}</td>
                  <td>{grade.grade_value ?? "N/A"}</td>
                  <td>
                    <span className={`badge ${grade.status === "pass" ? "badge-success" : "badge-danger"}`}>
                      {grade.status === "pass" ? "Admis" : "Echec"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const styles = {
  header: {
    marginBottom: "1.5rem",
  },
  tableHeader: {
    padding: "1rem",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
  },
  error: {
    color: "#C62828",
    marginBottom: "1rem",
    fontWeight: 600,
  },
};

export default StudentGradesPage;
