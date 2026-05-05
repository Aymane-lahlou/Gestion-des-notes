import { useEffect, useMemo, useState } from "react";
import { FilePenLine, Pencil } from "lucide-react";
import { api } from "../../lib/api";
import AdminAlerts from "./AdminAlerts";
import { buildClassLookup, dedupeClasses, normalizeClassName } from "./utils";

const initialGradeForm = {
  student: "",
  subject: "",
  grade_value: "",
};

const AdminGradesPage = () => {
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradeForm, setGradeForm] = useState(initialGradeForm);
  const [gradeEditId, setGradeEditId] = useState(null);
  const [gradeSearch, setGradeSearch] = useState("");
  const [gradeClassFilter, setGradeClassFilter] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const uniqueClasses = useMemo(() => dedupeClasses(classes), [classes]);
  const classNameById = useMemo(() => buildClassLookup(uniqueClasses), [uniqueClasses]);

  const loadData = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError("");
    }
    try {
      const [studentsRes, subjectsRes, classesRes, gradesRes] = await Promise.all([
        api.get("/students/?include_metrics=0"),
        api.get("/subjects/"),
        api.get("/classes/"),
        api.get("/grades/?period=current"),
      ]);
      setStudents(studentsRes.data);
      setSubjects(subjectsRes.data);
      setClasses(classesRes.data);
      setGrades(gradesRes.data);
    } catch {
      if (!silent) setError("Impossible de charger les notes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === String(gradeForm.subject)),
    [subjects, gradeForm.subject]
  );

  const studentsForGrade = useMemo(() => {
    if (!selectedSubject?.subject_class) {
      return students;
    }
    return students.filter(
      (student) => String(student.student_class) === String(selectedSubject.subject_class)
    );
  }, [students, selectedSubject]);

  const filteredGrades = useMemo(() => {
    const query = gradeSearch.trim().toLowerCase();
    const filterClassName = classNameById.get(String(gradeClassFilter)) || "";

    return grades.filter((grade) => {
      const name = (grade.student_name || "").toLowerCase();
      const subject = (grade.subject_name || "").toLowerCase();
      const className = (grade.class_name || "").toLowerCase();
      const classMatch = !gradeClassFilter || className === normalizeClassName(filterClassName);
      const searchMatch = !query || name.includes(query) || subject.includes(query) || className.includes(query);
      return classMatch && searchMatch;
    });
  }, [grades, gradeSearch, gradeClassFilter, classNameById]);

  const resetGradeForm = () => {
    setGradeEditId(null);
    setGradeForm(initialGradeForm);
  };

  const upsertGrade = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSavingGrade(true);
    try {
      const payload = {
        student: Number(gradeForm.student),
        subject: Number(gradeForm.subject),
        grade_value: Number(gradeForm.grade_value),
        period: "current",
        grade_type: "final",
      };

      if (gradeEditId) {
        await api.patch(`/grades/${gradeEditId}/`, payload);
        setMessage("Note mise a jour.");
      } else {
        const existing = grades.find(
          (grade) =>
            String(grade.student) === String(payload.student) &&
            String(grade.subject) === String(payload.subject) &&
            grade.period === "current"
        );
        if (existing) {
          await api.patch(`/grades/${existing.id}/`, payload);
          setMessage("Note mise a jour.");
        } else {
          await api.post("/grades/", payload);
          setMessage("Note ajoutee.");
        }
      }

      resetGradeForm();
      await loadData({ silent: true });
    } catch {
      setError("Enregistrement de la note impossible.");
    } finally {
      setSavingGrade(false);
    }
  };

  const editGrade = (grade) => {
    setGradeEditId(grade.id);
    setGradeForm({
      student: String(grade.student || ""),
      subject: String(grade.subject || ""),
      grade_value: grade.grade_value ?? "",
    });
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <FilePenLine size={34} className="text-crimson" />
          <h1 className="heading-jumbo" style={{ margin: 0 }}>Gestion Notes</h1>
        </div>
        <p className="text-muted" style={{ fontSize: "1.08rem" }}>
          Saisie et edition des notes finales par classe et matiere.
          {refreshing ? " Synchronisation..." : ""}
        </p>
      </header>

      <AdminAlerts message={message} error={error} />

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="heading-md">{gradeEditId ? "Modifier une note" : "Saisie / mise a jour d'une note"}</h2>
        <form onSubmit={upsertGrade} style={styles.formGrid}>
          <select className="form-control" value={gradeForm.subject} onChange={(e) => setGradeForm((prev) => ({ ...prev, subject: e.target.value }))} required>
            <option value="">Matiere</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name} ({subject.class_name})
              </option>
            ))}
          </select>
          <select className="form-control" value={gradeForm.student} onChange={(e) => setGradeForm((prev) => ({ ...prev, student: e.target.value }))} required>
            <option value="">Etudiant</option>
            {studentsForGrade.map((student) => (
              <option key={student.id} value={student.id}>
                {student.user.first_name} {student.user.last_name}
              </option>
            ))}
          </select>
          <input className="form-control" type="number" min="0" max="20" step="0.01" placeholder="Note /20" value={gradeForm.grade_value} onChange={(e) => setGradeForm((prev) => ({ ...prev, grade_value: e.target.value }))} required />
          <div style={styles.inlineButtons}>
            <button className="btn btn-primary" type="submit" disabled={savingGrade}>
              {savingGrade ? "Enregistrement..." : gradeEditId ? "Mettre a jour" : "Enregistrer"}
            </button>
            {gradeEditId ? <button className="btn btn-outline" type="button" onClick={resetGradeForm}>Annuler</button> : null}
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.searchToolbar}>
          <input className="form-control" placeholder="Recherche notes (etudiant, matiere, classe)..." value={gradeSearch} onChange={(e) => setGradeSearch(e.target.value)} />
          <select className="form-control" value={gradeClassFilter} onChange={(e) => setGradeClassFilter(e.target.value)}>
            <option value="">Toutes les classes</option>
            {uniqueClasses.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Etudiant</th>
                <th>Matiere</th>
                <th>Classe</th>
                <th>Note</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.length === 0 ? <tr><td colSpan={6}>Aucune note trouvee.</td></tr> : null}
              {filteredGrades.map((grade) => (
                <tr key={grade.id}>
                  <td>{grade.student_name}</td>
                  <td>{grade.subject_name}</td>
                  <td>{grade.class_name}</td>
                  <td>{grade.grade_value}</td>
                  <td>
                    <span className={`badge ${grade.status === "pass" ? "badge-success" : "badge-danger"}`}>
                      {grade.status === "pass" ? "Admis" : "Echec"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-outline" style={styles.smallBtn} onClick={() => editGrade(grade)}>
                      <Pencil size={14} /> Modifier
                    </button>
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
  searchToolbar: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: "0.75rem",
    padding: "1rem",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
  },
  smallBtn: {
    padding: "0.35rem 0.55rem",
    fontSize: "0.8rem",
  },
};

export default AdminGradesPage;
