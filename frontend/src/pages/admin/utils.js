export const normalizeClassName = (value) => String(value || "").trim().toLowerCase();

export const dedupeClasses = (classes = []) => {
  const map = new Map();
  classes.forEach((classItem) => {
    const key = normalizeClassName(classItem.name);
    if (!map.has(key)) {
      map.set(key, classItem);
    }
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "fr")
  );
};

export const parseAverage = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const classifyStudentStatus = (student) => {
  const average = parseAverage(student?.weighted_average);
  const complete = Boolean(student?.all_notes_present) && average !== null;

  if (!complete) {
    return "incomplete";
  }
  return average >= 10 ? "pass" : "failed";
};

export const computeSummary = (students = []) => {
  const summary = {
    total: 0,
    pass: 0,
    failed: 0,
    incomplete: 0,
  };

  students.forEach((student) => {
    summary.total += 1;
    const status = classifyStudentStatus(student);
    if (status === "pass") summary.pass += 1;
    if (status === "failed") summary.failed += 1;
    if (status === "incomplete") summary.incomplete += 1;
  });

  const denominator = summary.pass + summary.failed;
  summary.pass_rate = denominator > 0 ? ((summary.pass / denominator) * 100).toFixed(2) : null;

  return summary;
};

export const buildClassLookup = (classes = []) => {
  const map = new Map();
  classes.forEach((classItem) => {
    map.set(String(classItem.id), classItem.name);
  });
  return map;
};

export const studentMatchesClassFilter = (student, selectedClassId, classNameById) => {
  if (!selectedClassId) return true;
  if (String(student.student_class) === String(selectedClassId)) return true;

  const selectedName = classNameById.get(String(selectedClassId));
  if (!selectedName) return false;

  return normalizeClassName(student.class_name) === normalizeClassName(selectedName);
};
