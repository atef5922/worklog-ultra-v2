export function AppLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ring)] text-lg font-bold text-white">
        W
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
          WorkSpace
        </p>
        <p className="text-lg font-semibold text-[var(--foreground)]">WorkLog Ultra</p>
      </div>
    </div>
  );
}
