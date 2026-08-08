export type {
  SocialMove,
  ActiveThread,
  SocialStance,
  SocialDetection,
  SocialComposeInput,
} from "./types";

export { detectSocialMove, firstNameFromEmail, isSocialMove } from "./detect";
export {
  composeSocialReply,
  buildStance,
  nextThreadAfterTurn,
} from "./compose";
