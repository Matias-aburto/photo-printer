import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Para desarrollo/servidor: quita "export" y usa "standalone" si lo necesitas
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
