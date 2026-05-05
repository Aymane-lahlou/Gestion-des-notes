# README_TECH

## Project Overview
This project is a school grade management platform with:
- A Django + Django REST Framework backend API.
- A React + Vite frontend web app.
- A MySQL database.

The app supports three roles:
- `admin`: manages students, subjects, grades, and statistics.
- `teacher`: enters and monitors grades for their scope.
- `student`: views personal grades and overview.

Core product capabilities:
- JWT authentication (`login`, `refresh`, `logout`, `me`).
- CRUD APIs for classes, students, teachers, subjects, grades, curriculum, academic years.
- Computed grade metrics (weighted average, completeness, pass/fail).
- PDF bulletin generation.
- Webhook dispatch to n8n for grade report sending.

---

## Architecture Flow (Frontend <-> API <-> DB)
High-level flow:
1. User logs in from React.
2. Frontend calls `/api/auth/login/`.
3. Django returns `access` + `refresh` JWT and user profile.
4. Frontend stores tokens in `localStorage`.
5. Frontend sends API requests with `Authorization: Bearer <access>`.
6. DRF views enforce auth/permissions and read/write MySQL through Django ORM.
7. If access token expires, Axios interceptor calls `/api/auth/refresh/` automatically.
8. Frontend renders role-specific pages and filtered datasets.

Text architecture diagram:
```text
Browser (React + Vite)
  -> Axios API Client (+ JWT interceptors)
    -> Django URL Router (/api/*)
      -> DRF ViewSets / APIViews
        -> Serializers + Business Logic
          -> Django ORM
            -> MySQL (Aiven, SSL)
```

For bulletin/webhook features:
```text
Admin action
  -> Django prepares grades + computed status + PDF (base64)
    -> requests.post(...) to n8n webhook URL
```

---

## Technology Stack (Frontend + Backend + DB + Tooling)
Backend runtime and libraries:
- `Django==5.0.7`
- `djangorestframework==3.17.1`
- `django-cors-headers==4.8.0`
- `djangorestframework-simplejwt==5.5.1`
- `mysqlclient==2.2.7`
- `requests==2.32.5`
- `python-dotenv==1.0.1`

Frontend runtime and libraries:
- `react==18.2.0`
- `react-dom==18.2.0`
- `react-router-dom==6.22.2`
- `axios==1.15.2`
- `recharts==3.8.1`
- `lucide-react==0.344.0`

Tooling:
- `vite` for frontend dev server and build.
- `eslint` + `eslint-plugin-react` + `eslint-plugin-react-hooks`.
- Python virtual environment (`venv`) for backend dependency isolation.

Database:
- MySQL via Django ORM (`django.db.backends.mysql`).
- SSL CA support configured in Django settings.

Important note:
- `Pillow` is not installed and not used in this codebase.

---

## Backend Deep Dive (Django + DRF)
### 1) Project configuration layer
Key responsibilities:
- Load environment variables from `.env` using `python-dotenv`.
- Configure DB connection, CORS policy, JWT auth classes, default DRF permission.
- Register apps and middleware.

Important settings behavior:
- `AUTH_USER_MODEL = 'users.User'` (custom user model).
- All API routes are under `/api/`.
- JWT access/refresh durations are driven by env variables.
- CORS behavior can be open (`CORS_ALLOW_ALL_ORIGINS=True`) or restricted by list.

### 2) API structure layer
Patterns used:
- `ModelViewSet` for CRUD resources.
- `APIView` for custom endpoints (stats, bulletins, webhook send).
- Routers (`DefaultRouter`) for standard REST resource URL registration.
- Serializer-driven validation and response shaping.

Main API endpoint groups:
- Authentication: `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`.
- Data resources: `/students`, `/teachers`, `/subjects`, `/grades`, `/classes`, `/academic-years`, `/curriculum`, `/student-enrollments`.
- Stats and documents: student/class stats, bulletin PDF.
- Admin actions: single and bulk grade report webhook dispatch.

### 3) Domain model layer
Main entities:
- `User`, `Teacher`, `Student`
- `Class`, `Subject`, `Grade`
- `AcademicYear`, `StudentEnrollment`, `ClassSubjectCurriculum`

Business design highlights:
- Role-based user system (`admin`, `teacher`, `student`).
- Grade uniqueness by `(student, subject, period)`.
- Curriculum per class and academic year.
- Active enrollment used to resolve current class/year context.

### 4) Data lifecycle layer
- Migrations define schema evolution (`0001` to `0006`).
- `seed_demo` command populates demo users/classes/subjects/grades.
- Metrics are computed server-side (weighted averages, completeness).
- PDF content is generated in backend and sent to client or webhook payload.

