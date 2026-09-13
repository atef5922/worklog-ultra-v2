export const usePathname = () => new URLSearchParams(location.search).get("pathname") || "/dashboard";
export const useRouter = () => ({ push: () => {}, refresh: () => {} });
