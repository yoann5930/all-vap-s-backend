/**
 * Source de vérité santé AVA — dashboard live + check-up vocal.
 * Aucun secret. Scores uniquement justifiés par des preuves.
 */
export type AvaHealthStatus =
  | "OK"
  | "PARTIAL"
  | "DEGRADED"
  | "FAILED"
  | "NOT_CONFIGURED"
  | "NOT_TESTED"
  | "IN_PROGRESS"
  | "TESTING"
  | "PENDING"
  | "DONE"
  | "BLOCKED"
  | "RESOLVED";

export type AvaHealthModuleId =
  | "core"
  | "voice"
  | "memory"
  | "android"
  | "server"
  | "site"
  | "database"
  | "stocks"
  | "orders"
  | "fidelatoo"
  | "email"
  | "shipping"
  | "catalog"
  | "nicotine"
  | "vape"
  | "security"
  | "monitoring"
  | "logs"
  | "autodiag"
  | "tests"
  | "git";

export type AvaHealthCheck = {
  id: string;
  label: string;
  status: AvaHealthStatus;
  score: number;
  evidence: string;
  testedAt?: string | null;
};

export type AvaHealthModule = {
  id: AvaHealthModuleId;
  label: string;
  score: number;
  status: AvaHealthStatus;
  checks: AvaHealthCheck[];
};

export type AvaHealthSnapshot = {
  timestamp: string;
  score: number;
  scoreInitial: number;
  scoreTarget: number;
  scoreSource: string;
  validatedFunctions: number;
  totalFunctions: number;
  testsPassed: number;
  testsTotal: number;
  currentPhase: number;
  currentPhaseLabel: string;
  currentTask: string;
  environments: {
    local: AvaHealthStatus;
    git: AvaHealthStatus;
    production: AvaHealthStatus;
    androidDevice: AvaHealthStatus;
  };
  modules: AvaHealthModule[];
  phases: Array<{
    id: number;
    label: string;
    status: AvaHealthStatus;
  }>;
  functions: Array<{
    id: string;
    label: string;
    status: AvaHealthStatus;
    module: AvaHealthModuleId;
    evidence: string;
  }>;
  tests: Array<{
    id: string;
    label: string;
    passed: number;
    total: number;
    status: AvaHealthStatus;
  }>;
  activity: Array<{ at: string; text: string }>;
  files: Array<{
    path: string;
    change: string;
    phase: number;
    test: string;
    status: AvaHealthStatus;
  }>;
  anomalies: Array<{
    id: string;
    severity: "CRITICAL" | "MAJOR" | "MINOR";
    title: string;
    status: AvaHealthStatus;
    note: string;
  }>;
  blockers: Array<{
    id: string;
    reason: string;
    dependency: string;
    action: string;
  }>;
  lastCommit: { repo: string; hash: string; message: string } | null;
  paths: {
    site: string;
    android: string;
    api: string;
  };
};
