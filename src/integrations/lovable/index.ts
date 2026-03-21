// Lovable Cloud Auth removed — replaced by direct Supabase Auth
export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: string, _opts?: unknown) => {
      return { error: new Error("Lovable auth not available") };
    },
  },
};
