import { simulateDecision } from "@/lib/ava/business-intelligence/simulate";
import type { ActiveThread, SocialComposeInput, SocialStance } from "./types";

function pick<T>(arr: T[], salt: string): T {
  let h = 0;
  for (let i = 0; i < salt.length; i++) h = (h + salt.charCodeAt(i) * (i + 1)) % 997;
  return arr[h % arr.length];
}

/** Avis argumenté à partir d'un sujet + signaux outils. */
export function buildStance(params: {
  subject: string | null;
  workSignal: string | null;
  userProposal?: string | null;
}): SocialStance {
  const subject = params.subject || "le sujet qu'on a là";
  const signal = (params.workSignal || "").toLowerCase();
  const proposal = (params.userProposal || "").toLowerCase();

  const stockTight =
    /rupture|stock faible|stocks faibles|stock tendu|n[eé]gatif/i.test(signal) ||
    /rupture|stock faible/i.test(proposal);
  const salesDown = /baisse|ralenti|ralent|chute|drop/i.test(signal + " " + subject);
  const wantsDeepCut =
    /-\s*3[0-9]\s*%|-\s*[4-9]\d\s*%|brade|grosse promo/.test(proposal) ||
    /-\s*3[0-9]\s*%|-\s*[4-9]\d\s*%|brade|grosse promo|faisons\s+\d+\s*%/.test(subject);

  if (wantsDeepCut || (/promo|remise|prix/i.test(proposal + " " + subject) && (stockTight || salesDown))) {
    const sim = simulateDecision({
      proposal: params.userProposal || "promo",
      stockTight,
      visibilityIssueSuspected: salesDown,
      conversionOk: !stockTight,
    });
    return {
      subject,
      position: sim.opinion,
      reason: stockTight
        ? "Le stock est déjà tendu : une promo forte risque surtout la rupture."
        : "Je préfère tester la visibilité avant de toucher au tarif.",
      askBack: "Tu veux qu'on parte sur une mise en avant courte, ou tu tiens vraiment au prix ?",
    };
  }

  if (stockTight) {
    return {
      subject,
      position: "Je regarderais le stock avant toute animation commerciale.",
      reason: "Il y a déjà des signaux de tension / rupture.",
      askBack: "On commence par Hautmont, ou tu as une référence précise en tête ?",
    };
  }

  if (salesDown) {
    return {
      subject,
      position: "Je ne commencerais pas par une baisse de prix.",
      reason: "Quand ça ralentit, je teste d'abord une mise en avant — moins risqué pour la marge.",
      askBack: "Tu en penses quoi, on tente 7 jours de visibilité ?",
    };
  }

  if (params.workSignal) {
    const snip = params.workSignal.split(/[.!?]/).filter(Boolean)[0]?.trim() || params.workSignal;
    return {
      subject,
      position: `Sur ${subject}, mon avis : on avance prudemment.`,
      reason: snip.slice(0, 160),
      askBack: "Tu veux que je creuse, ou on laisse comme ça pour l'instant ?",
    };
  }

  return {
    subject,
    position: "J'ai un avis, mais il me manque encore un détail.",
    reason: "Je ne veux pas inventer hors des données.",
    askBack: resolvedAsk(subject),
  };
}

function resolvedAsk(subject: string): string {
  return `C'est bien à propos de « ${subject} » que tu me demandes mon avis ?`;
}

/**
 * Compose une réponse collègue à partir du contexte — pas un menu, pas un template vide.
 */
