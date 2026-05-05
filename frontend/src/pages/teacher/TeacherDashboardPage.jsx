import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

const normalize = (value) => String(value || "").trim().toLowerCase();

const TeacherDashboardPage = () => {
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const [subjectsRes, studentsRes, gradesRes] = await Promise.all([
          api.get("/subjects/"),
          api.get("/students/"),
          api.get("/grades/?period=current"),
        ]);
        setSubjects(subjectsRes.data);
        setStudents(studentsRes.data);
        setGrades(gradesRes.data);
      } catch {
        setError("Impossible de charger le tableau de bord enseignant.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const classOptions = useMemo(() => {
    const map = new Map();
    subjects.forEach((subject) => {
      if (subject.subject_class && subject.class_name) {
        map.set(String(subject.subject_class), subject.class_name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [subjects]);

  const selectedClassName = useMemo(
    () => classOptions.find((classItem) => String(classItem.id) === String(selectedClass))?.name || "",
    [classOptions, selectedClass]
  );

  const subjectOptions = useMemo(() => {
    return subjects.filter((subject) => {
      if (!selectedClass) return true;
      return String(subject.subject_class) === String(selectedClass);
    });
  }, [subjects, selectedClass]);

  useEffect(() => {
    if (!selectedSubject) return;
    const stillValid = subjectOptions.some(
      (subject) => String(subject.id) === String(selectedSubject)
    );
    if (!stillValid) {
      setSelectedSubject("");
    }
  }, [selectedSubject, subjectOptions]);

  const selectedSubjectClassId = useMemo(
    () =>
      subjects.find((subject) => String(subject.id) === String(selectedSubject))
        ?.subject_class || null,
    [subjects, selectedSubject]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const classMatch =
        !selectedClass ||
        String(student.student_class) === String(selectedClass) ||
        normalize(student.class_name) === normalize(selectedClassName);

      const subjectMatch =
        !selectedSubject ||
        (selectedSubjectClassId &&
          (String(student.student_class) === String(selectedSubjectClassId) ||
            normalize(student.class_name) ===
              normalize(
                classOptions.find(
                  (classItem) => String(classItem.id) === String(selectedSubjectClassId)
                )?.name
              )));

      return classMatch && subjectMatch;
    });
  }, [
    students,
    selectedClass,
    selectedClassName,
    selectedSubject,
    selectedSubjectClassId,
    classOptions,
  ]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((subject) => {
      const classMatch =
        !selectedClass || String(subject.subject_class) === String(selectedClass);
      const subjectMatch =
        !selectedSubject || String(subject.id) === String(selectedSubject);
      return classMatch && subjectMatch;
    });
  }, [subjects, selectedClass, selectedSubject]);

  const filteredGrades = useMemo(() => {
    return grades.filter((grade) => {
      const classMatch =
        !selectedClass ||
        normalize(grade.class_name) === normalize(selectedClassName);
      const subjectMatch =
        !selectedSubject || String(grade.subject) === String(selectedSubject);
      return classMatch && subjectMatch;
    });
  }, [grades, selectedClass, selectedClassName, selectedSubject]);

  const incompleteStudents = useMemo(
    () => filteredStudents.filter((student) => !student.all_notes_present),
    [filteredStudents]
  );

  const gradeLookup = useMemo(() => {
    const map = new Map();
    grades.forEach((grade) => {
      const key = `${grade.student}-${grade.subject}`;
      map.set(key, grade);
    });
    return map;
  }, [grades]);

  const classNameById = useMemo(() => {
    const map = new Map();
    classOptions.forEach((classItem) => {
      map.set(String(classItem.id), classItem.name);
    });
    return map;
  }, [classOptions]);

  const studentMissingTeacherSubjects = useMemo(() => {
    const map = new Map();
    filteredStudents.forEach((student) => {
      const classMatchesSubject = (subject) => {
        if (String(subject.subject_class) === String(student.student_class)) {
          return true;
        }
        const expectedClassName = classNameById.get(String(subject.subject_class));
        return normalize(student.class_name) === normalize(expectedClassName);
      };

      const scopedSubjects = subjects.filter((subject) => {
        if (selectedSubject && String(subject.id) !== String(selectedSubject)) {
          return false;
        }
        return classMatchesSubject(subject);
      });

      const missing = scopedSubjects
        .filter((subject) => {
          const grade = gradeLookup.get(`${student.id}-${subject.id}`);
          return !grade || grade.grade_value === null || grade.grade_value === undefined;
        })
        .map((subject) => subject.name);

      map.set(student.id, missing);
    });
    return map;
  }, [filteredStudents, subjects, selectedSubject, gradeLookup, classNameById]);

  const statusSummary = useMemo(() => {
    let pass = 0;
    let failed = 0;
    filteredGrades.forEach((grade) => {
      if (grade.status === "pass") pass += 1;
      if (grade.status === "failed") failed += 1;
    });
    return { pass, failed };
  }, [filteredGrades]);

  if (loading) {
    return <div>Chargement...</div>;
  }

  return (
    <div>
      <header style={styles.header}>
        <h1 className="heading-jumbo" style={{ marginBottom: "0.5rem" }}>
          Tableau de Bord Enseignant
        </h1>
        <p className="text-muted">
          Vue rapide de vos classes, matieres, notes et etudiants.
        </p>
      </header>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={styles.filterGrid}>
          <select
            className="form-control"
            value={selectedClass}
            onChange={(event) => setSelectedClass(event.target.value)}
          >
            <option value="">Toutes les classes</option>
            {classOptions.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>
          <select
            className="form-control"
            value={selectedSubject}
            onChange={(event) => setSelectedSubject(event.target.value)}
          >
            <option value="">Toutes les matieres</option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <div className="card">
          <h3 className="heading-md">Matieres</h3>
          <p style={styles.kpiValue}>{filteredSubjects.length}</p>
        </div>
        <div className="card">
          <h3 className="heading-md">Etudiants</h3>
          <p style={styles.kpiValue}>{filteredStudents.length}</p>
        </div>
        <div className="card">
          <h3 className="heading-md">Notes saisies</h3>
          <p style={styles.kpiValue}>{filteredGrades.length}</p>
        </div>
        <div className="card">
          <h3 className="heading-md">Etudiants incomplets</h3>
          <p style={styles.kpiValue}>{incompleteStudents.length}</p>
        </div>
        <div className="card">
          <h3 className="heading-md">Statut des notes</h3>
          <p style={styles.kpiSubline}>
            Admis: {statusSummary.pass} | Echec: {statusSummary.failed}
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.tableHeader}>
          <h2 className="heading-md" style={{ marginBottom: 0 }}>
            Etudiants de votre perimetre
          </h2>
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Etudiant</th>
                <th>Classe</th>
                <th>Statut notes</th>
                <th>Moyenne</th>
                <th>Detail incomplet</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5}>Aucun etudiant pour ce filtre.</td>
                </tr>
              ) : null}
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td>
                    {student.user.first_name} {student.user.last_name}
                  </td>
                  <td>{student.class_name || "N/A"}</td>
                  <td>
                    <span
                      className={`badge ${
                        student.all_notes_present ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {student.all_notes_present ? "Complet" : "Incomplet"}
                    </span>
                  </td>
                  <td>{student.weighted_average || "N/A"}</td>
                  <td>
                    {student.all_notes_present ? (
                      <span className="text-muted">Aucun manque</span>
                    ) : (studentMissingTeacherSubjects.get(student.id) || []).length > 0 ? (
                      <span>
                        {(studentMissingTeacherSubjects.get(student.id) || []).join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted">Notes manquantes dans votre perimetre</span>
                    )}
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
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "0.75rem",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "1rem",
    marginBottom: "1rem",
  },
  kpiValue: {
    fontSize: "2rem",
    lineHeight: 1.2,
    fontWeight: 700,
    color: "var(--color-oxford-blue)",
  },
  kpiSubline: {
    fontWeight: 600,
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

export default TeacherDashboardPage;
