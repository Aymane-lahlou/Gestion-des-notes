import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Send, Trash2, Users, X } from "lucide-react";
import { api } from "../../lib/api";
import AdminAlerts from "./AdminAlerts";
import { buildClassLookup, dedupeClasses, studentMatchesClassFilter } from "./utils";

const initialStudentForm = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  student_number: "",
  study_year: "",
  student_class: "",
};

const AdminStudentsPage = () => {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [studentForm, setStudentForm] = useState(initialStudentForm);
  const [studentEditId, setStudentEditId] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");
  const [sendingStudentId, setSendingStudentId] = useState(null);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const uniqueClasses = useMemo(() => dedupeClasses(classes), [classes]);
  const classNameById = useMemo(() => buildClassLookup(uniqueClasses), [uniqueClasses]);

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
      if (!silent) setError("Impossible de charger les etudiants.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return students.filter((student) => {
      const fullName = `${student.user.first_name} ${student.user.last_name}`.toLowerCase();
      const email = (student.user.email || "").toLowerCase();
      const matricule = (student.student_number || "").toLowerCase();
      const classMatch = studentMatchesClassFilter(student, studentClassFilter, classNameById);
      const searchMatch = !query || fullName.includes(query) || email.includes(query) || matricule.includes(query);
      return classMatch && searchMatch;
    });
  }, [students, studentSearch, studentClassFilter, classNameById]);

  const bulkSendButtonLabel = useMemo(() => {
    const selectedClassName = classNameById.get(String(studentClassFilter));
    if (!selectedClassName) return "Envoyer touts";
    return `Envoyer tout ${selectedClassName}`;
  }, [studentClassFilter, classNameById]);

  const resetStudentForm = () => {
    setStudentEditId(null);
    setStudentForm(initialStudentForm);
  };

  const submitStudent = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        first_name: studentForm.first_name,
        last_name: studentForm.last_name,
        email: studentForm.email,
        student_number: studentForm.student_number,
        study_year: studentForm.study_year ? Number(studentForm.study_year) : null,
        student_class: studentForm.student_class ? Number(studentForm.student_class) : null,
      };
      if (studentForm.password) payload.password = studentForm.password;

      if (studentEditId) {
        await api.patch(`/students/${studentEditId}/`, payload);
        setMessage("Etudiant mis a jour.");
      } else {
        await api.post("/students/", payload);
        setMessage("Etudiant ajoute.");
      }

      resetStudentForm();
      await loadData({ silent: true });
    } catch {
      setError("Enregistrement etudiant impossible.");
    }
  };

  const editStudent = (student) => {
    setStudentEditId(student.id);
    setStudentForm({
      first_name: student.user.first_name || "",
      last_name: student.user.last_name || "",
      email: student.user.email || "",
      password: "",
      student_number: student.student_number || "",
      study_year: student.study_year ?? "",
      student_class: student.student_class ?? "",
    });
  };

  const deleteStudent = async (studentId) => {
    if (!window.confirm("Supprimer cet etudiant ?")) return;
    setDeletingStudentId(studentId);
    setError("");
    setMessage("");
    try {
      await api.delete(`/students/${studentId}/`);
      setStudents((prev) => prev.filter((student) => student.id !== studentId));
      if (studentEditId === studentId) resetStudentForm();
      setMessage("Etudiant supprime.");
      loadData({ silent: true });
    } catch {
      setError("Suppression etudiant impossible.");
    } finally {
      setDeletingStudentId(null);
    }
  };

  const downloadBulletin = async (studentId, fullName) => {
    setError("");
    setMessage("");
    try {
      const response = await api.get(`/bulletins/student/${studentId}/pdf/`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `bulletin_${fullName.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Bulletin telecharge.");
    } catch {
      setError("Generation du bulletin impossible.");
    }
  };

  const sendToN8n = async (studentId) => {
    setError("");
    setMessage("");
    setSendingStudentId(studentId);
    try {
      const response = await api.post(`/admin/send-grades/${studentId}/`);
      setMessage(response.data.message || "Webhook n8n envoye.");
    } catch (apiError) {
      const missing = apiError?.response?.data?.missing_subjects;
      if (Array.isArray(missing) && missing.length > 0) {
        setError(`Notes incompletes. Matieres manquantes: ${missing.join(", ")}`);
      } else {
        setError(apiError?.response?.data?.error || "Envoi webhook impossible.");
      }
    } finally {
      setSendingStudentId(null);
    }
  };

  const sendFilteredToN8n = async () => {
    if (filteredStudents.length === 0 || sendingBulk) return;
    setError("");
    setMessage("");
    setSendingBulk(true);
    try {
      const studentIds = filteredStudents.map((student) => student.id);
      const response = await api.post("/admin/send-grades/bulk/", { student_ids: studentIds });
      const summary = response?.data?.summary || {};
      setToast({
        text: `Envoi termine: ${summary.sent || 0} envoyes, ${summary.failed || 0} echecs.`,
      });
    } catch (apiError) {
      setError(apiError?.response?.data?.error || "Envoi groupe impossible.");
    } finally {
      setSendingBulk(false);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div>
      <header style={styles.header}>
        <div style={styles.titleRow}>
          <Users size={34} className="text-crimson" />
          <h1 className="heading-jumbo" style={{ margin: 0 }}>Gestion Etudiants</h1>
        </div>
        <p className="text-muted" style={{ fontSize: "1.08rem" }}>
          Creation, edition, suppression et envoi des bulletins.
          {refreshing ? " Synchronisation..." : ""}
        </p>
      </header>

      <AdminAlerts message={message} error={error} />

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="heading-md">{studentEditId ? "Modifier un etudiant" : "Ajouter un etudiant"}</h2>
        <form onSubmit={submitStudent} style={styles.formGrid}>
          <input className="form-control" value={studentForm.first_name} onChange={(e) => setStudentForm((p) => ({ ...p, first_name: e.target.value }))} placeholder="Prenom" required />
          <input className="form-control" value={studentForm.last_name} onChange={(e) => setStudentForm((p) => ({ ...p, last_name: e.target.value }))} placeholder="Nom" required />
          <input className="form-control" type="email" value={studentForm.email} onChange={(e) => setStudentForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" required />
          <input className="form-control" type="password" value={studentForm.password} onChange={(e) => setStudentForm((p) => ({ ...p, password: e.target.value }))} placeholder={studentEditId ? "Nouveau mot de passe (optionnel)" : "Mot de passe"} required={!studentEditId} />
          <input className="form-control" value={studentForm.student_number} onChange={(e) => setStudentForm((p) => ({ ...p, student_number: e.target.value }))} placeholder="Matricule" required />
          <input className="form-control" type="number" value={studentForm.study_year} onChange={(e) => setStudentForm((p) => ({ ...p, study_year: e.target.value }))} placeholder="Niveau" />
          <select className="form-control" value={studentForm.student_class} onChange={(e) => setStudentForm((p) => ({ ...p, student_class: e.target.value }))} required>
            <option value="">Classe</option>
            {uniqueClasses.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
          <div style={styles.inlineButtons}>
            <button className="btn btn-primary" type="submit">{studentEditId ? "Mettre a jour" : "Ajouter"}</button>
            {studentEditId ? <button className="btn btn-outline" type="button" onClick={resetStudentForm}>Annuler</button> : null}
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={styles.searchToolbar}>
          <input className="form-control" placeholder="Recherche etudiant (nom, email, matricule)..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
          <select className="form-control" value={studentClassFilter} onChange={(e) => setStudentClassFilter(e.target.value)}>
            <option value="">Toutes les classes</option>
            {uniqueClasses.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            type="button"
            onClick={sendFilteredToN8n}
            disabled={sendingBulk || filteredStudents.length === 0}
          >
            {sendingBulk ? "Envoi en cours..." : bulkSendButtonLabel}
          </button>
        </div>
        <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="academic-table">
            <thead>
              <tr>
                <th>Etudiant</th>
                <th>Email</th>
                <th>Classe</th>
                <th>Niveau</th>
                <th>Statut notes</th>
                <th>Moyenne</th>
                <th>Matieres incompletes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr><td colSpan={8}>Aucun etudiant trouve.</td></tr>
              ) : null}
              {filteredStudents.map((student) => {
                const fullName = `${student.user.first_name} ${student.user.last_name}`;
                return (
                  <tr key={student.id}>
                    <td>{fullName}</td>
                    <td>{student.user.email}</td>
                    <td>{student.class_name}</td>
                    <td>{student.study_year ?? "N/A"}</td>
                    <td>
                      <span className={`badge ${student.all_notes_present ? "badge-success" : "badge-warning"}`}>
                        {student.all_notes_present ? "Complet" : "Incomplet"}
                      </span>
                    </td>
                    <td>{student.weighted_average ?? "N/A"}</td>
                    <td>
                      {student.all_notes_present ? (
                        <span className="text-muted">Aucune</span>
                      ) : Array.isArray(student.incomplete_subjects) && student.incomplete_subjects.length > 0 ? (
                        <div style={styles.incompleteList}>
                          {student.incomplete_subjects.map((item) => (
                            <div key={item.subject_id}>
                              <strong>{item.subject_name}</strong>
                              <span className="text-muted"> ({item.teacher_name})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">Details indisponibles</span>
                      )}
                    </td>
                    <td>
                      <div style={styles.actionGroup}>
                        <button className="btn btn-outline" style={styles.smallBtn} onClick={() => downloadBulletin(student.id, fullName)}>
                          <Download size={14} /> PDF
                        </button>
                        <button className="btn btn-outline" style={styles.smallBtn} onClick={() => sendToN8n(student.id)} disabled={sendingStudentId === student.id}>
                          <Send size={14} /> {sendingStudentId === student.id ? "Envoi..." : "Envoyer"}
                        </button>
                        <button className="btn btn-outline" style={styles.smallBtn} onClick={() => editStudent(student)}>
                          <Pencil size={14} /> Modifier
                        </button>
                        <button className="btn btn-outline" style={styles.smallBtn} onClick={() => deleteStudent(student.id)} disabled={deletingStudentId === student.id}>
                          <Trash2 size={14} /> {deletingStudentId === student.id ? "Suppression..." : "Supprimer"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {toast ? (
        <div style={styles.toast} role="status" aria-live="polite">
          <span>{toast.text}</span>
          <button
            type="button"
            style={styles.toastCloseButton}
            onClick={() => setToast(null)}
            aria-label="Fermer la notification"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
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
    gridTemplateColumns: "2fr 1fr auto",
    gap: "0.75rem",
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
  incompleteList: {
    display: "grid",
    gap: "0.25rem",
    fontSize: "0.85rem",
    minWidth: "220px",
  },
  toast: {
    position: "fixed",
    right: "1.5rem",
    bottom: "1.5rem",
    zIndex: 1200,
    backgroundColor: "#102A43",
    color: "#FFFFFF",
    borderRadius: "var(--border-radius-md)",
    padding: "0.75rem 0.85rem",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    boxShadow: "0 14px 28px rgba(11, 19, 43, 0.25)",
    maxWidth: "380px",
  },
  toastCloseButton: {
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
};

export default AdminStudentsPage;
