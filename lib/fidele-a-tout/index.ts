export {
  getFideleAToutConfig,
  getFideleAToutPublicStatus,
  mayAwardLocalLoyaltyPoints,
  type FideleAToutConfig,
  type FideleAToutSyncStatus,
} from "./config";

export {
  FideleAToutNotConfiguredError,
  lookupMemberByPhone,
  lookupMemberByScan,
  syncMemberPoints,
  linkMemberToUser,
  type FideleMemberLookup,
  type FideleSyncResult,
} from "./client";
