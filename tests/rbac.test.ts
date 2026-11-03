import { describe, expect, it } from "vitest";
import {
  ForbiddenError, assertParentLinkedToStudent, can, requirePermission, resolveTenant, type Actor,
} from "@/lib/rbac";

const teacherA: Actor = { userId: "u1", scope: "INSTITUTION", institutionId: "instA", roles: ["TEACHER"] };
const adminA: Actor = { userId: "u2", scope: "INSTITUTION", institutionId: "instA", roles: ["INSTITUTE_ADMIN"] };
const superAdmin: Actor = { userId: "u3", scope: "PLATFORM", institutionId: null, roles: ["SUPER_ADMIN"] };

describe("authorization", () => {
  it("denies by default", () => {
    const parent: Actor = { userId: "p", scope: "INSTITUTION", institutionId: "instA", roles: ["PARENT"] };
    expect(can(parent, "students:read")).toBe(false);
    expect(() => requirePermission(parent, "fees:read")).toThrow(ForbiddenError);
  });

  it("restricts teachers from fees and publishing results", () => {
    expect(can(teacherA, "fees:read")).toBe(false);
    expect(can(teacherA, "results:publish")).toBe(false);
    expect(can(teacherA, "exams:write")).toBe(true);
  });

  it("Institute A user cannot target Institute B by supplying its id", () => {
    expect(resolveTenant(adminA, "instA")).toBe("instA");
    expect(resolveTenant(adminA)).toBe("instA");
    expect(() => resolveTenant(adminA, "instB")).toThrow("Cross-tenant access denied");
  });

  it("SUPER_ADMIN role grants nothing to an institution-scoped user", () => {
    const sneaky: Actor = { userId: "x", scope: "INSTITUTION", institutionId: "instA", roles: ["SUPER_ADMIN"] };
    expect(can(sneaky, "platform:manage")).toBe(false);
  });

  it("institute roles grant nothing to a platform-scoped user", () => {
    const odd: Actor = { userId: "x", scope: "PLATFORM", institutionId: null, roles: ["INSTITUTE_OWNER"] };
    expect(can(odd, "students:read")).toBe(false);
  });

  it("platform operator must name the institution explicitly", () => {
    expect(resolveTenant(superAdmin, "instB")).toBe("instB");
    expect(() => resolveTenant(superAdmin)).toThrow(ForbiddenError);
  });

  it("parents only reach linked children", () => {
    const linked = new Set(["s1", "s2"]);
    expect(() => assertParentLinkedToStudent(linked, "s1")).not.toThrow();
    expect(() => assertParentLinkedToStudent(linked, "s9")).toThrow(ForbiddenError);
  });
});
