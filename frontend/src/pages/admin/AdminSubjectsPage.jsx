import { useEffect, useMemo, useState } from "react";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import AdminAlerts from "./AdminAlerts";
import { dedupeClasses } from "./utils";

const initialSubjectForm = {
  name: "",
  coefficient: "",
  teacher: "",
  subject_class: "",
};

const AdminSubjectsPage = () => {
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjectForm, setSubjectForm] = useState(initialSubjectForm);
  const [subjectEditId, setSubjectEditId] = useState(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [deletingSubjectId, setDeletingSubjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const uniqueClasses = useMemo(() => dedupeClasses(classes), [classes]);

  const loadData = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError("");
    }
    try {
      const [subjectsRes, teachersRes, classesRes] = await Promise.all([
        api.get("/subjects/"),
        api.get("/teachers/"),
        api.get("/classes/"),
      ]);
      setSubjects(subjectsRes.data);
      setTeachers(teachersRes.data);
      setClasses(classesRes.data);
    } catch {
      if (!silent) setError("Impossible de charger les matieres.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSubjects = useMemo(() => {
    const query = subjectSearch.trim().toLowerCase();
    return subjects.filter((subject) => {
      const label = `${subject.name} ${subject.class_name} ${subject.teacher_name}`.toLowerCase();
      return !query || label.includes(query);
    });
  }, [subjects, subjectSearch]);

  const resetSubjectForm = () => {
    setSubjectEditId(null);
    setSubjectForm(initialSubjectForm);
  };

  const submitSubject = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        name: subjectForm.name,
        coefficient: Number(subjectForm.coefficient),
        teacher: Number(subjectForm.teacher),
        subject_class: Number(subjectForm.subject_class),
      };
      if (subjectEditId) {
        await api.patch(`/subjects/${subjectEditId}/`, payload);
        setMessage("Matiere mise a jour.");
      } else {
        await api.post("/subjects/", payload);
        setMessage("Matiere ajoutee.");
      }
      resetSubjectForm();
      await loadData({ silent: true });
    } catch {
      setError("Enregistrement matiere impossible.");
    }
  };

  const editSubject = (subject) => {
    setSubjectEditId(subject.id);
    setSubjectForm({
      name: subject.name || "",
      coefficient: subject.coefficient || "",
      teacher: subject.teacher || "",
      subject_class: subject.subject_class || "",
    });
  };

  const deleteSubject = async (subjectId) => {
    if (!window.confirm("Supprimer cette matiere ?")) return;
    setDeletingSubjectId(subjectId);
    setError("");
    setMessage("");
    try {
      await api.delete(`/subjects/${subjectId}/`);
      setSubjects((prev) => prev.filter((subject) => subject.id !== subjectId));
      if (subjectEditId === subjectId) resetSubjectForm();
      setMessage("Matiere supprimee.");
      loadData({ silent: true });
    } catch {
      setError("Suppression matiere impossible.");
    } finally {
      setDeletingSubjectId(null);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <BookOpen size={34} className="text-crimson" />
          <h1 className="heading-jumbo" style={{ margin: 0 }}>Gestion Matieres</h1>
        </div>
        <p className="text-muted" style={{ fontSize: "1.08rem" }}>
          Gestion des matieres, coefficients, classes et enseignants.
          {refreshing ? " Synchronisation..." : ""}
        </p>
      </header>

      <AdminAlerts message={message} error={error} />

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="heading-md">{subjectEditId ? "Modifier une matiere" : "Ajouter une matiere"}</h2>
        <form onSubmit={submitSubject} style={styles.formGrid}>
          <input className="form-control" value={subjectForm.name} onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nom matiere" required />
          <input className="form-control" type="number" min="0" step="0.01" value={subjectForm.coefficient} onChange={(e) => setSubjectForm((p) => ({ ...p, coefficient: e.target.value }))} placeholder="Coefficient" required />
          <select className="form-control" value={subjectForm.teacher} onChange={(e) => setSubjectForm((p) => ({ ...p, teacher: e.target.value }))} required>
            <option value="">Enseignant</option>
            {teachers.map((teacher) => (
              <option key={teacher.id || teacher.user.id} value={teacher.id || teacher.user.id}>
                {teacher.user.first_name} {teacher.user.last_name}
              </option>
            ))}
          </select>
          <select className="form-control" value={subjectForm.subject_class} onChange={(e) => setSubjectForm((p) => ({ ...p, subject_class: e.target.value }))} required>
            <option value="">Classe</option>
            {uniqueClasses.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
          <div style={styles.inlineButtons}>
            <button className="btn btn-primary" type="submit">{subjectEditId ? "Mettre a jour" : "Ajouter"}</button>
            {subjectEditId ? <button className="btn btn-outline" type="button" onClick={resetSubjectForm}>Annuler</button> : null}
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.searchToolbarSingle}>
          <input className="form-control" placeholder="Recherche matiere (nom, enseignant, classe)..." value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} />
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Matiere</th>
                <th>Classe</th>
                <th>Enseignant</th>
                <th>Coefficient</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubjects.length === 0 ? <tr><td colSpan={5}>Aucune matiere trouvee.</td></tr> : null}
              {filteredSubjects.map((subject) => (
                <tr key={subject.id}>
                  <td>{subject.name}</td>
                  <td>{subject.class_name}</td>
                  <td>{subject.teacher_name}</td>
                  <td>{subject.coefficient}</td>
                  <td>
                    <div style={styles.actionGroup}>
                      <button className="btn btn-outline" style={styles.smallBtn} onClick={() => editSubject(subject)}>
                        <Pencil size={14} /> Modifier
                      </button>
                      <button className="btn btn-outline" style={styles.smallBtn} onClick={() => deleteSubject(subject.id)} disabled={deletingSubjectId === subject.id}>
                        <Trash2 size={14} /> {deletingSubjectId === subject.id ? "Suppression..." : "Supprimer"}
                      </button>
                    </div>
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
    marginBottom: "2rem",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.9rem",
    marginBottom: "1rem",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "0.75rem",
  },
  inlineButtons: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
  searchToolbarSingle: {
    padding: "1rem",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
  },
  actionGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
  },
  smallBtn: {
    padding: "0.35rem 0.55rem",
    fontSize: "0.8rem",
  },
};

export default AdminSubjectsPage;
