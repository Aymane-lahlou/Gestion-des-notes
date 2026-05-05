import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

const StudentOverviewPage = () => {
  const { user } = useAuth();
  const [studentProfile, setStudentProfile] = useState(null);
  const [averageData, setAverageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setLoading(true);
      setError("");
      try {
        const [studentsRes, averageRes] = await Promise.all([
          api.get("/students/"),
          api.get(`/stats/student/${user.id}/average/`),
        ]);
        const profile = Array.isArray(studentsRes.data)
          ? studentsRes.data.find((student) => String(student.id) === String(user.id)) || studentsRes.data[0]
          : null;
        setStudentProfile(profile || null);
        setAverageData(averageRes.data);
      } catch {
        setError("Impossible de charger les informations de l'etudiant.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const incompleteSubjects = useMemo(
    () => (Array.isArray(studentProfile?.incomplete_subjects) ? studentProfile.incomplete_subjects : []),
    [studentProfile]
  );

  const completenessLabel =
    studentProfile?.all_notes_present ? "Dossier complet" : "Dossier incomplet";

  if (loading) {
    return <div>Chargement...</div>;
  }

  return (
    <div>
      <header style={styles.header}>
        <h1 className="heading-jumbo">Vue Globale Etudiant</h1>
        <p className="text-muted">Suivi de votre progression et des matieres manquantes.</p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div style={styles.kpiGrid}>
        <div className="card">
          <h3 className="heading-md">Nom</h3>
          <p style={styles.value}>
            {user?.first_name} {user?.last_name}
          </p>
        </div>
        <div className="card">
          <h3 className="heading-md">Classe</h3>
          <p style={styles.value}>{studentProfile?.class_name || "N/A"}</p>
        </div>
        <div className="card">
          <h3 className="heading-md">Niveau</h3>
          <p style={styles.value}>{studentProfile?.study_year ?? "N/A"}</p>
        </div>
        <div className="card">
          <h3 className="heading-md">Moyenne</h3>
          <p style={styles.value}>
            {averageData?.average ? `${averageData.average}/20` : "Non calculable"}
          </p>
        </div>
        <div className="card">
          <h3 className="heading-md">Statut</h3>
          <span className={`badge ${averageData?.status === "pass" ? "badge-success" : "badge-warning"}`}>
            {averageData?.status === "pass"
              ? "Admis"
              : averageData?.status === "failed"
              ? "Echec"
              : "En attente"}
          </span>
        </div>
        <div className="card">
          <h3 className="heading-md">Completude</h3>
          <span className={`badge ${studentProfile?.all_notes_present ? "badge-success" : "badge-warning"}`}>
            {completenessLabel}
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.tableHeader}>
          <h2 className="heading-md" style={{ marginBottom: 0 }}>
            Matieres requises incompletes
          </h2>
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Matiere</th>
                <th>Enseignant</th>
              </tr>
            </thead>
            <tbody>
              {incompleteSubjects.length === 0 ? (
                <tr>
                  <td colSpan={2}>Aucune matiere manquante.</td>
                </tr>
              ) : null}
              {incompleteSubjects.map((item) => (
                <tr key={item.subject_id}>
                  <td>{item.subject_name}</td>
                  <td>{item.teacher_name}</td>
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
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "1rem",
    marginBottom: "1rem",
  },
  value: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--color-oxford-blue)",
  },
  tableHeader: {
    padding: "1rem",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
  },
  error: {
    marginBottom: "1rem",
    color: "#C62828",
    fontWeight: 600,
  },
};

export default StudentOverviewPage;
