import { useState } from "react";
import { BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDefaultRouteByRole } from "../lib/routes";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(getDefaultRouteByRole(user.role), { replace: true });
    } catch (apiError) {
      setError("Identifiants invalides ou compte indisponible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div className="card animate-fade-in-up" style={styles.card}>
        <div style={styles.header}>
          <BookOpen size={48} className="text-crimson" />
          <h1 className="heading-xl" style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
            Portail Scolaire
          </h1>
          <p className="text-muted" style={{ fontFamily: "var(--font-body)" }}>
            Connectez-vous pour acceder a votre espace.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div className="form-group">
            <label className="form-label">Adresse e-mail</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="form-control"
              placeholder="exemple@ecole.ma"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className="form-control"
              placeholder="********"
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "1rem" }} disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--color-alabaster)",
    padding: "2rem",
  },
  card: {
    maxWidth: "450px",
    width: "100%",
    padding: "3rem 2.5rem",
  },
  header: {
    textAlign: "center",
    marginBottom: "2.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
  },
  error: {
    color: "#C62828",
    fontWeight: 600,
    marginTop: "0.25rem",
  },
};

export default Login;