### 5) Auth and permission model
- JWT auth is required by default for DRF.
- Role checks are enforced in view logic.
- Admin-only writes for key resources use a mixin guard.
- Frontend route protection mirrors backend permission expectations.

### 6) Webhook sending flow
- Single-student endpoint sends one bulletin payload to n8n.
- Bulk endpoint loops over selected students with partial success.
- Errors are captured per student (`missing grades`, `not found`, webhook failures).

---

## Frontend Deep Dive (React + Vite)
### 1) Bootstrap and app mounting
- `main.jsx` mounts `<App />` inside `<AuthProvider />`.
- `React.StrictMode` is enabled for dev diagnostics.

### 2) Routing model
- Router is centralized in `App.jsx`.
- Role-based route trees:
  - `/admin/*`
  - `/teacher/*`
  - `/student/*`
- Redirect helpers send users to role default pages.
- Wildcard route sends unknown paths back to role landing.

### 3) Auth lifecycle
- `AuthContext` owns `user`, `loading`, `login`, `logout`, `refreshProfile`.
- Tokens are managed via `tokenStorage`.
- Axios request interceptor injects access token.
- Axios response interceptor handles `401` with refresh queue to avoid race duplication.
- On refresh failure, app clears tokens and resets user state.

### 4) UI module strategy
- Each role has dedicated pages and layouts.
- Shared pieces:
  - `Navbar`
  - `ProtectedRoute`
  - API client utilities
- Admin pages include reusable alert component and helper utilities.

### 5) Data loading pattern
Common page pattern:
1. `useEffect` triggers initial load.
2. API calls via `api.get/post/patch/delete`.
3. `useMemo` computes derived filters and summaries.
4. Loading and error states drive conditional rendering.

---

## React Hooks Used in This Project
### `useState`
What it does:
- Stores local component state.

Where used:
- All page components (`loading`, `error`, forms, filters, datasets).
- `AuthContext` (`user`, `loading`).
- Layout responsiveness state in `AdminLayout`.

Why here:
- Form control, async request status, UI toggles.

Common pitfalls:
- Updating from stale state; use callback form (`setState(prev => ...)`) where needed.
- Over-fragmented state can increase rerenders.

### `useEffect`
What it does:
- Runs side effects after render.

Where used:
- Initial API fetches in pages.
- Auth initialization in `AuthContext`.
- Resize listener in `AdminLayout`.
- Toast auto-dismiss in `AdminStudentsPage`.

Why here:
- Data loading, event subscriptions, lifecycle-style behavior.

Common pitfalls:
- Missing dependencies can create stale data bugs.
- Forgetting cleanup for listeners/timers can leak behavior.

### `useMemo`
What it does:
- Memoizes expensive derived values.

Where used:
- Filtering students/grades/subjects.
- Summary and chart data generation.
- Class lookup maps and selected objects.
- Context value memoization in `AuthContext`.

Why here:
- Avoid recomputing heavy derived arrays/maps on every render.

Common pitfalls:
- Using `useMemo` for trivial values can add noise.
- Incorrect dependency arrays can return outdated computations.

### `createContext`
What it does:
- Creates a shared context container.

Where used:
- `AuthContext` creation for auth state/actions.

Why here:
- Avoid prop drilling auth data through all routes/components.

Common pitfalls:
- Context misuse outside provider can crash; guarded by `useAuth` check.

### `useContext`
What it does:
- Reads values from context provider.

Where used:
- `useAuth()` consumer helper.
- Components that need user/session actions (`Navbar`, protected routes, pages).

Why here:
- Centralized auth state access.

Common pitfalls:
- Accessing context before provider mount.

### `useNavigate`
What it does:
- Programmatic route navigation.

Where used:
- Login redirect after successful auth.
- Logout redirect in navbar.

Why here:
- Workflow routing based on auth actions.

Common pitfalls:
- Forgetting `replace` may keep old page in browser history.

### `useLocation`
What it does:
- Gives current URL location metadata.

Where used:
- `Navbar` to infer active role section styling.

Why here:
- Active link UI highlighting by route namespace.

Common pitfalls:
- Overusing location-driven logic can cause unnecessary rerenders.

---

## Django/Backend Libraries Used
### `Django`
- Main web framework.
- Provides ORM, model definitions, migrations, admin, settings, middleware.

### `djangorestframework` (DRF)
- REST API layer for serializers, viewsets, APIView, response helpers, status codes.

### `django-cors-headers`
- Adds CORS middleware and settings for frontend-backend cross-origin access.

### `djangorestframework-simplejwt`
- JWT token generation, refresh, and authentication backend integration.

### `mysqlclient`
- Python DB driver used by Django MySQL engine.

### `requests`
- Used for outbound HTTP webhook calls to n8n.

