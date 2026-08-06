"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { clearCart, getCartTotal } from "@/lib/cart";
import { notifyCartUpdate } from "@/components/cart/CartProvider";
import { formatPrice } from "@/lib/utils";
import { getPublicShippingOptions } from "@/lib/shipping";
import { calculatePromo10ml, type Promo10mlCartLine } from "@/lib/promotions/promo-10ml";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { AuthForm } from "@/components/auth/AuthForm";

type AuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailVerified?: boolean;
};

type AddressRow = {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
};

function formatAddressLine(a: AddressRow): string {
  return `${a.firstName} ${a.lastName}, ${a.street}, ${a.postalCode} ${a.city}, ${a.country}`;
}

function CheckoutPageInner() {
  const { items } = useCart();
  const subtotal = getCartTotal(items);
  const promoLines: Promo10mlCartLine[] = items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.priceCents,
    category: item.category,
    productType: item.productType,
    volumeMl: item.volumeMl,
    promotion10mlEligible: item.promotion10mlEligible,
    availableQuantity: item.quantity,
  }));
  const promo10 = calculatePromo10ml(promoLines);

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [billingAddressId, setBillingAddressId] = useState<string>("");
  const [differentBilling, setDifferentBilling] = useState(false);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: "Domicile",
    firstName: "",
    lastName: "",
    street: "",
    street2: "",
    city: "",
    postalCode: "",
    country: "FR",
    phone: "",
    isDefault: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("STORE_PICKUP");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscountCents, setCouponDiscountCents] = useState(0);

  const shippingOptions = getPublicShippingOptions();
  const shipping = shippingOptions.find((o) => o.id === deliveryMethod)?.priceCents ?? 0;
  const discountCents = promo10.discountCents + couponDiscountCents;
  const total = Math.max(0, subtotal - discountCents + shipping);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === selectedAddressId) || null,
    [addresses, selectedAddressId]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadAuth() {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (cancelled) return;
        if (data.user) {
          setUser(data.user);
          const addrRes = await fetch("/api/account/addresses");
          if (addrRes.ok) {
            const list = (await addrRes.json()) as AddressRow[];
            setAddresses(list);
            const def = list.find((a) => a.isDefault) || list[0];
            if (def) {
              setSelectedAddressId(def.id);
              setBillingAddressId(def.id);
            } else setShowNewAddress(true);
          } else {
            setShowNewAddress(true);
          }
          setNewAddress((prev) => ({
            ...prev,
            firstName: data.user.firstName || "",
            lastName: data.user.lastName || "",
            phone: data.user.phone || "",
          }));
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    loadAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <p className="text-[#A7B0BC]">Votre panier est vide.</p>
        <Button href="/boutique" className="mt-6">
          Voir la boutique
        </Button>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-[#A7B0BC]">
        Chargement…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="text-center text-[#A7B0BC]">Chargement…</div>}>
          <AuthForm mode="login" redirectTo="/checkout" embedded />
        </Suspense>
      </div>
    );
  }

  if (user.emailVerified === false) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-[#A7B0BC]">
          Activez votre compte via le lien reçu par e-mail avant de finaliser une commande.
        </p>
        <Button href="/account" className="mt-6">
          Mon compte
        </Button>
      </div>
    );
  }

  async function applyCoupon() {
    setError("");
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: couponCode,
        orderTotalCents: Math.max(0, subtotal - promo10.discountCents),
      }),
    });
    const data = await res.json();
    if (res.ok) setCouponDiscountCents(data.discountCents);
    else setError(data.error || "Code invalide");
  }

  async function saveNewAddress(): Promise<AddressRow | null> {
    const { street2, ...rest } = newAddress;
    const street = [rest.street, street2].filter(Boolean).join(", ");
    const res = await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        street,
        phone: rest.phone || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Impossible d'enregistrer l'adresse");
      return null;
    }
    setAddresses((prev) => [data, ...prev]);
    setSelectedAddressId(data.id);
    setBillingAddressId(data.id);
    setShowNewAddress(false);
    return data as AddressRow;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let address = selectedAddress;
      if (deliveryMethod !== "STORE_PICKUP") {
        if (showNewAddress || !address) {
          address = await saveNewAddress();
          if (!address) return;
        }
      }

      const shippingAddress =
        deliveryMethod === "STORE_PICKUP"
          ? "Retrait boutique"
          : address
            ? formatAddressLine(address)
            : "";

      if (deliveryMethod !== "STORE_PICKUP" && !shippingAddress) {
        setError("Veuillez renseigner une adresse de livraison.");
        return;
      }

      let shippingPayload = shippingAddress;
      if (differentBilling && deliveryMethod !== "STORE_PICKUP") {
        const bill =
          addresses.find((a) => a.id === billingAddressId) ||
          (billingAddressId === selectedAddressId ? address : null);
        if (!bill) {
          setError("Veuillez sélectionner une adresse de facturation.");
          return;
        }
        shippingPayload = `${shippingAddress} | Facturation : ${formatAddressLine(bill)}`;
      }

      const customerName =
        [user!.firstName, user!.lastName].filter(Boolean).join(" ") ||
        (address ? `${address.firstName} ${address.lastName}` : user!.email);

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: user!.email,
          customerName,
          shippingAddress: shippingPayload,
          deliveryMethod,
          couponCode: couponCode || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || undefined,
            quantity: item.quantity,
          })),
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        if (orderRes.status === 409 || orderData.code?.startsWith?.("STOCK")) {
          setError(
            orderData.error ||
              "Désolé, un ou plusieurs produits ne sont plus disponibles."
          );
          window.setTimeout(() => {
            window.location.href = "/cart";
          }, 1500);
          return;
        }
        setError(orderData.error || "Le paiement n'a pas pu être finalisé.");
        return;
      }

      const checkoutRes = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderData.id,
          checkoutToken: orderData.checkoutToken,
        }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        if (checkoutRes.status === 409 || checkoutData.code?.startsWith?.("STOCK")) {
          setError(
            checkoutData.error ||
              "Désolé, un ou plusieurs produits ne sont plus disponibles."
          );
          window.setTimeout(() => {
            window.location.href = "/cart";
          }, 1500);
          return;
        }
        setError(
          checkoutData.error ||
            "Le service de paiement est temporairement indisponible. Aucun montant n'a été débité."
        );
        return;
      }

      if (!checkoutData.redirectUrl) {
        setError(
          "Le paiement n'a pas pu être finalisé. Vérifiez vos informations puis réessayez. Aucun montant n'a été débité."
        );
        return;
      }

      clearCart();
      notifyCartUpdate();
      window.location.href = checkoutData.redirectUrl;
    } catch {
      setError(
        "Le paiement n'a pas pu être finalisé. Vérifiez vos informations puis réessayez."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-white">Finaliser la commande</h1>
      <p className="mt-1 text-sm text-[#A7B0BC]">
        Connecté en tant que {user.email}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <Card>
          <CardBody className="space-y-3 text-sm text-[#F5F7FA]">
            <h2 className="font-semibold text-white">Vos informations</h2>
            <p>
              {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
            </p>
            <p className="text-[#A7B0BC]">{user.email}</p>
            {user.phone && <p className="text-[#A7B0BC]">{user.phone}</p>}
            <Link href="/account" className="text-brand-400 hover:underline">
              Gérer mon compte
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold text-white">Livraison</h2>
            <div className="mt-4 space-y-2">
              {shippingOptions.map((opt) => {
                const selected = deliveryMethod === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                      selected
                        ? "checkout-shipping-selected border-brand-500 bg-brand-50"
                        : "border-white/10 text-[#F5F7FA]",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      value={opt.id}
                      checked={selected}
                      onChange={() => setDeliveryMethod(opt.id)}
                      className="accent-brand-600"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{opt.name}</p>
                      <p
                        className={`text-xs ${selected ? "checkout-shipping-desc" : "text-[#A7B0BC]"}`}
                      >
                        {opt.description} — {opt.estimatedDays}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {opt.priceCents === 0 ? "Gratuit" : formatPrice(opt.priceCents)}
                    </span>
                  </label>
                );
              })}
            </div>

            {deliveryMethod !== "STORE_PICKUP" && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold text-white">Adresse de livraison</h3>
                {addresses.length > 0 && !showNewAddress && (
                  <div className="space-y-2">
                    {addresses.map((a) => (
                      <label
                        key={a.id}
                        className={[
                          "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm",
                          selectedAddressId === a.id
                            ? "checkout-shipping-selected border-brand-500 bg-brand-50"
                            : "border-white/10 text-[#F5F7FA]",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="address"
                          checked={selectedAddressId === a.id}
                          onChange={() => setSelectedAddressId(a.id)}
                        />
                        <span>
                          <span className="font-medium">{a.label}</span>
                          <br />
                          {formatAddressLine(a)}
                        </span>
                      </label>
                    ))}
                    <button
                      type="button"
                      className="text-sm text-brand-400 hover:underline"
                      onClick={() => setShowNewAddress(true)}
                    >
                      Ajouter une adresse
                    </button>
                  </div>
                )}

                {(showNewAddress || addresses.length === 0) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Prénom"
                      required
                      value={newAddress.firstName}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, firstName: e.target.value })
                      }
                    />
                    <Input
                      label="Nom"
                      required
                      value={newAddress.lastName}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, lastName: e.target.value })
                      }
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="Adresse"
                        required
                        value={newAddress.street}
                        onChange={(e) =>
                          setNewAddress({ ...newAddress, street: e.target.value })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="Complément d'adresse (facultatif)"
                        value={newAddress.street2}
                        onChange={(e) =>
                          setNewAddress({ ...newAddress, street2: e.target.value })
                        }
                      />
                    </div>
                    <Input
                      label="Code postal"
                      required
                      value={newAddress.postalCode}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, postalCode: e.target.value })
                      }
                    />
                    <Input
                      label="Ville"
                      required
                      value={newAddress.city}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, city: e.target.value })
                      }
                    />
                    <Input
                      label="Pays"
                      required
                      value={newAddress.country}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, country: e.target.value })
                      }
                    />
                    <Input
                      label="Téléphone"
                      value={newAddress.phone}
                      onChange={(e) =>
                        setNewAddress({ ...newAddress, phone: e.target.value })
                      }
                    />
                    {addresses.length > 0 && (
                      <button
                        type="button"
                        className="text-left text-sm text-brand-400 hover:underline sm:col-span-2"
                        onClick={() => setShowNewAddress(false)}
                      >
                        Utiliser une adresse enregistrée
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                  <label className="flex items-start gap-2 text-sm text-[#A7B0BC]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={differentBilling}
                      onChange={(e) => setDifferentBilling(e.target.checked)}
                    />
                    <span>Utiliser une adresse de facturation différente</span>
                  </label>
                  {differentBilling && (
                    <div className="space-y-2">
                      <p className="text-xs text-[#A7B0BC]">
                        Choisissez une adresse enregistrée comme facturation, ou ajoutez-en une
                        nouvelle ci-dessus puis sélectionnez-la.
                      </p>
                      {addresses.map((a) => (
                        <label
                          key={`bill-${a.id}`}
                          className={[
                            "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm",
                            billingAddressId === a.id
                              ? "checkout-shipping-selected border-brand-500 bg-brand-50"
                              : "border-white/10 text-[#F5F7FA]",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="billing"
                            checked={billingAddressId === a.id}
                            onChange={() => setBillingAddressId(a.id)}
                          />
                          <span>
                            <span className="font-medium">{a.label}</span>
                            <br />
                            {formatAddressLine(a)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold text-white">Code promo</h2>
            <div className="mt-3 flex gap-2">
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Code promo"
              />
              <Button type="button" variant="outline" onClick={applyCoupon}>
                Appliquer
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2 text-sm text-[#F5F7FA]">
            <div className="flex justify-between">
              <span className="text-[#A7B0BC]">Sous-total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {promo10.discountCents > 0 && (
              <div className="flex justify-between text-brand-300">
                <span>
                  {promo10.label} ({promo10.freeQuantity} offert
                  {promo10.freeQuantity > 1 ? "s" : ""})
                </span>
                <span>-{formatPrice(promo10.discountCents)}</span>
              </div>
            )}
            {couponDiscountCents > 0 && (
              <div className="flex justify-between text-brand-300">
                <span>Code promo</span>
                <span>-{formatPrice(couponDiscountCents)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#A7B0BC]">Livraison</span>
              <span>{formatPrice(shipping)}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="text-brand-400">{formatPrice(total)}</span>
            </div>
          </CardBody>
        </Card>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Payer {formatPrice(total)}
        </Button>
        <p className="text-center text-xs text-[#A7B0BC]">
          Paiement sécurisé. Aucune donnée bancaire n&apos;est stockée sur All Vap&apos;s.
        </p>
      </form>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-[#A7B0BC]">Chargement…</div>}>
      <CheckoutPageInner />
    </Suspense>
  );
}
