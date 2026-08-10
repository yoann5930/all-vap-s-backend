export type {
  SocialMove,
  SocialIntentClass,
  ActiveThread,
  SocialStance,
  SocialDetection,
  SocialComposeInput,
} from "./types";

export {
  detectSocialMove,
  firstNameFromEmail,
  isSocialMove,
  isPureSocialMove,
  shouldPreferLocalCompose,
} from "./detect";

export {
  isExplicitReplyInstruction,
  parseExplicitReplyInstruction,
} from "./explicit-reply";

export {
  composeSocialReply,
  buildStance,
  nextThreadAfterTurn,
} from "./compose";
