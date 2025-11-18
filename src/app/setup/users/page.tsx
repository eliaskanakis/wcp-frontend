"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type UserRow = {
  id: string;
  email: string;
  name: string;
  globalAdmin: boolean;
  updatedAt?: Timestamp | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const usersRef = collection(db, "users");
        const userSnapshot = await getDocs(
          query(usersRef, orderBy("name", "asc"))
        );
        const payload: UserRow[] = userSnapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<UserRow>;
          return {
            id: docSnap.id,
            email: data.email ?? "",
            name: data.name ?? "Unnamed user",
            globalAdmin: Boolean(data.globalAdmin),
            updatedAt: data.updatedAt,
          };
        });
        setUsers(payload);
      } catch (error) {
        console.error("Failed to load users", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchUsers();
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <section>
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Users</h1>
          <p className="mt-2 text-sm text-slate-600">
          </p>
        </header>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-12 border-b border-slate-100 bg-slate-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span className="col-span-5">Email</span>
            <span className="col-span-4">Name</span>
            <span className="col-span-3 text-center">Global Admin</span>
          </div>
          {loading ? (
            <div className="px-6 py-6 text-center text-sm text-slate-500">
              Loading users...
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-slate-500">
              No users found.
            </div>
          ) : (
            <ul>
              {sortedUsers.map((user) => (
                <li
                  key={user.id}
                  className="border-t border-slate-100 px-6 py-4 text-sm text-slate-700"
                >
                  <div className="flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:items-center sm:gap-0">
                    <span className="font-medium text-slate-900 sm:col-span-5">
                      {user.email}
                    </span>
                    <span className="text-slate-600 sm:col-span-4">
                      {user.name}
                    </span>
                    <span className="sm:col-span-3 sm:flex sm:justify-center">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:hidden">
                        Global Admin
                      </span>
                      <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:w-auto">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-slate-900"
                          checked={user.globalAdmin}
                          readOnly
                        />
                        Admin
                      </label>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
