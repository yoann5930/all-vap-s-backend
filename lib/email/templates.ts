import { formatPrice } from "@/lib/utils";
import { getEmailConfig } from "./config";
import { escapeHtml, wrapEmailHtml, wrapEmailText } from "./layout";
import type { OrderEmailItem } from "./types";

function hello(name?: string | null) {
  return name ? `Bonjour ${name}` : "Bonjour";
}

function orderRef(orderId: string) {
  return orderId.slice(-8).toUpperCase();
}

export function accountCreatedTemplate(params: {
  firstName?: string | null;
  email: string;
}) {
  const cfg = getEmailConfig();
  const accountUrl = `${cfg.publicUrl}/account`;
  const subject = "Bienvenue chez All Vap's";
  const bodyText = `${hello(params.firstName)},

Votre compte All Vap's a bien été créé.

Adresse associée : ${params.email}

Accédez à votre compte : ${accountUrl}

Ne communiquez jamais votre mot de passe. All Vap's ne vous le demandera jamais par e-mail.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.firstName))},</p>
    <p>Votre compte <strong>All Vap's</strong> a bien été créé.</p>
    <p>Adresse associée&nbsp;: <strong>${escapeHtml(params.email)}</strong></p>
    <p>Ne communiquez jamais votre mot de passe. Nous ne vous le demanderons jamais par e-mail.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Accéder à mon compte",
      ctaUrl: accountUrl,
    }),
    text: wrapEmailText(bodyText),
  };
}

export function emailVerificationTemplate(params: {
  firstName?: string | null;
  confirmUrl: string;
}) {
  const subject = "Confirmez votre adresse e-mail All Vap's";
  const bodyText = `${hello(params.firstName)},

Confirmez votre adresse e-mail All Vap's en ouvrant ce lien (valable 48 heures) :
${params.confirmUrl}

Si vous n'avez pas créé de compte, ignorez cet e-mail.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.firstName))},</p>
    <p>Confirmez votre adresse e-mail pour finaliser votre compte All Vap's (lien valable 48 heures).</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Confirmer mon adresse",
      ctaUrl: params.confirmUrl,
    }),
    text: wrapEmailText(bodyText),
  };
}

export function passwordResetTemplate(params: { resetUrl: string }) {
  const subject = "Réinitialisation de votre mot de passe All Vap's";
  const bodyText = `Bonjour,

Pour réinitialiser votre mot de passe All Vap's, ouvrez ce lien (valable 1 heure) :
${params.resetUrl}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
  const bodyHtml = `
    <p>Bonjour,</p>
    <p>Une demande de réinitialisation de mot de passe a été effectuée pour votre compte All Vap's.</p>
    <p>Le lien est valable <strong>1 heure</strong> et ne peut être utilisé qu'une seule fois.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Réinitialiser mon mot de passe",
      ctaUrl: params.resetUrl,
    }),
    text: wrapEmailText(bodyText),
  };
}

export function passwordChangedTemplate(params: { firstName?: string | null }) {
  const cfg = getEmailConfig();
  const subject = "Votre mot de passe All Vap's a été modifié";
  const bodyText = `${hello(params.firstName)},

Votre mot de passe All Vap's a bien été modifié.

Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.firstName))},</p>
    <p>Votre mot de passe All Vap's a bien été modifié.</p>
    <p>Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Accéder à mon compte",
      ctaUrl: `${cfg.publicUrl}/account`,
    }),
    text: wrapEmailText(bodyText),
  };
}

function itemsToHtml(items: OrderEmailItem[]) {
  return items
    .map((i) => {
      const line = `${escapeHtml(i.name)}${i.variantLabel ? ` (${escapeHtml(i.variantLabel)})` : ""}${
        i.isGift ? " — offert" : ""
      } × ${i.quantity}`;
      const price = i.isGift ? "Offert" : formatPrice(i.priceCents * i.quantity);
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">${line}</td><td style="padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">${price}</td></tr>`;
    })
    .join("");
}

function itemsToText(items: OrderEmailItem[]) {
  return items
    .map((i) => {
      const price = i.isGift ? "Offert" : formatPrice(i.priceCents * i.quantity);
      return `- ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}${i.isGift ? " [offert]" : ""} × ${i.quantity} : ${price}`;
    })
    .join("\n");
}