### `python-dotenv`
- Loads `.env` values into process environment for settings.

### Why Pillow is not listed
- No image fields (`ImageField`) or server-side image processing currently exist.
- Therefore `Pillow` is not required for this project at present.

---

## Directory and File-by-File Role Map (Source Only)
### `/` (project root)
- `.gitignore`: ignores local/generated files from git tracking.
- `TEST_SMOKE.md`: manual smoke-test scenarios for admin/teacher/student flows.
- `README_TECH.md`: this learning guide.

### `/Diagramm`
- `class.drawio`: visual class/domain diagram for the project.

### `/BACKEND/Gestion_Ma_Ec`
- `.env.example`: sample env keys required by backend.
- `manage.py`: Django CLI entry point (`runserver`, `migrate`, `test`, custom commands).
- `requirements.txt`: backend Python dependencies.
- `check_db.py`: helper script for DB table/DDL inspection.

### `/BACKEND/Gestion_Ma_Ec/Gestion_Ma_Ec`
- `__init__.py`: package marker.
- `settings.py`: global Django settings (DB, CORS, JWT, apps, middleware).
- `urls.py`: root route table, mounts `api/` and Django admin.
- `asgi.py`: ASGI application entry point.
- `wsgi.py`: WSGI application entry point.
- `ca.pem`: SSL CA certificate for secure MySQL connection.

### `/BACKEND/Gestion_Ma_Ec/users`
- `__init__.py`: package marker.
- `apps.py`: Django app config (`users`).
- `admin.py`: Django admin registrations and list/filter/search config.
- `models.py`: domain data models and model-level business behavior.
- `serializers.py`: DRF serializers + validation + computed metric logic.
- `views.py`: API endpoints, permissions, filtering, stats, PDF and webhook logic.
- `urls.py`: app-level API routing via DRF router + custom paths.
- `tests.py`: API integration tests (auth, permissions, stats, webhook, constraints).

### `/BACKEND/Gestion_Ma_Ec/users/management`
- `__init__.py`: package marker for management commands namespace.

### `/BACKEND/Gestion_Ma_Ec/users/management/commands`
- `__init__.py`: package marker.
- `seed_demo.py`: custom command to seed demo data for quick local testing.

### `/BACKEND/Gestion_Ma_Ec/users/migrations`
- `__init__.py`: package marker for migrations.
- `0001_initial.py`: initial schema (core user/domain models).
- `0002_schema_alignment.py`: FK alignments and auth relation fields.
- `0003_grade_status.py`: adds grade status field.
- `0004_grade_period_constraints.py`: period field and grade uniqueness constraints.
- `0005_academicyear_classsubjectcurriculum_and_more.py`: adds academic year, enrollments, curriculum, bootstrap migration logic.
- `0006_merge_duplicate_classes_and_enforce_unique_name.py`: deduplicates class names and enforces unique class name.

### `/frontend`
- `.env.example`: sample frontend env keys (`VITE_API_BASE_URL`).
- `index.html`: Vite HTML entry.
- `package.json`: frontend dependencies and scripts.
- `vite.config.js`: Vite config.

### `/frontend/src`
- `main.jsx`: React bootstrap and provider wiring.
- `App.jsx`: full route graph and role-based route trees.
- `index.css`: global design system, layout, shared component styles.

### `/frontend/src/components`
- `Navbar.jsx`: authenticated top navigation, role-aware links, logout action.
- `ProtectedRoute.jsx`: auth guard + role guard for route access.

### `/frontend/src/context`
- `AuthContext.jsx`: auth state container, login/logout/profile lifecycle.

### `/frontend/src/lib`
- `api.js`: Axios client, JWT header injection, token refresh queue/interceptors.
- `routes.js`: role-to-default-route resolver.
- `tokenStorage.js`: localStorage access/refresh token utilities.

### `/frontend/src/pages`
- `Login.jsx`: authentication form page.

### `/frontend/src/pages/admin`
- `AdminLayout.jsx`: admin shell layout and responsive sidebar behavior.
- `AdminSidebar.jsx`: admin navigation links.
- `AdminAlerts.jsx`: reusable success/error alert banner.
- `AdminStatsPage.jsx`: admin dashboards, aggregations, charts.
- `AdminStudentsPage.jsx`: student CRUD, bulletin download, webhook send actions.
- `AdminSubjectsPage.jsx`: subject CRUD and assignment workflows.
- `AdminGradesPage.jsx`: grade create/update and filtering table.
- `utils.js`: admin helper functions (class dedupe/lookup, summary classification).

### `/frontend/src/pages/student`
- `StudentLayout.jsx`: student shell and navigation.
- `StudentOverviewPage.jsx`: profile-level KPIs and incomplete subject list.
- `StudentGradesPage.jsx`: current-period grade table and sorting.

