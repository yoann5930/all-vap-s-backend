"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Product, Category, Brand } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import { CATALOG_CATEGORIES } from "@/lib/catalog/categories";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

interface AdminProductsClientProps {
  initialProducts: Product[];
  categories: Category[];
  brands: Brand[];
}

const emptyForm = {
  name: "",
  sku: "",
  description: "",
  category: "e-liquides",
  categoryId: "",
  brand: "",
  brandId: "",
  imageUrl: "",
  images: "",
  priceCents: 0,
  promoPriceCents: "",
  stock: 0,
  isActive: true,
  isNew: false,
  isBestSeller: false,
  isPromo: false,
};

export function AdminProductsClient({ initialProducts, categories, brands }: AdminProductsClientProps) {
  const [products, setProducts] = useState(initialProducts);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const categoryOptions = categories.length > 0
    ? categories
    : CATALOG_CATEGORIES.map((c, i) => ({ id: c.slug, name: c.name, slug: c.slug, sortOrder: i } as Category));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const selectedCat = categoryOptions.find((c) => c.slug === form.category);
    const selectedBrand = brands.find((b) => b.slug === form.brand || b.name === form.brand);

    const payload = {
      name: form.name,
      sku: form.sku || null,
      description: form.description || null,
      category: form.category,
      categoryId: selectedCat?.id || null,
      brand: form.brand || null,
      brandId: selectedBrand?.id || null,
      priceCents: Number(form.priceCents),
      promoPriceCents: form.promoPriceCents ? Number(form.promoPriceCents) : null,
      stock: Number(form.stock),
      imageUrl: form.imageUrl || null,
      images: form.images ? form.images.split("|").map((s) => s.trim()).filter(Boolean) : [],
      isActive: form.isActive,
      isNew: form.isNew,
      isBestSeller: form.isBestSeller,
      isPromo: form.isPromo,
    };

    try {
      const url = editingId ? `/api/products/${editingId}` : "/api/products";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (editingId) {
        setProducts(products.map((p) => (p.id === editingId ? data : p)));
      } else {
        setProducts([data, ...products]);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku || "",
      description: product.description || "",
      category: product.category,
      categoryId: product.categoryId || "",
      brand: product.brand || "",
      brandId: product.brandId || "",
      imageUrl: product.imageUrl || "",
      images: product.images?.join("|") || "",
      priceCents: product.priceCents,
      promoPriceCents: product.promoPriceCents ? String(product.promoPriceCents) : "",
      stock: product.stock,
      isActive: product.isActive,
      isNew: product.isNew,
      isBestSeller: product.isBestSeller,
      isPromo: product.isPromo,
    });
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (res.ok) setProducts(products.filter((p) => p.id !== id));
  }

  return (
    <div className="mt-6">
      <Button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }} className="gap-2">
        <Plus className="h-4 w-4" /> Ajouter un produit
      </Button>

      {showForm && (
        <Card className="mt-4">
          <CardBody>
            <h3 className="font-semibold">{editingId ? "Modifier" : "Nouveau produit"}</h3>
            <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Nom" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              <div>
                <label className="mb-1.5 block text-sm font-medium">Catégorie</label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {categoryOptions.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Marque</label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                >
                  <option value="">— Aucune —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <Input label="Prix (centimes)" type="number" required value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })} />
              <Input label="Prix promo (centimes)" type="number" value={form.promoPriceCents} onChange={(e) => setForm({ ...form, promoPriceCents: e.target.value })} />
              <Input label="Stock" type="number" required value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
              <Input label="URL image principale" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              <div className="sm:col-span-2">
                <Input label="Galerie (URLs séparées par |)" value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium">Description</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-4">
                {(["isActive", "isNew", "isBestSeller", "isPromo"] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                    {key === "isActive" ? "Actif" : key === "isNew" ? "Nouveau" : key === "isBestSeller" ? "Best-seller" : "Promo"}
                  </label>
                ))}
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" loading={loading}>{editingId ? "Enregistrer" : "Créer"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="pb-3 pr-4">Produit</th>
              <th className="pb-3 pr-4">SKU</th>
              <th className="pb-3 pr-4">Catégorie</th>
              <th className="pb-3 pr-4">Prix</th>
              <th className="pb-3 pr-4">Stock</th>
              <th className="pb-3 pr-4">Statut</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b">
                <td className="py-3 pr-4 font-medium">{product.name}</td>
                <td className="py-3 pr-4 text-gray-500">{product.sku || "—"}</td>
                <td className="py-3 pr-4">{product.category}</td>
                <td className="py-3 pr-4">{formatPrice(product.priceCents)}</td>
                <td className="py-3 pr-4">{product.stock}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={product.isActive ? "success" : "danger"}>{product.isActive ? "Actif" : "Inactif"}</Badge>
                    {product.isPromo && <Badge variant="danger">Promo</Badge>}
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(product)} className="text-gray-500 hover:text-brand-700"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(product.id)} className="text-gray-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
