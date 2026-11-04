export type CrudActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const initialCrudActionState: CrudActionState = {
  status: "idle",
  message: null,
};
