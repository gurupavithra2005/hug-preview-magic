export type Role = "admin" | "staff" | "customer";

export type Capability =
  | "book:tickets"
  | "tickets:view_own"
  | "tickets:validate"
  | "admin:dashboard"
  | "admin:manage_events"
  | "admin:demo_lab";

const MATRIX: Record<Role, readonly Capability[]> = {
  customer: ["book:tickets", "tickets:view_own"],
  staff: ["book:tickets", "tickets:view_own", "tickets:validate"],
  admin: [
    "book:tickets",
    "tickets:view_own",
    "tickets:validate",
    "admin:dashboard",
    "admin:manage_events",
    "admin:demo_lab",
  ],
};

export function can(roles: readonly Role[], capability: Capability): boolean {
  return roles.some((r) => MATRIX[r]?.includes(capability));
}

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "staff" || value === "customer";
}
