export function getDefaultRouteByRole(role) {
  if (role === "admin") return "/admin/stats";
  if (role === "teacher") return "/teacher/dashboard";
  return "/student/overview";
}
