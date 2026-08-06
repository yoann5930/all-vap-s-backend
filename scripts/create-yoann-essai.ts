import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "yoann.essai@allvaps.fr";
  const password = "YoannEssai2026!";
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      firstName: "Yoann",
      lastName: "Essai",
      phone: "06 12 34 56 78",
      emailVerified: true,
      role: "CUSTOMER",
      loyaltyPoints: 120,
    },
    create: {
      email,
      passwordHash,
      firstName: "Yoann",
      lastName: "Essai",
      phone: "06 12 34 56 78",
      emailVerified: true,
      role: "CUSTOMER",
      loyaltyPoints: 120,
    },
  });

  await prisma.vapeProfile.upsert({
    where: { userId: user.id },
    update: {
      status: "confirme",
      cigarettesPerDay: 10,
      drawPreference: "serre",
      preferredFlavors: ["fruite", "frais"],
      avoidedFlavors: ["classic"],
      usedNicotineMg: 6,
      advisedNicotineMg: 6,
      gdprConsent: true,
      personalizedEnabled: true,
    },
    create: {
      userId: user.id,
      status: "confirme",
      cigarettesPerDay: 10,
      drawPreference: "serre",
      preferredFlavors: ["fruite", "frais"],
      avoidedFlavors: ["classic"],
      usedNicotineMg: 6,
      advisedNicotineMg: 6,
      gdprConsent: true,
      personalizedEnabled: true,
    },
  });

  const existingAddr = await prisma.address.findFirst({
    where: { userId: user.id, isDefault: true },
  });
  if (!existingAddr) {
    await prisma.address.create({
      data: {
        userId: user.id,
        label: "Domicile",
        firstName: "Yoann",
        lastName: "Essai",
        street: "12 Rue de la Vape",
        city: "Hautmont",
        postalCode: "59330",
        country: "FR",
        phone: "06 12 34 56 78",
        isDefault: true,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        id: user.id,
        email,
        password,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
