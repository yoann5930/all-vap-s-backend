"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";

interface CatalogItem {
  id: string;
  name: string;
  slug: string;
  _count?: { products: number };
}

export function AdminCatalogClient() {
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<CatalogItem[]>([]);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [brandForm, setBrandForm] = useState({ name: "" });
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/catalog");
    const data = await res.json();
    setCategories(data.categories || []);
    setBrands(data.brands || []);
  }

  useEffect(() => { load(); }, []);

  async function syncCatalog() {
    setLoading(true);
    await fetch("/api/admin/catalog?type=sync-catalog", { method: "POST" });
    await load();
    setLoading(false);
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catForm),
    });
    setCatForm({ name: "", description: "" });
    load();
  }

  async function addBrand(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/catalog?type=brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brandForm),
    });
    setBrandForm({ name: "" });
    load();
  }

  async function deleteItem(type: "brand" | "category", id: string) {
    if (!confirm("Supprimer ?")) return;
    await fetch(`/api/admin/catalog?type=${type}&id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-6">
      <Button onClick={syncCatalog} loading={loading} className="gap-2">
        <RefreshCw className="h-4 w-4" /> Synchroniser le catalogue officiel (16 catégories)
      </Button>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="font-semibold">Catégories ({categories.length})</h2>
            <form onSubmit={addCategory} className="mt-4 flex gap-2">
              <Input placeholder="Nom" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
              <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
            </form>
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{c.name} <span className="text-gray-400">/{c.slug}</span> {c._count && <span className="text-gray-400">({c._count.products})</span>}</span>
                  <button onClick={() => deleteItem("category", c.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold">Marques ({brands.length})</h2>
            <form onSubmit={addBrand} className="mt-4 flex gap-2">
              <Input placeholder="Nom marque" value={brandForm.name} onChange={(e) => setBrandForm({ name: e.target.value })} required />
              <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
            </form>
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {brands.map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{b.name} {b._count && <span className="text-gray-400">({b._count.products})</span>}</span>
                  <button onClick={() => deleteItem("brand", b.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
