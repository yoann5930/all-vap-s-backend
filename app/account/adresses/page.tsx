"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

interface Address {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  postalCode: string;
  isDefault: boolean;
}

const empty = { label: "Domicile", firstName: "", lastName: "", street: "", city: "", postalCode: "", phone: "", isDefault: false };

export default function AdressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);

  function load() {
    fetch("/api/account/addresses")
      .then((r) => r.json())
      .then((d) => setAddresses(Array.isArray(d) ? d : []));
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm(empty);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Mes adresses</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>Ajouter</Button>
      </div>

      {showForm && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <Input label="Libellé" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <Input label="Prénom" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <Input label="Nom" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              <Input label="Rue" required className="sm:col-span-2" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              <Input label="Ville" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input label="Code postal" required value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              <Button type="submit" className="sm:col-span-2">Enregistrer</Button>
            </form>
          </CardBody>
        </Card>
      )}

      {addresses.map((a) => (
        <Card key={a.id}>
          <CardBody>
            <p className="font-medium">{a.label} {a.isDefault && <span className="text-xs text-brand-600">(par défaut)</span>}</p>
            <p className="mt-1 text-sm text-gray-600">{a.firstName} {a.lastName}</p>
            <p className="text-sm text-gray-600">{a.street}, {a.postalCode} {a.city}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
