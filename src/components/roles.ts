export function roleKey(role: string): string {
  const map: Record<string, string> = {
    super_admin: "SuperAdmin",
    owner: "Owner",
    general_manager: "GeneralManager",
    project_manager: "ProjectManager",
    site_engineer: "SiteEngineer",
    qa_qc: "QaQc",
    quantity_surveyor: "QuantitySurveyor",
    storekeeper: "Storekeeper",
    accountant: "Accountant",
    auditor: "Auditor",
    viewer: "Viewer",
  };
  return map[role] ?? role;
}

export const ROLES = [
  "super_admin",
  "owner",
  "general_manager",
  "project_manager",
  "site_engineer",
  "qa_qc",
  "quantity_surveyor",
  "storekeeper",
  "accountant",
  "auditor",
  "viewer",
] as const;
