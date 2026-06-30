"use client";

import { useState, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";

type InsightField = {
  id: string;
  field_key: string;
  field_label: string;
  field_description: string;
  is_active: boolean;
  created_at: string;
};

type FieldsResponse = {
  success: boolean;
  data: InsightField[];
};

type FieldResponse = {
  success: boolean;
  data: InsightField;
};

export default function AdminPage() {
  const [fields, setFields] = useState<InsightField[]>([]);
  const [loading, setLoading] = useState(true);
  const [newField, setNewField] = useState({
    field_key: "",
    field_label: "",
    field_description: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    field_label: "",
    field_description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchFields() {
    try {
      const data = await apiFetch<FieldsResponse>("/admin/fields");
      setFields(data.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load fields.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFields();
  }, []);

  async function handleToggle(id: string) {
    try {
      await apiFetch<FieldResponse>(`/admin/fields/${id}/toggle`, {
        method: "PATCH",
      });
      await fetchFields();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to toggle field.");
    }
  }

  function startEdit(field: InsightField) {
    setEditingId(field.id);
    setEditValues({
      field_label: field.field_label,
      field_description: field.field_description,
    });
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<FieldResponse>(`/admin/fields/${editingId}`, {
        method: "PUT",
        body: editValues,
      });
      await fetchFields();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddField() {
    if (!newField.field_key || !newField.field_label) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<FieldResponse>("/admin/fields", {
        method: "POST",
        body: newField,
      });
      await fetchFields();
      setNewField({ field_key: "", field_label: "", field_description: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add field.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-lg font-bold text-[#1a1a2e]">Admin — Insight Fields</h1>
        <div className="flex items-center gap-2">
          <a
            href="/admin/analytics"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[#1a1a2e] text-sm hover:bg-gray-50 transition"
          >
            რეპორტინგი →
          </a>
          <a
            href="/admin/chat"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1a2e] text-white text-sm hover:opacity-80 transition"
          >
            ასისტენტის კონფიგურატორი →
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-8">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Section 1: Field list */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Fields
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#1a1a2e]" />
            </div>
          ) : fields.length === 0 ? (
            <p className="text-sm text-gray-400">No fields yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1a1a2e]">
                        {field.field_label}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {field.field_key}
                      </p>
                      {field.field_description && (
                        <p className="mt-2 text-sm text-gray-600">
                          {field.field_description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(field.id)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          field.is_active
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {field.is_active ? "აქტიური" : "გათიშული"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(field)}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Edit form */}
        {editingId !== null && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Edit Field
            </h2>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Label
                </label>
                <input
                  type="text"
                  value={editValues.field_label}
                  onChange={(e) =>
                    setEditValues((v) => ({ ...v, field_label: e.target.value }))
                  }
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Description
                </label>
                <input
                  type="text"
                  value={editValues.field_description}
                  onChange={(e) =>
                    setEditValues((v) => ({
                      ...v,
                      field_description: e.target.value,
                    }))
                  }
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex h-10 items-center justify-center rounded-xl bg-[#1a1a2e] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    "Save"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="h-10 rounded-xl border border-gray-200 px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Section 3: Add new field */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Add New Field
          </h2>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Key <span className="text-gray-400">(unique identifier)</span>
              </label>
              <input
                type="text"
                value={newField.field_key}
                onChange={(e) =>
                  setNewField((v) => ({ ...v, field_key: e.target.value }))
                }
                placeholder="e.g. company_name"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Label</label>
              <input
                type="text"
                value={newField.field_label}
                onChange={(e) =>
                  setNewField((v) => ({ ...v, field_label: e.target.value }))
                }
                placeholder="e.g. Company Name"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Description
              </label>
              <input
                type="text"
                value={newField.field_description}
                onChange={(e) =>
                  setNewField((v) => ({
                    ...v,
                    field_description: e.target.value,
                  }))
                }
                placeholder="e.g. The company the contact works at"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
            </div>
            <button
              type="button"
              onClick={handleAddField}
              disabled={saving || !newField.field_key || !newField.field_label}
              className="flex h-10 w-full items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "Add Field"
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
