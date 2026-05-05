import { CheckCircle, XCircle } from "lucide-react";

const AdminAlerts = ({ message, error }) => {
  if (!message && !error) return null;

  return (
    <>
      {message && (
        <div style={styles.successBox}>
          <CheckCircle size={18} />
          {message}
        </div>
      )}
      {error && (
        <div style={styles.errorBox}>
          <XCircle size={18} />
          {error}
        </div>
      )}
    </>
  );
};

const styles = {
  successBox: {
    backgroundColor: "#E8F5E9",
    color: "#2E7D32",
    padding: "0.75rem 1rem",
    borderRadius: "var(--border-radius-sm)",
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "1rem",
  },
  errorBox: {
    backgroundColor: "#FFEBEE",
    color: "#C62828",
    padding: "0.75rem 1rem",
    borderRadius: "var(--border-radius-sm)",
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "1rem",
  },
};

export default AdminAlerts;
