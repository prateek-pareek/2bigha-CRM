import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Compile the shared UI package from TypeScript source.
  transpilePackages: ["@mathionix/ui"],
  // Pin the file-tracing root to the repo. Next otherwise walks up looking for a
  // lockfile and can latch onto an unrelated one outside the project.
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  // Tree-shake barrel imports from large UI libs (no extra npm packages).
  // lucide-react, date-fns, and recharts are optimized by Next.js by default.
  experimental: {
    optimizePackageImports: [
      "@mathionix/ui",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@xyflow/react",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "cmdk",
    ],
  },
  webpack: (config) => {
    // Resolve peer deps for file:../packages/ui from the portal app.
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
      ...(config.resolve.modules || []),
    ];
    return config;
  },
  async redirects() {
    return [
      {
        source: "/crm/settings/knowledge-base",
        destination: "/crm/settings/wiki",
        permanent: true,
      },
      {
        source: "/crm/client-portals",
        destination: "/client-portals",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