export function composeSocialReply(input: SocialComposeInput): string {
  const name = input.ownerFirstName;
  const msg = input.message;
  const signal = reliableWorkSignal(input.workSignal);
  const thread = input.activeThread;

  switch (input.move) {
    case "identity":
      return "Non — je ne suis pas une personne physique. Je suis A.V.A., collaboratrice numérique All Vap's. Je bosse comme une collègue, mais je reste une IA métier.";

    case "greeting": {
      if (thread?.status === "deferred") {
        return pick(
          [
            `${greet(name, msg)}. Hier on avait laissé « ${thread.subject} » de côté — on reprend quand tu veux.`,
            `${greet(name, msg)}. On avait une pause sur « ${thread.subject} ». Tu me dis si on y retourne.`,
          ],
          msg + (thread.subject || "")
        );
      }
      const hello = pick(
        [
          name ? `Coucou ${name}. Ça va ?` : "Coucou. Ça va ?",
          name ? `Salut ${name}. Tu vas bien ?` : "Salut. Tu vas bien ?",
          name ? `Hey ${name}. Ça va de ton côté ?` : "Hey. Ça va de ton côté ?",
          name ? `Salut ${name}.` : "Salut.",
        ],
        msg + (name || "")
      );
      // Rebond métier optionnel UNIQUEMENT si signal fiable déjà en main
      if (signal) {
        return `${hello} ${softWorkHook(signal)}`;
      }
      return hello;
    }

    case "check_in": {
      return pick(
        [
          "Ça va. Et de ton côté ?",
          "Oui, ça va. Tu as un truc en tête ou on discute juste ?",
          "Ça va. Plutôt calme pour l'instant — et toi ?",
          name ? `Ça va ${name}. Tu vas bien ?` : "Ça va. Tu vas bien ?",
        ],
        msg + (thread?.subject || "")
      );
    }

    case "smalltalk": {
      const n = msg.toLowerCase();
      const mem = (input.memoryHint || "").trim();
      const threadBit =
        thread?.subject && thread.subject !== "discussion"
          ? ` On avait « ${thread.subject} » en fil si tu veux y revenir.`
          : "";
      if (/crev|fatigu|dormi/.test(n)) {
        return pick(
          [
            `Je vois${name ? ` ${name}` : ""}. On peut rester léger — ou tu as un point précis ?`,
            "OK. On discute sans basculer sur les chiffres, sauf si tu en as besoin.",
          ],
          msg + (thread?.subject || "")
        );
      }
      if (/quoi de neuf|quoi de beau/.test(n)) {
        if (mem && /sujet=|FIL ACTIF|FAITS MÉMORISÉS/i.test(mem)) {
          const hint = mem.match(/Dernier sujet\s*:\s*([^\n]+)/i)?.[1]?.trim();
          if (hint && hint !== "discussion") {
            return `Rien d'urgent sous les yeux. Le dernier fil qu'on avait, c'était « ${hint.slice(0, 60)} » — on y retourne ou autre chose ?`;
          }
        }
        return pick(
          [
            "Pas grand-chose de brûlant pour l'instant. Toi, tu as un truc en tête ?",
            "Rien d'urgent de mon côté. Tu voulais parler de quelque chose ?",
          ],
          msg + (thread?.updatedAt || "")
        );
      }
      if (/on parle|on discute/.test(n)) {
        return `OK, on discute.${threadBit} Qu'est-ce qui te passe par la tête ?`;
      }
      if (/site|tour/.test(n) && !/stock|vente|commande/.test(n)) {
        return pick(
          [
            "OK. Tu regardes quelque chose de précis sur le site, ou c'est une passe générale ?",
            "Je vois. Tu cherches une fiche / une gamme, ou tu fais juste un tour ?",
          ],
          msg
        );
      }
      // Rebond concret sur le message user — jamais « Je te suis » / « Dis-moi ce qui te préoccupe »
      const snippet = msg.replace(/\s+/g, " ").trim().slice(0, 90);
      if (snippet.length > 8) {
        return pick(
          [
            `Sur « ${snippet} » : je suis là. Tu veux qu'on creuse ça, ou c'est juste une remarque ?`,
            `OK pour « ${snippet} ». Tu précises un peu, ou on reste là-dessus ?`,
            `${name ? name + ", " : ""}j'ai bien lu. Tu veux mon avis là-dessus, ou on enchaîne sur autre chose ?`,
          ],
          msg + String(thread?.updatedAt || "") + snippet.slice(0, 12)
        );
      }
      return pick(
        [
          `OK${name ? ` ${name}` : ""}.${threadBit} Tu me dis ce que tu as en tête.`,
          `Je suis là.${threadBit} Dis-moi juste sur quoi tu veux qu'on avance.`,
        ],
        msg + (thread?.subject || "x") + String((thread?.updatedAt || msg).length % 7)
      );
    }

    case "leave_work": {
      return pick(
        [
          "Parfait. On laisse ça comme ça.",
          "OK, on range ce point. Dis-moi si tu as autre chose — ou si on discute juste.",
          "Noté. On sort du sujet métier. Ça va de ton côté ?",
        ],
        msg
      );
    }

    case "ask_opinion": {
      if (!input.resolvedSubject && !input.stance) {
        return "Sur quoi exactement ? Si c'est le dernier point qu'on avait, dis-moi juste « oui » et je te donne mon avis.";
      }
      const st =
        input.stance ||
        buildStance({
          subject: input.resolvedSubject,
          workSignal: input.workSignal,
        });
      return [st.position, st.reason, st.askBack || "Tu en penses quoi ?"].filter(Boolean).join(" ");
    }

    case "disagree_prompt": {
      const st =
        input.stance ||
        buildStance({
          subject: input.resolvedSubject,
          workSignal: input.workSignal,
          userProposal: input.message,
        });
      return [
        pick(
          [
            "Je ne partirais pas là-dessus tout de suite.",
            "Honnêtement, je ne suis pas d'accord pour commencer comme ça.",
            "Moi je freinerais.",
          ],
          input.message
        ),
        st.reason,
        st.position,
        st.askBack,
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "defer": {
      const sub = input.resolvedSubject || thread?.subject || "ce point";
      return pick(
        [
          `OK — on garde « ${sub} » pour demain. Je te le ressortirai quand tu diras qu'on reprend.`,
          `Noté. « ${sub} » est en pause jusqu'à demain. Dis juste « on reprend » et je remets le fil.`,
        ],
        sub
      );
    }

    case "resume": {
      const sub = input.resolvedSubject || thread?.subject;
      if (!sub) {
        return "Je ne retrouve pas clairement le fil. C'était plutôt stock, ventes, ou la promo dont on parlait ?";
      }
      const summary = thread?.summary ? ` ${thread.summary.slice(0, 140).replace(/\s+/g, " ")}` : "";
      const isPromoThread = /%|promo|banni|mise en avant|prix|remise/i.test(sub + summary);
      if (isPromoThread && input.stance) {
        return `On reprend « ${sub} ». ${input.stance.position} ${input.stance.askBack || "On avance là-dessus ?"}`;
      }
      if (isPromoThread) {
        return `On reprend « ${sub} ».${summary} Tu veux qu'on avance sur mon idée (visibilité d'abord), ou tu as une autre piste ?`;
      }
      if (signal) {
        return `On reprend « ${sub} ». ${leadWithWork(signal)} Tu veux qu'on avance, ou tu as une autre piste ?`;
      }
      return `On reprend « ${sub} ».${summary} Tu me dis où on en était pour toi, et je complète.`;
    }

    case "thanks":
      return pick(["OK.", "Vas-y.", "À tout à l'heure."], input.message);

    case "light_ack": {
      if (signal) return leadWithWork(signal) + " " + pick(["Tu suis ?", "Je continue ?", ""], signal);
      if (thread?.summary) {
        return `Sur « ${thread.subject} » : ${thread.summary.slice(0, 180).replace(/\s+/g, " ")} — tu veux que je précise, ou on change d'angle ?`;
      }
      return "OK — je continue sur le dernier point.";
    }

    default:
      return signal || "OK, je regarde.";
  }
}

function greet(name: string | null, salt: string): string {
  if (name) return pick([`Salut ${name}`, `Hey ${name}`, `Coucou ${name}`], salt);
  return pick(["Salut", "Hey", "Coucou"], salt);
}

/** N'accepte un signal métier que s'il est propre (pas d'erreur technique). */
function reliableWorkSignal(raw: string | null): string | null {
  if (!raw) return null;
  if (
    /indisponible|pas pu v[eé]rifier|donn[eé]es m[eé]tier|prisma|timeout|erreur|invocation|~~~~~~~/i.test(
      raw
    )
  ) {
    return null;
  }
  return cleanSignal(raw);
}

function softWorkHook(signal: string): string {
  const snip = signal.split(/[.!?]/).filter(Boolean)[0]?.trim() || signal;
  const short = snip.slice(0, 120);
  return pick(
    [
      `Au fait, j'ai remarqué un truc intéressant — ${short}. Je t'en parle quand tu veux.`,
      `Quand tu veux, j'ai un point sur : ${short}.`,
    ],
    short
  );
}

function cleanSignal(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  // Evite les dumps listés
  if ((t.match(/·/g) || []).length > 4) t = t.split("·").slice(0, 2).join(".").trim();
  if (t.length > 320) t = t.slice(0, 300).replace(/\s+\S*$/, "") + ".";
  return t;
}

function leadWithWork(signal: string): string {
  const s = signal
    .replace(/(Avant autre chose\s*:\s*)+/gi, "Avant autre chose : ")
    .replace(/(\bUrgent\s*:\s*)+/gi, "Urgent : ")
    .trim();
  // Déduplique phrases identiques collées
  const chunks = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  const uniq: string[] = [];
  for (const c of chunks) {
    const key = c.trim().toLowerCase();
    if (!uniq.some((u) => u.toLowerCase() === key || u.toLowerCase().includes(key.slice(0, 40)))) {
      uniq.push(c.trim());
    }
  }
  const cleaned = uniq.join(" ").trim() || s;
  if (/^(salut|bonjour|hey)/i.test(cleaned)) return cleaned;
  if (/^(j['’]ai|au fait|urgent|à surveiller|avant autre chose)/i.test(cleaned)) return cleaned;
  return pick(
    [`Au fait : ${cleaned}`, `J'ai remarqué un truc : ${cleaned}`, `Petit point : ${cleaned}`],
    cleaned
  );
}

export function nextThreadAfterTurn(params: {
  move: string;
  previous: ActiveThread | null;
  subject: string | null;
  assistantText: string;
  userMessage: string;
}): ActiveThread | null {
  const now = new Date().toISOString();
  const subject =
    params.subject ||
    params.previous?.subject ||
    inferSubjectFromText(params.assistantText) ||
    inferSubjectFromText(params.userMessage);

  if (params.move === "defer" && subject) {
    return {
      subject,
      summary: params.previous?.summary || params.assistantText.slice(0, 200),
      status: "deferred",
      deferredNote: "reporté à demain",
      updatedAt: now,
    };
  }

  if (params.move === "resume" && subject) {
    return {
      subject,
      summary: params.assistantText.slice(0, 220),
      status: "open",
      updatedAt: now,
    };
  }

  if (params.move === "thanks" || params.move === "identity" || params.move === "greeting") {
    return {
      subject: params.previous?.subject || "discussion",
      summary: params.previous?.summary || params.assistantText.slice(0, 220),
      status: params.previous?.status === "deferred" ? "deferred" : "open",
      deferredNote: params.previous?.deferredNote,
      register: params.previous?.register || "social",
      updatedAt: now,
    };
  }

  if (params.move === "check_in" || params.move === "smalltalk" || params.move === "leave_work") {
    return {
      subject: params.previous?.subject || "discussion",
      summary: params.previous?.summary || params.assistantText.slice(0, 220),
      status: params.previous?.status === "deferred" ? "deferred" : "open",
      deferredNote: params.previous?.deferredNote,
      register: params.previous?.register || "social",
      updatedAt: now,
    };
  }

  if (subject && params.assistantText.length > 40) {
    return {
      subject,
      summary: params.assistantText.slice(0, 220),
      status: "open",
      register: "business",
      lastQuestion: /\?/.test(params.assistantText)
        ? params.assistantText.split("?").slice(-2)[0]?.slice(-80) + "?"
        : params.previous?.lastQuestion,
      updatedAt: now,
    };
  }

  return params.previous;
}

function inferSubjectFromText(text: string): string | null {
  if (/ventes?\s*\/\s*insatisf|possible frein/i.test(text)) return "ruptures stock";
  if (/banni[eè]re/i.test(text) && /twenty/i.test(text)) return "bannière Twenty";
  if (/teste?r?\s+une\s+banni[eè]re/i.test(text)) return "bannière Twenty";
  const m = text.match(
    /(?:gamme|stock|ruptures?|promo|prix|hautmont|quesnoy|commande|anomal\w*|banni[eè]re|mise en avant|twenty)[^.!?\n]{0,50}/i
  );
  return m?.[0]?.trim().slice(0, 80) || null;
}