export function paymentConfirmationTemplate(params: {
  orderId: string;
  customerName?: string | null;
  totalCents: number;
  items: OrderEmailItem[];
  discountCents?: number;
  shippingCents?: number;
  shippingAddress?: string | null;
  deliveryMethod?: string | null;
  pickupStoreLabel?: string | null;
}) {
  const ref = orderRef(params.orderId);
  const cfg = getEmailConfig();
  const subject = `Paiement confirmé — commande All Vap's n°${ref}`;
  const subtotal =
    params.items.reduce((s, i) => s + (i.isGift ? 0 : i.priceCents * i.quantity), 0);
  const bodyText = `${hello(params.customerName)},

Votre paiement a bien été confirmé pour la commande n°${ref}.

${itemsToText(params.items)}

Sous-total : ${formatPrice(subtotal)}
${params.discountCents ? `Remise : -${formatPrice(params.discountCents)}\n` : ""}${
    params.shippingCents != null ? `Livraison : ${formatPrice(params.shippingCents)}\n` : ""
  }Total payé : ${formatPrice(params.totalCents)}
${params.deliveryMethod ? `Mode : ${params.deliveryMethod}\n` : ""}${
    params.pickupStoreLabel ? `Retrait : ${params.pickupStoreLabel}\n` : ""
  }${params.shippingAddress ? `Adresse : ${params.shippingAddress}\n` : ""}
Votre commande est prise en charge. Vous recevrez un e-mail lors des prochaines étapes.

Suivi : ${cfg.publicUrl}/account/commandes`;

  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Votre paiement a bien été confirmé pour la commande <strong>n°${escapeHtml(ref)}</strong>.</p>
    <table role="presentation" width="100%" style="margin:16px 0;font-size:14px;">${itemsToHtml(params.items)}</table>
    <p style="margin:8px 0;">Sous-total&nbsp;: ${formatPrice(subtotal)}<br/>
    ${params.discountCents ? `Remise&nbsp;: −${formatPrice(params.discountCents)}<br/>` : ""}
    ${params.shippingCents != null ? `Livraison&nbsp;: ${formatPrice(params.shippingCents)}<br/>` : ""}
    <strong>Total payé&nbsp;: ${formatPrice(params.totalCents)}</strong></p>
    ${params.deliveryMethod ? `<p>Mode de livraison&nbsp;: ${escapeHtml(params.deliveryMethod)}</p>` : ""}
    ${params.pickupStoreLabel ? `<p>Boutique de retrait&nbsp;: ${escapeHtml(params.pickupStoreLabel)}</p>` : ""}
    ${params.shippingAddress ? `<p>Adresse&nbsp;: ${escapeHtml(params.shippingAddress)}</p>` : ""}
    <p>Votre commande est prise en charge. Vous serez informé(e) des prochaines étapes.</p>
  `;

  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Voir ma commande",
      ctaUrl: `${cfg.publicUrl}/account/commandes`,
    }),
    text: wrapEmailText(bodyText),
  };
}

/** Alias historique = confirmation après paiement */
export const orderConfirmationTemplate = paymentConfirmationTemplate;

export function orderShippedTemplate(params: {
  orderId: string;
  customerName?: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
  carrierLabel?: string | null;
}) {
  const ref = orderRef(params.orderId);
  const subject = `Votre commande All Vap's n°${ref} a été expédiée`;
  const track =
    params.trackingUrl && /^https?:\/\//i.test(params.trackingUrl)
      ? params.trackingUrl
      : null;
  const bodyText = `${hello(params.customerName)},

Votre commande n°${ref} a été expédiée.
${params.carrierLabel ? `Transporteur : ${params.carrierLabel}\n` : ""}N° de suivi : ${params.trackingNumber}
${track ? `Suivi : ${track}\n` : ""}
Merci pour votre confiance.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Votre commande <strong>n°${escapeHtml(ref)}</strong> a été expédiée.</p>
    ${params.carrierLabel ? `<p>Transporteur&nbsp;: ${escapeHtml(params.carrierLabel)}</p>` : ""}
    <p>N° de suivi&nbsp;: <strong>${escapeHtml(params.trackingNumber)}</strong></p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: track ? "Suivre mon colis" : undefined,
      ctaUrl: track || undefined,
    }),
    text: wrapEmailText(bodyText),
  };
}

export function orderDeliveredTemplate(params: {
  orderId: string;
  customerName?: string | null;
}) {
  const ref = orderRef(params.orderId);
  const subject = `Votre commande All Vap's n°${ref} a été livrée`;
  const bodyText = `${hello(params.customerName)},

Votre commande n°${ref} a été marquée comme livrée. Nous espérons que tout vous convient.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Votre commande <strong>n°${escapeHtml(ref)}</strong> a été marquée comme livrée.</p>
    <p>Nous espérons que tout vous convient.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function orderStatusUpdateTemplate(params: {
  orderId: string;
  customerName?: string | null;
  statusLabel: string;
  previousLabel?: string;
}) {
  const ref = orderRef(params.orderId);
  const subject = `Mise à jour commande All Vap's n°${ref} — ${params.statusLabel}`;
  const bodyText = `${hello(params.customerName)},

Votre commande n°${ref} est maintenant : ${params.statusLabel}.
${params.previousLabel ? `Statut précédent : ${params.previousLabel}.` : ""}`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Votre commande <strong>n°${escapeHtml(ref)}</strong> est maintenant :</p>
    <p><strong>${escapeHtml(params.statusLabel)}</strong></p>
    ${
      params.previousLabel
        ? `<p style="color:#666;font-size:13px;">Statut précédent : ${escapeHtml(params.previousLabel)}</p>`
        : ""
    }
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function orderReadyPickupTemplate(params: {
  orderId: string;
  customerName?: string | null;
  storeName: string;
  storeAddress: string;
}) {
  const ref = orderRef(params.orderId);
  const subject = "Votre commande All Vap's est prête";
  const bodyText = `${hello(params.customerName)},

Votre commande n°${ref} est prête pour retrait.

Boutique : ${params.storeName}
${params.storeAddress}

Présentez le numéro de commande ou une pièce d'identité à l'accueil.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Votre commande <strong>n°${escapeHtml(ref)}</strong> est prête pour retrait.</p>
    <p><strong>${escapeHtml(params.storeName)}</strong><br/>${escapeHtml(params.storeAddress)}</p>
    <p>Présentez le numéro de commande ou une pièce d'identité à l'accueil.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function orderCancelledTemplate(params: {
  orderId: string;
  customerName?: string | null;
}) {
  const ref = orderRef(params.orderId);
  const subject = `Commande All Vap's n°${ref} annulée`;
  const bodyText = `${hello(params.customerName)},

Votre commande n°${ref} a été annulée. Pour toute question, répondez à cet e-mail.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Votre commande <strong>n°${escapeHtml(ref)}</strong> a été annulée.</p>
    <p>Pour toute question, répondez simplement à cet e-mail.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function orderRefundedTemplate(params: {
  orderId: string;
  customerName?: string | null;
  totalCents?: number;
}) {
  const ref = orderRef(params.orderId);
  const subject = `Remboursement — commande All Vap's n°${ref}`;
  const amount =
    params.totalCents != null ? ` Montant concerné : ${formatPrice(params.totalCents)}.` : "";
  const bodyText = `${hello(params.customerName)},

Le remboursement de votre commande n°${ref} a été enregistré.${amount}`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.customerName))},</p>
    <p>Le remboursement de votre commande <strong>n°${escapeHtml(ref)}</strong> a été enregistré.${
      params.totalCents != null
        ? ` Montant concerné&nbsp;: <strong>${formatPrice(params.totalCents)}</strong>.`
        : ""
    }</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function contactConfirmationTemplate(params: {
  firstName?: string | null;
  requestId: string;
}) {
  const subject = "Nous avons bien reçu votre message";
  const bodyText = `${hello(params.firstName)},

Nous avons bien reçu votre message (réf. ${params.requestId}).
Notre équipe vous répondra dans les meilleurs délais.`;
  const bodyHtml = `
    <p>${escapeHtml(hello(params.firstName))},</p>
    <p>Nous avons bien reçu votre message (réf. <strong>${escapeHtml(params.requestId)}</strong>).</p>
    <p>Notre équipe vous répondra dans les meilleurs délais.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function contactAdminTemplate(params: {
  requestId: string;
  fromEmail: string;
  fromName?: string | null;
  message: string;
}) {
  const subject = `Nouveau message client — All Vap's (${params.requestId})`;
  const bodyText = `Nouveau message ${params.requestId}
De : ${params.fromName || ""} <${params.fromEmail}>

${params.message}`;
  const bodyHtml = `
    <p>Nouveau message client — réf. <strong>${escapeHtml(params.requestId)}</strong></p>
    <p>De&nbsp;: ${escapeHtml(params.fromName || "")} &lt;${escapeHtml(params.fromEmail)}&gt;</p>
    <p style="white-space:pre-wrap;">${escapeHtml(params.message)}</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function adminNewOrderTemplate(params: {
  orderId: string;
  customerEmail: string;
  totalCents: number;
}) {
  const ref = orderRef(params.orderId);
  const cfg = getEmailConfig();
  const subject = `Nouvelle commande payée — All Vap's n°${ref}`;
  const bodyText = `Nouvelle commande payée n°${ref}
Client : ${params.customerEmail}
Total : ${formatPrice(params.totalCents)}
Admin : ${cfg.publicUrl}/admin/orders`;
  const bodyHtml = `
    <p>Nouvelle commande payée <strong>n°${escapeHtml(ref)}</strong></p>
    <p>Client&nbsp;: ${escapeHtml(params.customerEmail)}</p>
    <p>Total&nbsp;: <strong>${formatPrice(params.totalCents)}</strong></p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Ouvrir l'administration",
      ctaUrl: `${cfg.publicUrl}/admin/orders`,
    }),
    text: wrapEmailText(bodyText),
  };
}

export function adminNewRegistrationTemplate(params: {
  email: string;
  firstName?: string | null;
  customerId: string;
}) {
  const cfg = getEmailConfig();
  const name = params.firstName || "—";
  const subject = `Nouvelle inscription — All Vap's`;
  const bodyText = `Nouvelle inscription client
Nom : ${name}
Email : ${params.email}
Id : ${params.customerId}
Admin : ${cfg.publicUrl}/admin/customers`;
  const bodyHtml = `
    <p>Nouvelle inscription client</p>
    <p>Nom&nbsp;: ${escapeHtml(name)}</p>
    <p>Email&nbsp;: ${escapeHtml(params.email)}</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({
      title: subject,
      bodyHtml,
      ctaLabel: "Voir les clients",
      ctaUrl: `${cfg.publicUrl}/admin/customers`,
    }),
    text: wrapEmailText(bodyText),
  };
}

export function adminTestTemplate() {
  const subject = "E-mail de test All Vap's";
  const bodyText = `Ceci est un e-mail de test envoyé depuis le service A.V.A. — All Vap's.
Si vous recevez ce message, la configuration d'envoi fonctionne.`;
  const bodyHtml = `
    <p>Ceci est un <strong>e-mail de test</strong> envoyé depuis le service A.V.A. — All Vap's.</p>
    <p>Si vous recevez ce message, la configuration d'envoi fonctionne.</p>
  `;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

/** Fidélité — modèles prêts, envoi conditionné par LOYALTY_EMAILS_ENABLED */
export function loyaltyLinkedTemplate(params: { firstName?: string | null }) {
  const subject = "Votre carte fidélité All Vap's est associée";
  const bodyText = `${hello(params.firstName)},\n\nVotre carte fidélité a bien été associée à votre compte.`;
  const bodyHtml = `<p>${escapeHtml(hello(params.firstName))},</p><p>Votre carte fidélité a bien été associée à votre compte.</p>`;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}

export function loyaltyPointsAddedTemplate(params: {
  firstName?: string | null;
  points: number;
}) {
  const subject = "Points fidélité All Vap's";
  const bodyText = `${hello(params.firstName)},\n\n${params.points} points ont été ajoutés à votre compte.`;
  const bodyHtml = `<p>${escapeHtml(hello(params.firstName))},</p><p><strong>${params.points}</strong> points ont été ajoutés à votre compte.</p>`;
  return {
    subject,
    html: wrapEmailHtml({ title: subject, bodyHtml }),
    text: wrapEmailText(bodyText),
  };
}
