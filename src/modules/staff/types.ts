export type ShiftKind = "work" | "leave";
export type EmploymentStatus = "active" | "on_leave" | "terminated";

export type ShiftTemplate = {
  id: string;
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  color: string;
  isActive: boolean;
};

export type Shift = {
  id: string;
  membershipId: string;
  branchId: string;
  branchName: string;
  date: string; // YYYY-MM-DD
  kind: ShiftKind;
  startTime: string | null;
  endTime: string | null;
  templateId: string | null;
  notes: string | null;
};

export type StaffMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  phone: string | null;
  status: "invited" | "active" | "suspended";
  roleNames: string[];
  positionTitle: string | null;
  hiredOn: string | null;
  employmentStatus: EmploymentStatus;
  terminatedOn: string | null;
  /** Only present for staff.manage holders. */
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
};

export type StaffSnapshot = {
  weekStart: string;
  today: string;
  canPlan: boolean;
  canManageCards: boolean;
  /** The signed-in user's upcoming shifts (all branches). */
  myShifts: Shift[];
  templates: ShiftTemplate[];
  members: StaffMember[];
  /** Branch shifts for the displayed week (planners only). */
  weekShifts: Shift[];
};
