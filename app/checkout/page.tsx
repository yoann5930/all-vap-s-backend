"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { clearCart, getCartTotal } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/utils";
import { SHIPPING_OPTIONS } from "@/lib/shipping";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function CheckoutPage() {
  const router = useRouter();
  const { items } = useCart();
  const subtotal = getCartTotal(items);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("COLISSIMO");
  const [paymentProvider, setPaymentProvider] = useState<"sumup" | "viva">("sumup");
  const [couponCode, setCouponCode] = useState("");
  const [discountCents, setDiscountCents] = useState(0);
  const [form, setForm] = useState({ email: "", name: "", address: "" });

  const shipping = SHIPPING_OPTIONS.find((o) => o.id === deliveryMethod)?.priceCents ?? 0;
  const total = Math.max(0, subtotal - discountCents + shipping);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <p className="text-gray-600">Votre panier est vide.</p>
      </div>
    );
  }

  async function applyCoupon() {
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCode, orderTotalCents: subtotal }),
    });
    const data = await res.json();
    if (res.ok) setDiscountCents(data.discountCents);
    else setError(data.error || "Code invalide");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: form.email,
          customerName: form.name,
          shippingAddress: deliveryMethod === "STORE_PICKUP" ? "Retrait boutique" : form.address,
          deliveryMethod,
          couponCode: couponCode || undefined,
          paymentProvider: paymentProvider.toUpperCase(),
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        setError(orderData.error || "Erreur commande");
        return;
      }

      const checkoutRes = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderData.id, provider: paymentProvider }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        setError(checkoutData.error || "Erreur paiement");
        return;
      }

      clearCart();
      notifyCartUpdate();

      if (checkoutData.redirectUrl) {
        window.location.href = checkoutData.redirectUrl;
      } else {
        router.push(`/checkout/success?orderId=${orderData.id}`);
      }
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-vap-black">Finaliser la commande</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="font-semibold">Coordonnées</h2>
            <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Nom complet" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {deliveryMethod !== "STORE_PICKUP" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Adresse</label>
                <textarea required rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold">Livraison</h2>
            <div className="mt-4 space-y-2">
              {SHIPPING_OPTIONS.map((opt) => (
                <label key={opt.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${deliveryMethod === opt.id ? "border-brand-500 bg-brand-50" : ""}`}>
                  <input type="radio" name="delivery" value={opt.id} checked={deliveryMethod === opt.id} onChange={() => setDeliveryMethod(opt.id)} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{opt.name}</p>
                    <p className="text-xs text-gray-500">{opt.description} — {opt.estimatedDays}</p>
                  </div>
                  <span className="text-sm font-medium">{opt.priceCents === 0 ? "Gratuit" : formatPrice(opt.priceCents)}</span>
                </label>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold">Paiement</h2>
            <div className="mt-4 flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" checked={paymentProvider === "viva"} onChange={() => setPaymentProvider("viva")} />
                Viva.com
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={paymentProvider === "sumup"} onChange={() => setPaymentProvider("sumup")} />
                SumUp
              </label>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold">Code promo</h2>
            <div className="mt-3 flex gap-2">
              <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="BIENVENUE10" />
              <Button type="button" variant="outline" onClick={applyCoupon}>Appliquer</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Sous-total</span><span>{formatPrice(subtotal)}</span></div>
            {discountCents > 0 && <div className="flex justify-between text-brand-700"><span>Réduction</span><span>-{formatPrice(discountCents)}</span></div>}
            <div className="flex justify-between"><span>Livraison</span><span>{formatPrice(shipping)}</span></div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span className="text-brand-700">{formatPrice(total)}</span></div>
          </CardBody>
        </Card>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Payer {formatPrice(total)}
        </Button>
      </form>
    </div>
  );
}
