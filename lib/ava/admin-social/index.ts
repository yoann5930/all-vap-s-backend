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
} from "./detect";

export {
  composeSocialReply,
  buildStance,
  nextThreadAfterTurn,
} from "./compose";
