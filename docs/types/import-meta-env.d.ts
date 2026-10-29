/** Minimal import.meta.env shape used only by the dependency-free core typecheck. */
interface ImportMeta {
  readonly env: {
    readonly BASE_URL: string;
  };
}