### `/frontend/src/pages/teacher`
- `TeacherLayout.jsx`: teacher shell and navigation.
- `TeacherDashboardPage.jsx`: teacher KPI dashboard, filtering, completeness analysis.
- `TeacherGradesPage.jsx`: teacher grade entry/update and filtered listing.

Excluded intentionally:
- `venv`, build outputs (`dist`), caches (`__pycache__`), generated artifacts.

---

## How to Recreate This Project Step by Step
### 1) Clone and prepare folders
```bash
git clone <your-repo-url>
cd "Gestion de notes"
```

### 2) Backend setup (Python + Django)
Windows (PowerShell):
```powershell
cd BACKEND\Gestion_Ma_Ec
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS:
```bash
cd BACKEND/Gestion_Ma_Ec
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3) Backend env configuration
Create `.env` from `.env.example` and set values:
- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `CSRF_TRUSTED_ORIGINS`
- `CORS_ALLOW_ALL_ORIGINS`
- `CORS_ALLOWED_ORIGINS`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT`
- `DB_SSL_CA`
- `JWT_ACCESS_MINUTES`
- `JWT_REFRESH_DAYS`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`

Important:
- Use your own credentials.
- Do not copy production secrets into source control.

### 4) Initialize schema and demo data
```bash
python manage.py migrate
python manage.py seed_demo
```

### 5) Run backend
```bash
python manage.py runserver
```
Backend base URL will typically be:
- `http://localhost:8000/api`

### 6) Frontend setup
Open a new terminal:
```bash
cd frontend
npm install
```

Create frontend `.env` from `.env.example` and set:
- `VITE_API_BASE_URL=http://localhost:8000/api`

### 7) Run frontend
```bash
npm run dev
```
Frontend dev URL is typically:
- `http://localhost:3001`

### 8) Recommended verification commands
Backend tests:
```bash
cd BACKEND/Gestion_Ma_Ec
python manage.py test users --verbosity 1
```

Frontend production build check:
```bash
cd frontend
npm run build
```

### 9) Recommended daily workflow
1. Pull latest branch.
2. Activate backend virtualenv.
3. Run backend and frontend in separate terminals.
4. Develop one feature at a time with small commits.
5. Run tests/build before pushing.

---

## Smoke Test Workflow
Use `TEST_SMOKE.md` as your manual QA script.

Minimum path:
1. Login as admin (`admin@ecole.ma / Admin123!`) and validate admin routes/features.
2. Login as teacher (`enseignant@ecole.ma / Teacher123!`) and validate teacher scopes.
3. Login as student (`etudiant1@ecole.ma / Student123!`) and validate student views.
4. Check route protection across role boundaries.
5. Stop backend to validate frontend API error handling and recovery behavior.

---

## Common Errors and Fixes
### 401 Unauthorized on API calls
Possible causes:
- Missing/expired token.
- Refresh token invalid.

Fix:
- Re-login.
- Ensure browser `localStorage` contains `auth_access_token` and `auth_refresh_token`.
- Confirm backend JWT settings match expectations.

### CORS errors in browser console
Possible causes:
- Frontend origin not allowed.

Fix:
- Update backend `.env` CORS keys (`CORS_ALLOW_ALL_ORIGINS` or `CORS_ALLOWED_ORIGINS`).
- Restart backend server.

### Cannot connect to MySQL
Possible causes:
- Wrong DB host/port/user/password.
- SSL CA path invalid.
- Network/firewall restrictions.

Fix:
- Verify `.env` DB values.
- Validate `DB_SSL_CA` file path.
- Confirm remote DB service connectivity.

### `ModuleNotFoundError` or dependency errors
Fix:
- Activate correct virtualenv.
- Re-run `pip install -r requirements.txt`.
- Re-run `npm install` for frontend.

### Frontend shows stale data after auth changes
Fix:
- Clear localStorage auth keys.
- Hard refresh browser.
- Confirm `AuthContext` initialization runs without backend errors.

---

## What Is Not Used (e.g., Pillow) and Why
Not used in this project:
- `Pillow`: no image upload, `ImageField`, or image processing pipeline exists.
- Celery/background workers: current async behavior is handled inline in request cycle.
- WebSockets/channels: app uses request-response REST flows only.
- ORM alternatives (SQLAlchemy, Prisma): Django ORM is the single data access layer.

Why this matters:
- Keep dependencies minimal.
- Reduce operational complexity.
- Learn fundamentals first (REST, auth, filtering, role permissions, metrics).

When to add Pillow:
- Only if you add image features (profile pictures, document scans, thumbnails).
