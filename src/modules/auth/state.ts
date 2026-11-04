export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const initialAuthActionState: AuthActionState = {
  status: "idle",
  message: null,
};
