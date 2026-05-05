import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { api } from "../../lib/api";
import AdminAlerts from "./AdminAlerts";
import {
  buildClassLookup,
  classifyStudentStatus,
  computeSummary,
  dedupeClasses,
  studentMatchesClassFilter,
} from "./utils";

const STATUS_COLORS = {
  pass: "#2E7D32",
  failed: "#C62828",
  incomplete: "#E65100",
};

const AdminStatsPage = () => {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedStudyYear, setSelectedStudyYear] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const uniqueClasses = useMemo(() => dedupeClasses(classes), [classes]);
  const classNameById = useMemo(() => buildClassLookup(uniqueClasses), [uniqueClasses]);

  const studyYearOptions = useMemo(() => {
    const set = new Set();
    students.forEach((student) => {
      if (student.study_year !== null && student.study_year !== undefined && student.study_year !== "") {
        set.add(Number(student.study_year));
      }
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [students]);

  const loadData = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError("");
    }

    try {
      const [studentsRes, classesRes] = await Promise.all([
        api.get("/students/"),
        api.get("/classes/"),
      ]);
      setStudents(studentsRes.data);
      setClasses(classesRes.data);
    } catch {
      if (!silent) setError("Impossible de charger les statistiques admin.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const classMatch = studentMatchesClassFilter(student, selectedClass, classNameById);
      const yearMatch = !selectedStudyYear || String(student.study_year ?? "") === String(selectedStudyYear);
      const fullName = `${student.user.first_name} ${student.user.last_name}`.toLowerCase();
      const email = (student.user.email || "").toLowerCase();
      const matricule = (student.student_number || "").toLowerCase();
      const searchMatch = !query || fullName.includes(query) || email.includes(query) || matricule.includes(query);
      return classMatch && yearMatch && searchMatch;
    });
  }, [students, selectedClass, selectedStudyYear, search, classNameById]);

  const globalSummary = useMemo(() => computeSummary(filteredStudents), [filteredStudents]);

  const classRows = useMemo(() => {
    const groups = new Map();
    filteredStudents.forEach((student) => {
      const classLabel = student.class_name || "Sans classe";
      if (!groups.has(classLabel)) groups.set(classLabel, []);
      groups.get(classLabel).push(student);
    });

    return Array.from(groups.entries())
      .map(([class_name, classStudents]) => ({
        class_name,
        ...computeSummary(classStudents),
      }))
      .sort((a, b) => a.class_name.localeCompare(b.class_name, "fr"));
  }, [filteredStudents]);

  const studyYearRows = useMemo(() => {
    const groups = new Map();
    filteredStudents.forEach((student) => {
      const key = student.study_year ?? "Non defini";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(student);
    });

    return Array.from(groups.entries())
      .map(([study_year, yearStudents]) => ({
        study_year,
        ...computeSummary(yearStudents),
      }))
      .sort((a, b) => String(a.study_year).localeCompare(String(b.study_year), "fr", { numeric: true }));
  }, [filteredStudents]);

  const matrixRows = useMemo(() => {
    const matrix = new Map();
    filteredStudents.forEach((student) => {
      const classKey = student.class_name || "Sans classe";
      const yearKey = student.study_year ?? "Non defini";
      const groupKey = `${classKey}__${yearKey}`;
      if (!matrix.has(groupKey)) {
        matrix.set(groupKey, {
          class_name: classKey,
          study_year: yearKey,
          total: 0,
          pass: 0,
          failed: 0,
          incomplete: 0,
        });
      }

      const row = matrix.get(groupKey);
      row.total += 1;
      const status = classifyStudentStatus(student);
      row[status] += 1;
    });

    return Array.from(matrix.values()).sort((a, b) => {
      const byClass = a.class_name.localeCompare(b.class_name, "fr");
      if (byClass !== 0) return byClass;
      return String(a.study_year).localeCompare(String(b.study_year), "fr", { numeric: true });
    });
  }, [filteredStudents]);

  const classChartData = useMemo(
    () => classRows.map((row) => ({ name: row.class_name, pass: row.pass, failed: row.failed, incomplete: row.incomplete })),
    [classRows]
  );

  const yearChartData = useMemo(
    () => studyYearRows.map((row) => ({ name: String(row.study_year), pass: row.pass, failed: row.failed, incomplete: row.incomplete })),
    [studyYearRows]
  );

  const statusPieData = useMemo(
    () => [
      { name: "Admis", key: "pass", value: globalSummary.pass },
      { name: "Echec", key: "failed", value: globalSummary.failed },
      { name: "Incomplet", key: "incomplete", value: globalSummary.incomplete },
    ],
    [globalSummary]
  );

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <BarChart3 size={34} className="text-crimson" />
          <h1 className="heading-jumbo" style={{ margin: 0 }}>Statistiques Admin</h1>
        </div>
        <p className="text-muted" style={{ fontSize: "1.08rem" }}>
          Synthese des resultats par classe et par niveau d'etude.
          {refreshing ? " Synchronisation..." : ""}
        </p>
      </header>

      <AdminAlerts error={error} />

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={styles.filtersGrid}>
          <select className="form-control" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            <option value="">Toutes les classes</option>
            {uniqueClasses.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
          <select className="form-control" value={selectedStudyYear} onChange={(e) => setSelectedStudyYear(e.target.value)}>
            <option value="">Tous les niveaux</option>
            {studyYearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <input className="form-control" placeholder="Recherche etudiant..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <div className="card"><h3 className="heading-md">Total etudiants</h3><p style={styles.kpiValue}>{globalSummary.total}</p></div>
        <div className="card"><h3 className="heading-md">Admis</h3><p style={{ ...styles.kpiValue, color: STATUS_COLORS.pass }}>{globalSummary.pass}</p></div>
        <div className="card"><h3 className="heading-md">Echec</h3><p style={{ ...styles.kpiValue, color: STATUS_COLORS.failed }}>{globalSummary.failed}</p></div>
        <div className="card"><h3 className="heading-md">Incomplet</h3><p style={{ ...styles.kpiValue, color: STATUS_COLORS.incomplete }}>{globalSummary.incomplete}</p></div>
        <div className="card"><h3 className="heading-md">Taux de reussite</h3><p style={styles.kpiValue}>{globalSummary.pass_rate ? `${globalSummary.pass_rate}%` : "Non calculable"}</p></div>
      </div>

      <div style={styles.chartGrid}>
        <div className="card">
          <h2 className="heading-md">Distribution par classe</h2>
          <div style={styles.chartBox}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={classChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="pass" name="Admis" fill={STATUS_COLORS.pass} />
                <Bar dataKey="failed" name="Echec" fill={STATUS_COLORS.failed} />
                <Bar dataKey="incomplete" name="Incomplet" fill={STATUS_COLORS.incomplete} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="heading-md">Distribution par niveau</h2>
          <div style={styles.chartBox}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={yearChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="pass" name="Admis" fill={STATUS_COLORS.pass} />
                <Bar dataKey="failed" name="Echec" fill={STATUS_COLORS.failed} />
                <Bar dataKey="incomplete" name="Incomplet" fill={STATUS_COLORS.incomplete} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="heading-md">Repartition des statuts</h2>
          <div style={styles.chartBox}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  dataKey="value"
                  label
                >
                  {statusPieData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1rem" }}>
        <div style={styles.tableHeader}><h2 className="heading-md" style={{ marginBottom: 0 }}>Par classe</h2></div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Total</th>
                <th>Admis</th>
                <th>Echec</th>
                <th>Incomplet</th>
                <th>Taux</th>
              </tr>
            </thead>
            <tbody>
              {classRows.length === 0 ? <tr><td colSpan={6}>Aucune donnee.</td></tr> : null}
              {classRows.map((row) => (
                <tr key={row.class_name}>
                  <td>{row.class_name}</td>
                  <td>{row.total}</td>
                  <td>{row.pass}</td>
                  <td>{row.failed}</td>
                  <td>{row.incomplete}</td>
                  <td>{row.pass_rate ? `${row.pass_rate}%` : "Non calculable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1rem" }}>
        <div style={styles.tableHeader}><h2 className="heading-md" style={{ marginBottom: 0 }}>Par niveau d'etude</h2></div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Niveau</th>
                <th>Total</th>
                <th>Admis</th>
                <th>Echec</th>
                <th>Incomplet</th>
                <th>Taux</th>
              </tr>
            </thead>
            <tbody>
              {studyYearRows.length === 0 ? <tr><td colSpan={6}>Aucune donnee.</td></tr> : null}
              {studyYearRows.map((row) => (
                <tr key={String(row.study_year)}>
                  <td>{row.study_year}</td>
                  <td>{row.total}</td>
                  <td>{row.pass}</td>
                  <td>{row.failed}</td>
                  <td>{row.incomplete}</td>
                  <td>{row.pass_rate ? `${row.pass_rate}%` : "Non calculable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.tableHeader}><h2 className="heading-md" style={{ marginBottom: 0 }}>Matrice classe × niveau</h2></div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Niveau</th>
                <th>Total</th>
                <th>Admis</th>
                <th>Echec</th>
                <th>Incomplet</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.length === 0 ? <tr><td colSpan={6}>Aucune donnee.</td></tr> : null}
              {matrixRows.map((row) => (
                <tr key={`${row.class_name}-${row.study_year}`}>
                  <td>{row.class_name}</td>
                  <td>{row.study_year}</td>
                  <td>{row.total}</td>
                  <td>{row.pass}</td>
                  <td>{row.failed}</td>
                  <td>{row.incomplete}</td>
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
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "1rem",
    marginBottom: "1rem",
  },
  chartBox: {
    width: "100%",
    height: 300,
  },
  tableHeader: {
    padding: "1rem",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-alabaster)",
  },
};

export default AdminStatsPage;
