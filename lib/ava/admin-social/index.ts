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
  composeSocialReply,
  buildStance,
  nextThreadAfterTurn,
} from "./compose";
