import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

const TeacherGradesPage = () => {
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState([]);

  const [form, setForm] = useState({
    student: "",
    subject: "",
    grade_value: "",
  });

  const [studentSearchForm, setStudentSearchForm] = useState("");
  const [gradeSearch, setGradeSearch] = useState("");
  const [gradeClassFilter, setGradeClassFilter] = useState("");
  const [gradeSubjectFilter, setGradeSubjectFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [subjectsRes, studentsRes, gradesRes] = await Promise.all([
        api.get("/subjects/"),
        api.get("/students/?include_metrics=0"),
        api.get("/grades/?period=current"),
      ]);
      setSubjects(subjectsRes.data);
      setStudents(studentsRes.data);
      setGrades(gradesRes.data);
    } catch {
      setError("Impossible de charger les donnees enseignant.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const classOptions = useMemo(() => {
    const map = new Map();
    subjects.forEach((subject) => {
      if (subject.subject_class && subject.class_name) {
        map.set(subject.subject_class, subject.class_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [subjects]);

  const subjectFilterOptions = useMemo(() => {
    return subjects.filter((subject) => {
      if (!gradeClassFilter) return true;
      return String(subject.subject_class) === String(gradeClassFilter);
    });
  }, [subjects, gradeClassFilter]);

  useEffect(() => {
    if (!gradeSubjectFilter) return;
    const exists = subjectFilterOptions.some(
      (subject) => String(subject.id) === String(gradeSubjectFilter)
    );
    if (!exists) {
      setGradeSubjectFilter("");
    }
  }, [gradeSubjectFilter, subjectFilterOptions]);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === String(form.subject)),
    [subjects, form.subject]
  );

  const availableStudents = useMemo(() => {
    if (!selectedSubject?.subject_class) {
      return students;
    }
    return students.filter(
      (student) => String(student.student_class) === String(selectedSubject.subject_class)
    );
  }, [students, selectedSubject]);

  const filteredStudentsForForm = useMemo(() => {
    const query = studentSearchForm.trim().toLowerCase();
    return availableStudents.filter((student) => {
      const label =
        `${student.user.first_name} ${student.user.last_name} ${student.student_number || ""}`.toLowerCase();
      return !query || label.includes(query);
    });
  }, [availableStudents, studentSearchForm]);

  const filteredGrades = useMemo(() => {
    const query = gradeSearch.trim().toLowerCase();
    return grades.filter((grade) => {
      const selectedClassName = classOptions.find(
        (classItem) => String(classItem.id) === String(gradeClassFilter)
      )?.name;
      const classMatch = !gradeClassFilter || String(grade.class_name) === String(selectedClassName);
      const subjectMatch = !gradeSubjectFilter || String(grade.subject) === String(gradeSubjectFilter);
      const label =
        `${grade.student_name || ""} ${grade.subject_name || ""} ${grade.class_name || ""}`.toLowerCase();
      const searchMatch = !query || label.includes(query);
      return classMatch && subjectMatch && searchMatch;
    });
  }, [grades, gradeSearch, gradeClassFilter, gradeSubjectFilter, classOptions]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        student: Number(form.student),
        subject: Number(form.subject),
        grade_value: Number(form.grade_value),
        grade_type: "final",
        period: "current",
      };

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
        setMessage("Note enregistree.");
      }

      setForm((prev) => ({ ...prev, grade_value: "" }));
      await loadData();
    } catch (apiError) {
      setError(
        apiError?.response?.data?.detail ||
          apiError?.response?.data?.error ||
          "Echec de l'enregistrement de la note."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Chargement...</div>;
  }

  return (
    <div>
      <header style={styles.header}>
        <h1 className="heading-jumbo">Saisie des Notes</h1>
        <p className="text-muted">Saisissez et mettez a jour les notes de vos etudiants.</p>
      </header>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="heading-md">Saisie de note</h2>
        <form onSubmit={handleSubmit} style={styles.formGrid}>
          <div className="form-group">
            <label className="form-label">Matiere</label>
            <select className="form-control" name="subject" value={form.subject} onChange={handleChange} required>
              <option value="">Choisir une matiere</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} ({subject.class_name})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Recherche etudiant</label>
            <input
              className="form-control"
              placeholder="Nom ou matricule..."
              value={studentSearchForm}
              onChange={(event) => setStudentSearchForm(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Etudiant</label>
            <select className="form-control" name="student" value={form.student} onChange={handleChange} required>
              <option value="">Choisir un etudiant</option>
              {filteredStudentsForForm.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.user.first_name} {student.user.last_name} ({student.class_name})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Note /20</label>
            <input
              type="number"
              min="0"
              max="20"
              step="0.01"
              className="form-control"
              name="grade_value"
              value={form.grade_value}
              onChange={handleChange}
              required
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
        {message ? <p style={styles.success}>{message}</p> : null}
        {error ? <p style={styles.error}>{error}</p> : null}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.searchToolbar}>
          <input
            className="form-control"
            placeholder="Recherche notes (etudiant, matiere, classe)..."
            value={gradeSearch}
            onChange={(event) => setGradeSearch(event.target.value)}
          />
          <select className="form-control" value={gradeClassFilter} onChange={(event) => setGradeClassFilter(event.target.value)}>
            <option value="">Toutes les classes</option>
            {classOptions.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>
          <select className="form-control" value={gradeSubjectFilter} onChange={(event) => setGradeSubjectFilter(event.target.value)}>
            <option value="">Toutes les matieres</option>
            {subjectFilterOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Etudiant</th>
                <th>Classe</th>
                <th>Matiere</th>
                <th>Note</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.length === 0 ? (
                <tr>
                  <td colSpan={5}>Aucune note disponible.</td>
                </tr>
              ) : null}
              {filteredGrades.map((grade) => (
                <tr key={grade.id}>
                  <td>{grade.student_name}</td>
                  <td>{grade.class_name}</td>
                  <td>{grade.subject_name}</td>
                  <td>{grade.grade_value}</td>
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
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem",
  },
  searchToolbar: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr",
    gap: "0.75rem",
    padding: "1rem",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
  },
  success: {
    marginTop: "1rem",
    color: "#2E7D32",
    fontWeight: 600,
  },
  error: {
    marginTop: "1rem",
    color: "#C62828",
    fontWeight: 600,
  },
};

export default TeacherGradesPage;
