"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, Lock, LogIn, Eye, EyeOff } from "lucide-react";
import { API_BASE_URL } from "@/lib/api/config";
import { useAuthStore } from "@/store/pm/auth-store";
import { MathionixLoginBrandHero } from "@/components/MathionixBrand";
import { jiraAuthChrome } from "@/lib/pm/jira-ui";
import { cn } from "@/lib/pm/utils";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleMicrosoftLogin = () => {
    setMsLoading(true);
    window.location.href = `${API_BASE_URL}/auth/microsoft`;
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        const { access_token, user } = data;
        localStorage.setItem("token", access_token);
        localStorage.setItem("user", JSON.stringify(user));

        useAuthStore.getState().setAuth(
          {
            ...user,
            id: user.id || user._id,
            fullName: user.fullName || (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Member'),
            role: user.role?.toUpperCase() || 'MEMBER',
            permissions: user.permissions || (user.roleId?.permissions || []).map((p: any) => typeof p === 'string' ? p : p.key || p.name) || [],
            isActive: user.isActive !== false
          },
          access_token
        );

        document.cookie = `token=${access_token}; path=/; max-age=604800`;

        if (from) {
          router.push(from);
          return;
        }

        const tools: string[] = (user.permittedTools || []).map((t: string) => t.toUpperCase());
        const rolePermissions =
          user?.roleId?.permissions?.map((p: any) =>
            typeof p === "string" ? p : p?.key || p?.name
          ) || [];
        const directPermissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
        const hasVaultAccess = [...directPermissions, ...rolePermissions].some(
          (p: string) => p === "vault" || p.startsWith("vault:") || p.startsWith("hr-settings:")
        );
        if (user.role && user.role.toUpperCase() === 'CLIENT') {
          router.push("/client-dashboard");
          return;
        }

        if (tools.includes("HRMS")) {
          router.push("/hrms/dashboard");
        } else if (tools.includes("PM")) {
          router.push("/pm/boards");
        } else if (tools.includes("CRM")) {
          router.push("/crm/workspace");
        } else if (tools.includes("SOCIAL")) {
          router.push("/social");
        } else if (tools.includes("VAULT") || hasVaultAccess) {
          router.push("/vault");
        } else {
          router.push("/hrms/dashboard");
        }
      } else {
        setError(data.message || "Invalid email or password.");
      }
    } catch {
      setError("Could not reach the authentication server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(jiraAuthChrome.page, "flex items-center justify-center")}>
      <div className={jiraAuthChrome.card}>
        <div className="text-center">
          <MathionixLoginBrandHero />
          <h1 className={cn(jiraAuthChrome.title, "mt-4")}>Log in to continue</h1>
          <p className={jiraAuthChrome.lead}>Use your Mathionix account</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={msLoading || googleLoading || isLoading}
            className={jiraAuthChrome.btnSecondary}
          >
            {msLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
            )}
            Continue with Microsoft
          </button>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={msLoading || googleLoading || isLoading}
            className={jiraAuthChrome.btnSecondary}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083A19.944 19.944 0 0 1 44 24c0 4.411-1.428 8.487-3.846 11.815l-6.207-5.253A11.896 11.896 0 0 0 36 24c0-1.383-.244-2.704-.68-3.927l7.291-5.99z"/></svg>
            )}
            Continue with Google
          </button>
        </div>

        <div className={jiraAuthChrome.divider}>
          <div className={jiraAuthChrome.dividerLine} />
          <span className={jiraAuthChrome.dividerText}>Or continue with email</span>
          <div className={jiraAuthChrome.dividerLine} />
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className={jiraAuthChrome.label}>Email</label>
              <div className="relative">
                <Mail className={jiraAuthChrome.iconInInput} />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  className={cn(jiraAuthChrome.input, jiraAuthChrome.inputWithIcon)}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className={jiraAuthChrome.label}>Password</label>
              <div className="relative">
                <Lock className={jiraAuthChrome.iconInInput} />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className={cn(jiraAuthChrome.input, jiraAuthChrome.inputWithIcon, "pr-10")}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#97a0af] hover:text-[#44546f]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className={jiraAuthChrome.error} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || msLoading || googleLoading}
            className={jiraAuthChrome.btnPrimary}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {isLoading ? "Signing in…" : "Log in"}
          </button>
        </form>

        <footer className={jiraAuthChrome.footer}>
          &copy; {new Date().getFullYear()} Mathionix Technologies
        </footer>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className={cn(jiraAuthChrome.page, "flex items-center justify-center")}>
        <Loader2 className="h-6 w-6 animate-spin text-[#0052cc]" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
