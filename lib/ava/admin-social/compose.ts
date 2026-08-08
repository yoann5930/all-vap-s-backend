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
  const wantsDeepCut = /-\s*3[0-9]\s*%|-\s*[4-9]\d\s*%|brade|grosse promo/.test(proposal);

  if (wantsDeepCut || (/promo|remise|prix/i.test(proposal) && (stockTight || salesDown))) {
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
  const hi = name ? pick([`Salut ${name}`, `Salut ${name}`, `Hey ${name}`], input.message) : pick(["Salut", "Hey"], input.message);
  const signal = cleanSignal(input.workSignal);
  const thread = input.activeThread;

  switch (input.move) {
    case "identity":
      return "Non — je ne suis pas une personne physique. Je suis A.V.A., collaboratrice numérique All Vap's. Je bosse comme une collègue, mais je reste une IA métier.";

    case "greeting": {
      if (thread?.status === "deferred") {
        return `${hi}. Hier on avait laissé de côté « ${thread.subject} ». Tu veux qu'on reprenne, ou je te dis d'abord ce que j'ai vu ce matin ?`;
      }
      if (signal) {
        return `${hi}, ${leadWithWork(signal)} ${pick(
          ["Tu en penses quoi ?", "On regarde ça ensemble ?", "Tu veux que je creuse ?"],
          signal
        )}`;
      }
      return `${hi}. Je suis en train de balayer les chiffres — je te dis tout de suite s'il y a un truc qui cloche.`;
    }

    case "check_in": {
      if (signal) {
        return `Ça va. ${leadWithWork(signal)} ${pick(
          ["Rien d'autre de brûlant pour l'instant.", "Sinon ça tourne.", ""],
          signal
        )}`.trim();
      }
      if (thread?.status === "open") {
        return `Ça va. J'avais encore « ${thread.subject} » en tête — ${thread.summary.slice(0, 120)} Tu veux qu'on avance là-dessus ?`;
      }
      return pick(
        [
          "Ça va. J'ai surtout scruté les mouvements du jour — rien de critique sous les yeux pour l'instant.",
          "Oui, ça va. Dis-moi si tu as un truc en tête, sinon je te sors le point le plus utile.",
        ],
        input.message + (thread?.subject || "")
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
      return [
        st.position,
        st.reason,
        st.askBack || "Tu en penses quoi ?",
      ]
        .filter(Boolean)
        .join(" ");
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
          ["Je ne partirais pas là-dessus tout de suite.", "Honnêtement, je ne suis pas d'accord pour commencer comme ça.", "Moi je freinerais."],
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
      const summary = thread?.summary ? ` ${thread.summary.slice(0, 160)}` : "";
      if (signal) {
        return `On reprend « ${sub} ».${summary} ${leadWithWork(signal)} Tu veux qu'on avance sur mon idée, ou tu as une autre piste ?`;
      }
      return `On reprend « ${sub} ».${summary} Tu me dis où on en était pour toi, et je complète.`;
    }

    case "thanks":
      return pick(["OK.", "Vas-y.", "À tout à l'heure."], input.message);

    case "light_ack": {
      if (signal) return leadWithWork(signal) + " " + pick(["Tu suis ?", "Je continue ?", ""], signal);
      if (thread?.summary) return `${thread.summary.slice(0, 200)} Je continue ?`;
      return "OK — je continue sur le dernier point.";
    }

    default:
      return signal || "OK, je regarde.";
  }
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
  const s = signal.trim();
  if (/^(salut|bonjour|hey)/i.test(s)) return s;
  if (/^(j['’]ai|au fait|urgent|à surveiller)/i.test(s)) return s;
  return pick(
    [`Au fait : ${s}`, `J'ai remarqué un truc : ${s}`, `Petit point : ${s}`],
    s
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

  if (params.move === "thanks" || params.move === "identity") {
    return params.previous;
  }

  if (subject && params.assistantText.length > 40) {
    return {
      subject,
      summary: params.assistantText.slice(0, 220),
      status: "open",
      lastQuestion: /\?/.test(params.assistantText)
        ? params.assistantText.split("?").slice(-2)[0]?.slice(-80) + "?"
        : params.previous?.lastQuestion,
      updatedAt: now,
    };
  }

  return params.previous;
}

function inferSubjectFromText(text: string): string | null {
  const m = text.match(
    /(?:gamme|stock|ventes?|promo|prix|hautmont|quesnoy|commande|anomal\w*)[^.!?\n]{0,50}/i
  );
  return m?.[0]?.trim().slice(0, 80) || null;
}
