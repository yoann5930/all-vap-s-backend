/**
 * Intentions métier communes — site, Android et /api/ava.
 * Classification déterministe : le LLM n'est pas la source de vérité.
 */
export type AvaIntentKind =
  | "GENERAL"
  | "PRODUCT_SEARCH"
  | "STOCK"
  | "ORDER"
  | "CLIENT_FILE"
  | "NICOTINE"
  | "LOYALTY"
  | "EMAIL"
  | "SHIPPING"
  | "INTERNAL_OPS"
  | "SYSTEM_HEALTH"
  | "SYSTEM_STATUS"
  | "MEMORY"
  | "WEB"
  | "BUSINESS"
  | "CLOCK"
  | "SITE"
  | "VAPE_KNOWLEDGE";

export type AvaNeed = AvaIntentKind | "PRODUCT" | "ADMIN_OPS";

function norm(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyAvaIntent(raw: string): AvaIntentKind {
  const n = norm(raw);
  if (!n) return "GENERAL";

  if (
    /check[- ]?up|check up|teste ton systeme|fais ton check|auto[- ]?diagnost|quel est ton etat|ton etat systeme/.test(
      n,
    ) ||
    (/teste? (ton |le |ta |tes )/.test(n) &&
      /(micro|memoire|site|stock|commande|mail|boite|fidelatoo|serveur|systeme)/.test(n))
  ) {
    return "SYSTEM_HEALTH";
  }
  if (
    /etat du serveur|le site fonctionne|site all vap|allvaps\.fr/.test(n) &&
    /fonctionn|marche|en ligne|disponible|sante|status|ca marche/.test(n)
  ) {
    return "SITE";
  }
  if (/quel est ton etat|ton statut|system status/.test(n)) {
    return "SYSTEM_STATUS";
  }

  if (
    /\b(memorise|retiens?|retient|retenir|retenons|souviens[- ]toi|tu te souviens|rappelle[- ]moi)\b/.test(
      n,
    )
  ) {
    return "MEMORY";
  }

  if (
    /taux de nicotine|sels? de nicotine|nicotine classique|freebase|calcul(er)? (la )?nicotine/.test(
      n,
    ) ||
    (/booster/.test(n) && /\b(50\s*ml|10\s*ml|mg)\b/.test(n)) ||
    (/\b\d+\s*mg\b/.test(n) && /(ne (me )?suffit pas|trop (fort|faible)|arrache|gorge|manque)/.test(n)) ||
    (/je ne fume pas/.test(n) && /nicotine|\d+\s*mg/.test(n))
  ) {
    return "NICOTINE";
  }

  if (
    /\b(fidelatoo|fidelite|points? fidel|compte fidel|carte fidel|recompense fidel|qr code fidel)\b/.test(
      n,
    ) ||
    /programme de fidelite|points de fidelite/.test(n)
  ) {
    return "LOYALTY";
  }

  if (
    /chiffre d affaires|chiffre daffaires|panier moyen|ca du jour|ventes du jour|statistique|rapport de stock|etat de l inventaire|\binventaire\b|outils admin/.test(
      n,
    )
  ) {
    return "INTERNAL_OPS";
  }

  if (/fiche client|compte client/.test(n)) {
    return "CLIENT_FILE";
  }

  if (
    /\bcommandes?\b/.test(n) &&
    /(prepar|pretes?|prete|derniere|en retard|y a t il|est ce qu|combien|liste|en attente)/.test(n)
  ) {
    return "ORDER";
  }

  if (
    /(boite mail|boite e-mail|tes e-?mails|nouveaux? e-?mails|lis (tes |mes )?e-?mails|inbox|messagerie ava)/.test(
      n,
    ) ||
    (/e-?mails?/.test(n) && /(fonctionn|marche|lis|lire|nouveaux?|recu)/.test(n))
  ) {
    return "EMAIL";
  }

  if (
    /(mondial relay|relais colis|chronopost)/.test(n) &&
    /(etat|status|disponible|configur|etiquette|expedition|transporteur)/.test(n)
  ) {
    return "SHIPPING";
  }

  const boutique =
    /\bhautmont\b/.test(n) || /\bquesnoy\b/.test(n) || /le quesnoy/.test(n);
  if (
    boutique &&
    /(stock|il reste|combien|disponible|en rayon|rupture)/.test(n)
  ) {
    return "STOCK";
  }
  if (
    /(quel stock|stock rest|combien (il )?reste|est[- ]ce disponible|disponible (a|au|en))/.test(
      n,
    ) &&
    !/horaire|adresse|ouvert/.test(n)
  ) {
    return "STOCK";
  }

  if (
    /recherche sur internet|cherche sur internet|meteo|météo|quel temps|actualit|dernier modele|dernier modèle/.test(
      n,
    )
  ) {
    return "WEB";
  }

  const clockAsk =
    /quel jour|quelle date|quelle heure|l heure qu|on est quel|c est quel jour|on est le combien|c est le combien|c est (un )?jour ferie|c est ferie|aujourd hui (on est|c est quel)/.test(
      n,
    );
  const openClosedAsk = /ouvert|ferme|horaire|adresse|boutique/.test(n);
  if (clockAsk && !openClosedAsk) {
    return "CLOCK";
  }

  const definition = /c est quoi|explique|pourquoi /.test(n);
  const shopPlace =
    /horaire|adresse|boutique|hautmont|quesnoy|all\s*vap|ouvert|ferme|ou vous etes|vous etes ou|ou etes vous/.test(
      n,
    );
  const shopAsk =
    /ou |adresse|horaire|ouvert|ferme|trouver|vous etes|c est ouvert|ou vous/.test(n);
  if (!definition && shopPlace && shopAsk) {
    return "BUSINESS";
  }

  const seeking =
    /cherche|trouve|tu as|t as|vous avez|avez vous|il me faut|je veux|s il te plait|catalogue|stock|disponible|en rayon|il reste|rupture|recherche ce produit sur/.test(
      n,
    );
  const catalogItem =
    /eliquide|e-liquide|e liquide|puff|pod|vape|stock|disponible|catalogue|liquide |fraise|fruits? rouges?|fruite|fruité|cassis|framboise|menthe/.test(
      n,
    );
  if (!definition && seeking && catalogItem) {
    return "PRODUCT_SEARCH";
  }
  if (
    !definition &&
    catalogItem &&
    (/^un |^une |^des |^du |s il te plait/.test(n) ||
      /tu as quoi en |trouve[- ]moi |cherche[- ]moi /.test(n))
  ) {
    return "PRODUCT_SEARCH";
  }
  if (!definition && /recherche .{0,80}sur (le site |all\s*vap)/.test(n)) {
    return "PRODUCT_SEARCH";
  }

  if (
    /\b(pg\/vg|pg vg|propylene|glycerine|glycerine vegetale|mtl|rdl|\bdl\b|tirage (serre|direct)|resistances?|amorc|fuites?|gout brule|accus?|batteries?|sevrage|tpd|hon lik|clearomiseur|coil|sub-?ohm)\b/.test(
      n,
    ) ||
    (/\b(pg|vg)\b/.test(n) && /(c est quoi|explique|irrit|allergie|ratio)/.test(n))
  ) {
    return "VAPE_KNOWLEDGE";
  }

  return "GENERAL";
}

/** Alias historique pour runAvaBrain / tests existants. */
export function classifyAvaNeed(raw: string): AvaNeed {
  const kind = classifyAvaIntent(raw);
  if (kind === "PRODUCT_SEARCH") return "PRODUCT";
  if (kind === "INTERNAL_OPS") return "ADMIN_OPS";
  if (kind === "SYSTEM_STATUS") return "SYSTEM_HEALTH";
  return kind;
}

export function needsServerBusinessTool(kind: AvaIntentKind): boolean {
  return (
    kind === "STOCK" ||
    kind === "ORDER" ||
    kind === "EMAIL" ||
    kind === "SHIPPING" ||
    kind === "SYSTEM_HEALTH" ||
    kind === "SYSTEM_STATUS" ||
    kind === "INTERNAL_OPS" ||
    kind === "CLIENT_FILE" ||
    kind === "VAPE_KNOWLEDGE" ||
    kind === "SITE"
  );
}
