export type Channel = {
  id: string;
  name: string;
  description: string;
  rules: Record<string, unknown>;
};
