"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type Mode = "signIn" | "register";

export default function LoginPage() {
  const {
    profile,
    loginWithEmail,
    loginWithGoogle,
    registerWithEmail,
    loading,
  } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>("signIn");

  useEffect(() => {
    if (profile) {
      router.replace("/");
    }
  }, [profile, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        const trimmedName = name.trim();
        if (!trimmedName) {
          setError("Please provide your name.");
          setSubmitting(false);
          return;
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setSubmitting(false);
          return;
        }

        await registerWithEmail(trimmedName, email, password);
      } else {
        await loginWithEmail(email, password);
      }

      router.replace("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in right now.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      router.replace("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to sign in right now.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Warehouse Coordination Platform
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {mode === "signIn" ? "Sign in to continue" : "Create your account"}
          </h1>
        </div>
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "register" && (
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
          {mode === "register" && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting
              ? mode === "signIn"
                ? "Signing in..."
                : "Creating account..."
              : mode === "signIn"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-slate-400">
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
          or
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
        </div>
        <button
          onClick={handleGoogle}
          disabled={submitting || loading}
          className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Continue with Google
        </button>
        <p className="mt-6 text-center text-sm text-slate-500">
          {mode === "signIn" ? (
            <>
              Need an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="font-semibold text-slate-900 hover:underline"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signIn");
                  setError(null);
                }}
                className="font-semibold text-slate-900 hover:underline"
              >
                Back to sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
