import { getDemoStore, getModelArray, nextId, now, type ModelName } from "./store";
import {
  aggregateRecords,
  applyInclude,
  applyUpdateData,
  findUniqueWhere,
  matchWhere,
  queryMany,
} from "./query";

type Args = Record<string, unknown>;
type RecordLike = Record<string, unknown>;

function notFound(): Error {
  return new Error("NOT_FOUND");
}

function createModelDelegate(model: ModelName) {
  return {
    findMany: (args: Args = {}) => queryMany(getDemoStore(), model, args as never),
    findFirst: (args: Args = {}) => {
      const results = queryMany(getDemoStore(), model, { ...(args as object), take: 1 } as never);
      return results[0] || null;
    },
    findUnique: (args: Args) => {
      const store = getDemoStore();
      const record = findUniqueWhere(store, model, args.where as RecordLike);
      if (!record) return null;
      return args.include
        ? applyInclude(store, model, record, args.include as RecordLike)
        : { ...record };
    },
    count: (args: Args = {}) => {
      const store = getDemoStore();
      return getModelArray(store, model).filter((r) => matchWhere(store, r, args.where as RecordLike)).length;
    },
    aggregate: (args: Args) => aggregateRecords(getDemoStore(), model, args as never),
    create: (args: Args) => {
      const store = getDemoStore();
      const data = { ...(args.data as RecordLike) };
      const id = (data.id as string) || nextId(model);
      const record: RecordLike = {
        ...data,
        id,
        createdAt: now(),
        updatedAt: now(),
      };

      if (model === "order" && data.items && typeof data.items === "object" && "create" in (data.items as RecordLike)) {
        const itemsCreate = (data.items as RecordLike).create as RecordLike[];
        delete record.items;
        getModelArray(store, model).push(record);
        for (const item of itemsCreate) {
          store.orderItems.push({ id: nextId("oi"), orderId: id, ...item });
        }
      } else {
        getModelArray(store, model).push(record);
      }

      return args.include
        ? applyInclude(store, model, record, args.include as RecordLike)
        : record;
    },
    update: (args: Args) => {
      const store = getDemoStore();
      const records = getModelArray(store, model);
      const idx = records.findIndex((r) => r.id === (args.where as RecordLike).id);
      if (idx === -1) throw notFound();
      records[idx] = applyUpdateData(records[idx], args.data as RecordLike);
      return records[idx];
    },
    updateMany: (args: Args) => {
      const store = getDemoStore();
      const records = getModelArray(store, model);
      let count = 0;
      for (let i = 0; i < records.length; i++) {
        if (matchWhere(store, records[i], args.where as RecordLike)) {
          records[i] = applyUpdateData(records[i], args.data as RecordLike);
          count++;
        }
      }
      return { count };
    },
    delete: (args: Args) => {
      const store = getDemoStore();
      const records = getModelArray(store, model);
      const where = args.where as RecordLike;
      let idx = -1;
      if (where.id) idx = records.findIndex((r) => r.id === where.id);
      else if (where.userId_productId) {
        const { userId, productId } = where.userId_productId as RecordLike;
        idx = records.findIndex((r) => r.userId === userId && r.productId === productId);
      }
      if (idx === -1) throw notFound();
      const [removed] = records.splice(idx, 1);
      return removed;
    },
    deleteMany: (args: Args) => {
      const store = getDemoStore();
      const records = getModelArray(store, model);
      const where = args.where as RecordLike;
      let count = 0;
      for (let i = records.length - 1; i >= 0; i--) {
        if (matchWhere(store, records[i], where)) {
          records.splice(i, 1);
          count++;
        }
      }
      return { count };
    },
    upsert: (args: Args) => {
      const store = getDemoStore();
      const where = args.where as RecordLike;
      const existing = findUniqueWhere(store, model, where);
      if (existing) {
        const records = getModelArray(store, model);
        const idx = records.findIndex((r) => r.id === existing.id);
        records[idx] = applyUpdateData(records[idx], args.update as RecordLike);
        return records[idx];
      }
      const createData = { ...(args.create as RecordLike) };
      if (where.slug && !createData.slug) createData.slug = where.slug;
      if (where.email && !createData.email) createData.email = where.email;
      if (where.productId_userId) Object.assign(createData, where.productId_userId);
      if (where.userId_productId) Object.assign(createData, where.userId_productId);
      return createModelDelegate(model).create({ data: createData });
    },
  };
}

export function createDemoPrismaClient() {
  return {
    $queryRaw: async () => [{ ok: 1 }],
    $transaction: async (ops: unknown[]) => {
      const results = [];
      for (const op of ops) {
        results.push(await op);
      }
      return results;
    },
    user: createModelDelegate("user"),
    category: {
      ...createModelDelegate("category"),
      upsert: (args: Args) => categoryBrandUpsert("categories", args),
    },
    brand: {
      ...createModelDelegate("brand"),
      upsert: (args: Args) => categoryBrandUpsert("brands", args),
    },
    product: {
      ...createModelDelegate("product"),
      upsert: (args: Args) => {
        const store = getDemoStore();
        const slug = (args.where as RecordLike).slug as string;
        const existing = store.products.find((p) => p.slug === slug);
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: now() });
          return existing;
        }
        const data = args.create as RecordLike;
        const record = { id: nextId("prd"), slug, ...data, createdAt: now(), updatedAt: now() };
        store.products.push(record);
        return record;
      },
    },
    order: createModelDelegate("order"),
    orderItem: createModelDelegate("orderItem"),
    favorite: createModelDelegate("favorite"),
    address: createModelDelegate("address"),
    review: createModelDelegate("review"),
    coupon: {
      ...createModelDelegate("coupon"),
      upsert: (args: Args) => {
        const store = getDemoStore();
        const code = (args.where as RecordLike).code as string;
        const existing = store.coupons.find((c) => c.code === code);
        if (existing) return existing;
        const data = args.create as RecordLike;
        const record = { id: nextId("cpn"), code, ...data, createdAt: now(), updatedAt: now() };
        store.coupons.push(record);
        return record;
      },
    },
    banner: createModelDelegate("banner"),
    passwordResetToken: createModelDelegate("passwordResetToken"),
    vapeProfile: {
      ...createModelDelegate("vapeProfile"),
      upsert: (args: Args) => {
        const store = getDemoStore();
        const userId = (args.where as RecordLike).userId as string;
        const existing = store.vapeProfiles.find((p) => p.userId === userId);
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: now() });
          return existing;
        }
        const data = args.create as RecordLike;
        const record = { id: nextId("vp"), userId, ...data, createdAt: now(), updatedAt: now() };
        store.vapeProfiles.push(record);
        return record;
      },
    },
    vapeRecommendation: createModelDelegate("vapeRecommendation"),
  };
}

function categoryBrandUpsert(collection: "categories" | "brands", args: Args) {
  const store = getDemoStore();
  const slug = (args.where as RecordLike).slug as string;
  const list = store[collection];
  const existing = list.find((c) => c.slug === slug);
  if (existing) {
    Object.assign(existing, args.update, { updatedAt: now() });
    return existing;
  }
  const data = args.create as RecordLike;
  const prefix = collection === "categories" ? "cat" : "br";
  const record = { id: nextId(prefix), slug, ...data, createdAt: now(), updatedAt: now() };
  list.push(record);
  return record;
}
