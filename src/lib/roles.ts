export type PanelRole = "owner" | "admin" | "user" | "member";

/** Where a signed-in user should land, based on their role. */
export function roleHome(role?: string | null): string {
  if (role === "owner") return "/owner";
  if (role === "admin") return "/admin";
  return "/dashboard";
}
