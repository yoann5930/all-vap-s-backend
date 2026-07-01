import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 10000);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    name: "All Vap's Backend",
    status: "online",
    version: "0.1.0"
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  category: z.string().min(2),
  brand: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
  stock: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});

app.get("/api/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" }
  });

  res.json(products);
});

app.post("/api/products", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const product = await prisma.product.create({
    data: parsed.data
  });

  res.status(201).json(product);
});

const orderSchema = z.object({
  customerEmail: z.string().email(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive()
  })).min(1)
});

app.post("/api/orders", async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const productIds = parsed.data.items.map(item => item.productId);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true }
  });

  const totalCents = parsed.data.items.reduce((total, item) => {
    const product = products.find(p => p.id === item.productId);
    return total + ((product?.priceCents || 0) * item.quantity);
  }, 0);

  const customer = await prisma.customer.upsert({
    where: { email: parsed.data.customerEmail },
    update: {},
    create: { email: parsed.data.customerEmail }
  });

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      totalCents,
      items: {
        create: parsed.data.items.map(item => {
          const product = products.find(p => p.id === item.productId);

          return {
            productId: item.productId,
            quantity: item.quantity,
            priceCents: product?.priceCents || 0
          };
        })
      }
    },
    include: { items: true }
  });

  res.status(201).json(order);
});

app.post("/api/viva/create-payment", async (req, res) => {
  res.json({
    message: "Paiement Viva.com à configurer",
    order: req.body
  });
});

app.post("/api/viva/webhook", async (req, res) => {
  res.json({ received: true });
});

app.listen(port, () => {
  console.log(`All Vap's backend running on port ${port}`);
});
