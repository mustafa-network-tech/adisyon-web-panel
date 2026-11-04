export type TenantTheme = {
  brandName: string;
  primaryColor: string;
  logoPath?: string;
};

export type OperationalSettings = {
  currency: "TRY";
  timeZone: "Europe/Istanbul";
  allowOfflineFinancialActions: false;
};
