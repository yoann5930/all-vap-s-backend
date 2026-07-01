import type { DemoStore } from "./seed-data";
import { getModelArray, type ModelName } from "./store";

type RecordLike = Record<string, unknown>;
type Where = RecordLike;
type OrderBy = RecordLike | RecordLike[];

function str(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

function matchScalar(value: unknown, filter: unknown): boolean {
  if (filter === undefined) return true;
  if (filter === null) return value === null;
  if (typeof filter !== "object") return value === filter;

  const f = filter as RecordLike;
  if ("equals" in f) {
    const eq = f.equals;
    if (f.mode === "insensitive" && typeof eq === "string" && typeof value === "string") {
      return value.toLowerCase() === eq.toLowerCase();
    }
    return value === eq;
  }
  if ("contains" in f && typeof f.contains === "string") {
    const hay = str(value);
    const needle = f.mode === "insensitive" ? f.contains.toLowerCase() : f.contains;
    return hay.includes(needle);
  }
  if ("in" in f && Array.isArray(f.in)) return f.in.includes(value);
  if ("gt" in f && typeof value === "number") return value > (f.gt as number);
  if ("gte" in f && typeof value === "number") return value >= (f.gte as number);
  if ("lt" in f && typeof value === "number") return value < (f.lt as number);
  if ("lte" in f && typeof value === "number") return value <= (f.lte as number);
  if ("not" in f) return !matchScalar(value, f.not);
  return value === filter;
}

function resolveRelation(store: DemoStore, record: RecordLike, relation: string): RecordLike | null {
  if (relation === "categoryRef" && record.categoryId) {
    return store.categories.find((c) => c.id === record.categoryId) || null;
  }
  if (relation === "brandRef" && record.brandId) {
    return store.brands.find((b) => b.id === record.brandId) || null;
  }
  if (relation === "product" && record.productId) {
    return store.products.find((p) => p.id === record.productId) || null;
  }
  if (relation === "user" && record.userId) {
    return store.users.find((u) => u.id === record.userId) || null;
  }
  if (relation === "items" && record.id) {
    return store.orderItems.filter((i) => i.orderId === record.id) as unknown as RecordLike;
  }
  return null;
}

function matchField(store: DemoStore, record: RecordLike, key: string, condition: unknown): boolean {
  if (key === "OR" || key === "AND" || key === "NOT") return true;

  if (key.endsWith("Ref") || key === "product" || key === "user" || key === "items") {
    const rel = resolveRelation(store, record, key);
    if (Array.isArray(rel)) return false;
    if (!rel && condition) return false;
    if (!rel) return true;
    if (typeof condition === "object" && condition !== null) {
      return matchWhere(store, rel, condition as Where);
    }
    return rel === condition;
  }

  return matchScalar(record[key], condition);
}

export function matchWhere(store: DemoStore, record: RecordLike, where?: Where): boolean {
  if (!where || Object.keys(where).length === 0) return true;

  if (Array.isArray(where.OR)) {
    return where.OR.some((w) => matchWhere(store, record, w as Where));
  }
  if (Array.isArray(where.AND)) {
    return where.AND.every((w) => matchWhere(store, record, w as Where));
  }
  if (where.NOT) {
    return !matchWhere(store, record, where.NOT as Where);
  }

  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR" || key === "AND" || key === "NOT") return true;
    return matchField(store, record, key, condition);
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return Number(a) - Number(b);
}

export function sortRecords(records: RecordLike[], orderBy?: OrderBy): RecordLike[] {
  if (!orderBy) return records;
  const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...records].sort((a, b) => {
    for (const rule of rules) {
      for (const [field, dir] of Object.entries(rule)) {
        const cmp = compareValues(a[field], b[field]);
        if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });
}

function applySelect(record: RecordLike, select?: RecordLike): RecordLike {
  if (!select) return { ...record };
  const out: RecordLike = {};
  for (const [key, val] of Object.entries(select)) {
    if (val === true) out[key] = record[key];
    else if (typeof val === "object" && val !== null && "_count" in val) {
      // handled separately
    } else if (typeof val === "object" && val !== null && "select" in val) {
      const nested = record[key];
      if (nested && typeof nested === "object") {
        out[key] = applySelect(nested as RecordLike, val.select as RecordLike);
      }
    }
  }
  return out;
}

export function applyInclude(store: DemoStore, model: ModelName, record: RecordLike, include?: RecordLike): RecordLike {
  const out = { ...record };
  if (!include) return out;

  if (include.categoryRef) {
    out.categoryRef = store.categories.find((c) => c.id === record.categoryId) || null;
  }
  if (include.brandRef) {
    out.brandRef = store.brands.find((b) => b.id === record.brandId) || null;
  }
  if (include.product) {
    out.product = store.products.find((p) => p.id === record.productId) || null;
  }
  if (include.user) {
    const user = store.users.find((u) => u.id === record.userId);
    if (user) {
      out.user = include.user && typeof include.user === "object" && "select" in include.user
        ? applySelect(user, include.user.select as RecordLike)
        : user;
    }
  }
  if (include.items) {
    const items = store.orderItems.filter((i) => i.orderId === record.id);
    if (include.items && typeof include.items === "object" && "include" in include.items) {
      const itemInclude = (include.items as RecordLike).include as RecordLike;
      out.items = items.map((item) => applyInclude(store, "orderItem", item, itemInclude));
    } else {
      out.items = items;
    }
  }
  if (include.reviews) {
    let reviews = store.reviews.filter((r) => r.productId === record.id);
    if (include.reviews && typeof include.reviews === "object") {
      const revInc = include.reviews as RecordLike;
      if (revInc.where) reviews = reviews.filter((r) => matchWhere(store, r, revInc.where as Where));
      if (revInc.orderBy) reviews = sortRecords(reviews, revInc.orderBy as OrderBy);
      if (typeof revInc.take === "number") reviews = reviews.slice(0, revInc.take);
      if (revInc.include) {
        reviews = reviews.map((r) => applyInclude(store, "review", r, revInc.include as RecordLike));
      }
    }
    out.reviews = reviews;
  }
  if (include._count) {
    const counts = (include._count as RecordLike).select as RecordLike;
    const countObj: RecordLike = {};
    if (counts.products) {
      if (model === "category") {
        countObj.products = store.products.filter((p) => p.categoryId === record.id).length;
      } else if (model === "brand") {
        countObj.products = store.products.filter((p) => p.brandId === record.id).length;
      }
    }
    if (counts.orders) {
      countObj.orders = store.orders.filter((o) => o.userId === record.id).length;
    }
    out._count = countObj;
  }

  return out;
}

export function findUniqueWhere(store: DemoStore, model: ModelName, where: Where): RecordLike | null {
  const records = getModelArray(store, model);

  if (where.id) return records.find((r) => r.id === where.id) || null;
  if (where.email) return records.find((r) => r.email === where.email) || null;
  if (where.slug) return records.find((r) => r.slug === where.slug) || null;
  if (where.code) return records.find((r) => r.code === where.code) || null;
  if (where.token) return records.find((r) => r.token === where.token) || null;
  if (where.sumupCheckoutId) return records.find((r) => r.sumupCheckoutId === where.sumupCheckoutId) || null;
  if (where.vivaOrderCode) return records.find((r) => r.vivaOrderCode === where.vivaOrderCode) || null;
  if (where.userId) return records.find((r) => r.userId === where.userId) || null;
  if (where.userId_productId) {
    const { userId, productId } = where.userId_productId as RecordLike;
    return records.find((r) => r.userId === userId && r.productId === productId) || null;
  }
  if (where.productId_userId) {
    const { productId, userId } = where.productId_userId as RecordLike;
    return records.find((r) => r.productId === productId && r.userId === userId) || null;
  }

  return records.find((r) => matchWhere(store, r, where)) || null;
}

export function queryMany(
  store: DemoStore,
  model: ModelName,
  args: {
    where?: Where;
    orderBy?: OrderBy;
    skip?: number;
    take?: number;
    include?: RecordLike;
    select?: RecordLike;
  } = {}
): RecordLike[] {
  let records = getModelArray(store, model).filter((r) => matchWhere(store, r, args.where));
  records = sortRecords(records, args.orderBy);
  if (args.skip) records = records.slice(args.skip);
  if (args.take !== undefined) records = records.slice(0, args.take);

  return records.map((r) => {
    let item = applyInclude(store, model, r, args.include);
    if (args.select) item = applySelect(item, args.select);
    return item;
  });
}

export function aggregateRecords(
  store: DemoStore,
  model: ModelName,
  args: { where?: Where; _sum?: RecordLike; _avg?: RecordLike; _count?: boolean | RecordLike }
): RecordLike {
  const records = getModelArray(store, model).filter((r) => matchWhere(store, r, args.where));
  const result: RecordLike = {};

  if (args._sum) {
    const sumObj: RecordLike = {};
    for (const field of Object.keys(args._sum)) {
      sumObj[field] = records.reduce((s, r) => s + Number(r[field] || 0), 0);
    }
    result._sum = sumObj;
  }
  if (args._avg) {
    const avgObj: RecordLike = {};
    for (const field of Object.keys(args._avg)) {
      const vals = records.map((r) => Number(r[field])).filter((n) => !isNaN(n));
      avgObj[field] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    result._avg = avgObj;
  }
  if (args._count !== undefined) {
    result._count = records.length;
  }

  return result;
}

export function applyUpdateData(record: RecordLike, data: RecordLike): RecordLike {
  const updated: RecordLike = { ...record, updatedAt: new Date() };
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === "object" && "increment" in val) {
      updated[key] = Number(record[key] || 0) + Number(val.increment);
    } else if (val && typeof val === "object" && "decrement" in val) {
      updated[key] = Math.max(0, Number(record[key] || 0) - Number(val.decrement));
    } else {
      updated[key] = val;
    }
  }
  return updated;
}

export function slugifySimple(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
